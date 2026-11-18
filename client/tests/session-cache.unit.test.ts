import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { replaceSessionCache } from "../src/lib/session-cache";

test("sair e entrar em outra conta remove dados financeiros e preferências em cache", async () => {
  const client = new QueryClient();
  client.setQueryData(["/api/auth/me"], { id: "A" });
  client.setQueryData(["/api/dashboard/overview", "2026-11"], { saldo: 100 });
  client.setQueryData(["/api/pessoas"], [{ nome: "Pessoa de A" }]);
  client.setQueryData(["/api/appearance", "A"], { accentColor: "#123456" });
  await replaceSessionCache(client, null);
  assert.equal(client.getQueryData(["/api/auth/me"]), null);
  assert.equal(client.getQueryData(["/api/pessoas"]), undefined);
  assert.equal(client.getQueryData(["/api/dashboard/overview", "2026-11"]), undefined);
  assert.equal(client.getQueryData(["/api/appearance", "A"]), undefined);
  await replaceSessionCache(client, { id: "B" });
  assert.deepEqual(client.getQueryData(["/api/auth/me"]), { id: "B" });
  assert.equal(client.getQueryCache().getAll().length, 1);
  client.clear();
});

test("resposta pendente da conta anterior não repovoa o cache após a troca", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finish!: (data: string[]) => void;
  const request = client.fetchQuery({ queryKey: ["/api/dividas"], queryFn: () => new Promise<string[]>(resolve => { finish = resolve; }) }).catch(() => null);
  await replaceSessionCache(client, { id: "B" });
  finish(["dívida de A"]);
  await request;
  assert.equal(client.getQueryData(["/api/dividas"]), undefined);
  assert.deepEqual(client.getQueryData(["/api/auth/me"]), { id: "B" });
  client.clear();
});
