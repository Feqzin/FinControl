import test from "node:test";
import assert from "node:assert/strict";
import type { Divida } from "../../../shared/schema.js";
import { DividasService } from "../../services/dividas.service.js";

function buildDivida(id: string, deletedAt: Date | null): Divida {
  return {
    id,
    userId: "user-1",
    pessoaId: "pessoa-1",
    tipo: "pagar",
    valor: "10.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    observacaoPagamento: null,
    comprovantePath: null,
    comprovanteNome: null,
    comprovanteMimeType: null,
    comprovanteTamanho: null,
    comprovanteEnviadoEm: null,
    descricao: null,
    totalParcelas: null,
    valorTotal: null,
    deletedAt,
  };
}

test("dividas list: removed filtra apenas deletedAt preenchido mesmo sem getDividasByStatus", async () => {
  const ativa = buildDivida("d-ativa", null);
  const removida = buildDivida("d-removida", new Date("2026-05-01T00:00:00.000Z"));

  const service = new DividasService({
    getDividas: async () => [ativa, removida],
  } as any);

  const removed = await service.list("user-1", "removed");
  const active = await service.list("user-1", "active");

  assert.deepEqual(removed.map((item) => item.id), ["d-removida"]);
  assert.deepEqual(active.map((item) => item.id), ["d-ativa"]);
});

test("dividas list: filtro de removed prevalece mesmo se repositório retornar itens mistos", async () => {
  const ativa = buildDivida("d-ativa", null);
  const removida = buildDivida("d-removida", new Date("2026-05-01T00:00:00.000Z"));

  const service = new DividasService({
    getDividasByStatus: async () => [ativa, removida],
    getDividas: async () => [ativa],
  } as any);

  const removed = await service.list("user-1", "removed");
  assert.deepEqual(removed.map((item) => item.id), ["d-removida"]);
});
