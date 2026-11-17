import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Pool } from "pg";
import { once } from "node:events";
import { registerDashboardShortcutsRoutes } from "../dashboard-shortcuts-routes";

test("atalhos exigem autenticação, validam escolhas e isolam cada conta", async () => {
  const saved = new Map<string, string[]>();
  const pool = {
    async query(sql: string, params: unknown[]) {
      const userId = params[0] as string;
      if (sql.startsWith("SELECT")) {
        return { rows: saved.has(userId) ? [{ shortcuts: saved.get(userId) }] : [] };
      }
      saved.set(userId, JSON.parse(params[1] as string) as string[]);
      return { rows: [] };
    },
  } as unknown as Pool;

  const app = express();
  app.use(express.json());
  registerDashboardShortcutsRoutes(app, pool, (req, res, next) => {
    const id = req.header("x-test-user");
    if (!id) return res.sendStatus(401);
    req.user = { id } as Express.User;
    next();
  });

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/dashboard/shortcuts`;

    assert.equal((await fetch(url)).status, 401);
    assert.deepEqual(await (await fetch(url, { headers: { "x-test-user": "a" } })).json(), { shortcuts: null });

    const put = (id: string, shortcuts: unknown) => fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-user": id },
      body: JSON.stringify({ shortcuts }),
    });
    assert.equal((await put("a", ["/pessoas", "/pessoas"])).status, 400);
    assert.equal((await put("a", ["/admin"])).status, 400);
    assert.equal((await put("a", ["/renda", "/servicos"])).status, 200);
    assert.deepEqual(await (await fetch(url, { headers: { "x-test-user": "a" } })).json(), {
      shortcuts: ["/renda", "/servicos"],
    });
    assert.deepEqual(await (await fetch(url, { headers: { "x-test-user": "b" } })).json(), { shortcuts: null });
    assert.equal((await put("a", [])).status, 200);
    assert.deepEqual(await (await fetch(url, { headers: { "x-test-user": "a" } })).json(), { shortcuts: [] });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
