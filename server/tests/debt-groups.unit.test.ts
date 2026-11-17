import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { registerDebtGroupsRoutes } from "../debt-groups-routes";

async function scenario(run: (base: string, calls: Array<{ sql: string; args: unknown[] }>) => Promise<void>) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const rows: Array<{ id: string; userId: string; name: string; debtIds: string[] }> = [];
  const pool = { query: async (sql: string, args: unknown[]) => {
    calls.push({ sql, args });
    if (sql.startsWith("SELECT 'manual:'")) return { rows: (args[1] as string[]).filter(id => id === "manual:owned-1").map(id => ({ id })) };
    if (sql.startsWith("INSERT")) { const row = { id: "group-1", userId: args[0] as string, name: args[1] as string, debtIds: JSON.parse(args[2] as string) }; rows.push(row); return { rows: [row] }; }
    if (sql.startsWith("UPDATE")) { const row = rows.find(row => row.userId === args[0] && row.id === args[3]); if (!row) return { rows: [] }; row.name = args[1] as string; row.debtIds = JSON.parse(args[2] as string); return { rows: [row] }; }
    return { rows: rows.filter(row => row.userId === args[0]) };
  } };
  const app = express();
  app.use(express.json());
  registerDebtGroupsRoutes(app, pool as any, (req, res, next) => {
    if (!req.headers["x-test-user"]) { res.sendStatus(401); return; }
    (req as any).user = { id: req.headers["x-test-user"] }; next();
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as any).port}`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const headers = { "content-type": "application/json", "x-test-user": "owner" };

test("grupos exigem autenticação e rejeitam referências a dívidas de outra conta", async () => scenario(async (base, calls) => {
  assert.equal((await fetch(`${base}/api/debt-groups`)).status, 401);
  const response = await fetch(`${base}/api/debt-groups`, { method: "POST", headers, body: JSON.stringify({ name: "Casa", debtIds: ["manual:other-1"] }) });
  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.sql.startsWith("INSERT")), false);
}));

test("cria e edita grupo persistido isolando leitura e atualização por usuário", async () => scenario(async (base) => {
  const created = await fetch(`${base}/api/debt-groups`, { method: "POST", headers, body: JSON.stringify({ name: " Casa ", debtIds: ["manual:owned-1", "manual:owned-1"] }) });
  assert.equal(created.status, 201);
  const group = await created.json(); assert.equal(group.name, "Casa"); assert.deepEqual(group.debtIds, ["manual:owned-1"]);
  const otherHeaders = { ...headers, "x-test-user": "other" };
  assert.deepEqual(await (await fetch(`${base}/api/debt-groups`, { headers: otherHeaders })).json(), []);
  assert.equal((await fetch(`${base}/api/debt-groups/${group.id}`, { method: "PATCH", headers: otherHeaders, body: JSON.stringify({ name: "Alterado", debtIds: [] }) })).status, 404);
  assert.equal((await fetch(`${base}/api/debt-groups/${group.id}`, { method: "PATCH", headers, body: JSON.stringify({ name: "Família", debtIds: [] }) })).status, 200);
  const saved = await (await fetch(`${base}/api/debt-groups`, { headers })).json(); assert.equal(saved[0].name, "Família"); assert.deepEqual(saved[0].debtIds, []);
}));

test("valida nome e permite criar grupo vazio", async () => scenario(async (base) => {
  for (const name of [" ", "x".repeat(61)]) assert.equal((await fetch(`${base}/api/debt-groups`, { method: "POST", headers, body: JSON.stringify({ name, debtIds: [] }) })).status, 400);
  assert.equal((await fetch(`${base}/api/debt-groups`, { method: "POST", headers, body: JSON.stringify({ name: "Viagem", debtIds: [] }) })).status, 201);
}));
