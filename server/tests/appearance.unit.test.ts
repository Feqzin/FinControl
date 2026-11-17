import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { DEFAULT_ACCENT, getAccentTokens, isAccentColor } from "../../shared/appearance";
import { registerDashboardShortcutsRoutes } from "../dashboard-shortcuts-routes";

test("cores aceitam apenas hex completo e têm contraste adaptado", () => {
  assert.equal(isAccentColor("#AABBCC"), true);
  for (const value of ["red", "#fff", "#gggggg", null, "var(--x)"]) assert.equal(isAccentColor(value), false);
  assert.equal(getAccentTokens("#ffffff").foreground, "0 0% 5%");
  assert.equal(getAccentTokens("#000000").foreground, "0 0% 100%");
  assert.equal(getAccentTokens("#ffff00").foreground, "0 0% 5%");
  assert.equal(getAccentTokens("#ffff00").lightText.endsWith("20.0%"), true);
  assert.deepEqual(getAccentTokens("invalid"), getAccentTokens(DEFAULT_ACCENT));
});

test("aparência é autenticada, salva por usuário e valida a cor", async () => {
  const colors = new Map<string, string>();
  const pool = { query: async (sql: string, args: string[]) => {
    if (sql.startsWith("INSERT INTO user_appearance")) { colors.set(args[0], args[1]); return { rows: [] }; }
    return { rows: colors.has(args[0]) ? [{ accent_color: colors.get(args[0]) }] : [] };
  } };
  const app = express(); app.use(express.json());
  registerDashboardShortcutsRoutes(app, pool as any, (req, res, next) => {
    if (!req.headers["x-test-user"]) { res.sendStatus(401); return; }
    (req as any).user = { id: req.headers["x-test-user"] }; next();
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const headers = { "x-test-user": "owner", "content-type": "application/json" };
  try {
    assert.equal((await fetch(`${base}/api/appearance`)).status, 401);
    assert.deepEqual(await (await fetch(`${base}/api/appearance`, { headers })).json(), { accentColor: DEFAULT_ACCENT });
    assert.equal((await fetch(`${base}/api/appearance`, { method: "PUT", headers, body: JSON.stringify({ accentColor: "oops" }) })).status, 400);
    assert.equal((await fetch(`${base}/api/appearance`, { method: "PUT", headers, body: JSON.stringify({ accentColor: "#AABBCC" }) })).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/appearance`, { headers })).json(), { accentColor: "#aabbcc" });
    assert.deepEqual(await (await fetch(`${base}/api/appearance`, { headers: { "x-test-user": "other" } })).json(), { accentColor: DEFAULT_ACCENT });
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
