import test from "node:test";
import assert from "node:assert/strict";
import { moveDashboardShortcut } from "../../shared/dashboard-shortcuts";

test("arrastar um atalho no Painel muda a ordem sem perder outros botões", () => {
  const current = ["/pessoas", "/renda", "/servicos", "/metas"];
  assert.deepEqual(moveDashboardShortcut(current, "/pessoas", "/servicos"), [
    "/renda", "/servicos", "/pessoas", "/metas",
  ]);
  assert.deepEqual(moveDashboardShortcut(current, "/metas", "/renda"), [
    "/pessoas", "/metas", "/renda", "/servicos",
  ]);
  assert.deepEqual(current, ["/pessoas", "/renda", "/servicos", "/metas"]);
  assert.equal(moveDashboardShortcut(current, "/pessoas", "/inexistente"), current);
});
