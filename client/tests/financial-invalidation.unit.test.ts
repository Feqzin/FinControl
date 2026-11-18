import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { invalidateFinancialQueries } from "../src/lib/financial-query-invalidation";

test("uma alteração invalida painel e resumos de todos os meses mesmo com cache permanente", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const keys = [
    ["/api/dashboard/overview", "2026-10"],
    ["/api/dashboard/overview", "2026-11"],
    ["/api/financial/summary", "2026-11"],
    ["/api/pessoas", "includeResumo=true"],
  ];
  for (const key of keys) client.setQueryData(key, { total: 100 });
  client.setQueryData(["/api/appearance", "user-1"], { accent: "blue" });

  await invalidateFinancialQueries(client);

  for (const key of keys) {
    assert.equal(client.getQueryState(key)?.isInvalidated, true, JSON.stringify(key));
  }
  assert.equal(client.getQueryState(["/api/appearance", "user-1"])?.isInvalidated, false);
});
