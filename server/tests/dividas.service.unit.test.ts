import test from "node:test";
import assert from "node:assert/strict";
import type { Divida, Parcela } from "@shared/schema";
import { DividasService } from "../services/dividas.service";

function buildDividaBase(): Divida {
  return {
    id: "divida-1",
    userId: "user-dividas-unit",
    pessoaId: "pessoa-1",
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-06-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida de teste",
    totalParcelas: 3,
    valorTotal: "300.00",
  };
}

test("createParcelado cria divida e parcelas com distribuicao monetaria consistente", async () => {
  const createdParcelasInput: Array<Record<string, unknown>> = [];
  let createdDividaInput: Record<string, unknown> | null = null;
  const createdParcelas: Parcela[] = [];
  const divida = {
    ...buildDividaBase(),
    id: "divida-nova",
    valor: "33.33",
    valorTotal: "100.00",
    totalParcelas: 3,
    dataVencimento: "2026-06-10",
  };

  const repository = {
    getPessoa: async () => ({ id: "pessoa-1" }),
    createDivida: async (row: Record<string, unknown>) => {
      createdDividaInput = row;
      Object.assign(divida, { id: "divida-nova", ...row });
      return divida as Divida;
    },
    createParcelasBulk: async (rows: Array<Record<string, unknown>>) => {
      createdParcelasInput.push(...rows);
      const built = rows.map((row, index) => ({
        id: `parcela-${index + 1}`,
        ...row,
      })) as Parcela[];
      createdParcelas.push(...built);
      return built;
    },
    getDivida: async () => divida as Divida,
    getParcelasByDivida: async () => createdParcelas,
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      Object.assign(divida, patch);
      return divida as Divida;
    },
  };

  const service = new DividasService(repository as any);
  const result = await service.createParcelado(
    {
      pessoaId: "pessoa-1",
      tipo: "pagar",
      valorTotal: 100,
      totalParcelas: 3,
      primeiroVencimento: "2026-06-10",
      descricao: "Teste parcelado",
      formaPagamento: "pix",
    },
    "user-dividas-unit",
  );

  assert.equal(result.divida.totalParcelas, 3);
  assert.equal(result.divida.valorTotal, "100.00");
  assert.equal(result.divida.valor, "33.33");
  assert.equal(result.parcelas.length, 3);

  const valores = result.parcelas.map((row) => row.valor);
  assert.deepEqual(valores, ["33.33", "33.33", "33.34"]);

  const somaParcelas = result.parcelas.reduce((sum, row) => sum + Number(row.valor), 0);
  assert.equal(Number(somaParcelas.toFixed(2)), 100);

  assert.ok(createdDividaInput);
  assert.equal(createdDividaInput?.valorTotal, "100.00");
  assert.equal(createdParcelasInput.length, 3);
  assert.equal(createdParcelasInput[0]?.dataVencimento, "2026-06-10");
  assert.equal(createdParcelasInput[1]?.dataVencimento, "2026-07-10");
  assert.equal(createdParcelasInput[2]?.dataVencimento, "2026-08-10");
});

test("recalcular redistribui somente parcelas pendentes apos pagamento parcial", async () => {
  const divida = buildDividaBase();
  const parcelas: Parcela[] = [
    {
      id: "parc-1",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-06-10",
      status: "pago",
      dataPagamento: "2026-06-10",
      formaPagamento: "pix",
    },
    {
      id: "parc-2",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-07-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
    {
      id: "parc-3",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 3,
      valor: "100.00",
      dataVencimento: "2026-08-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ];
  const deletedIds: string[] = [];
  const dividaUpdatePayloads: Record<string, unknown>[] = [];

  const repository = {
    getDivida: async () => divida,
    getParcelasByDivida: async () => [...parcelas],
    deleteParcela: async (id: string) => {
      const index = parcelas.findIndex((row) => row.id === id);
      if (index >= 0) parcelas.splice(index, 1);
      deletedIds.push(id);
      return true;
    },
    createParcelasBulk: async (rows: Array<Record<string, unknown>>) => {
      const created = rows.map((row, index) => ({
        id: `parc-nova-${index + 1}`,
        ...row,
      })) as Parcela[];
      parcelas.push(...created);
      return created;
    },
    updateDivida: async (_id: string, _userId: string, payload: Record<string, unknown>) => {
      dividaUpdatePayloads.push(payload);
      Object.assign(divida, payload);
      return divida as Divida;
    },
  };

  const service = new DividasService(repository as any);
  const result = await service.recalcular(divida.id, divida.userId, {
    novoTotal: 4,
    primeiroVencimento: "2026-09-10",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("Recalculo deveria retornar sucesso");
  }
  assert.deepEqual(result.data, {
    pagas: 1,
    novas: 3,
    valorRestante: "200.00",
  });

  assert.deepEqual(deletedIds.sort(), ["parc-2", "parc-3"]);

  const paidRows = parcelas.filter((row) => row.status === "pago");
  const pendingRows = parcelas.filter((row) => row.status === "pendente").sort((a, b) => a.numero - b.numero);
  assert.equal(paidRows.length, 1);
  assert.equal(pendingRows.length, 3);
  assert.deepEqual(pendingRows.map((row) => row.numero), [2, 3, 4]);
  assert.deepEqual(pendingRows.map((row) => row.dataVencimento), ["2026-09-10", "2026-10-10", "2026-11-10"]);

  const somaPendentes = pendingRows.reduce((sum, row) => sum + Number(row.valor), 0);
  assert.equal(Number(somaPendentes.toFixed(2)), 200);

  assert.ok(dividaUpdatePayloads.length >= 1);
  assert.deepEqual(dividaUpdatePayloads.at(-1), {
    totalParcelas: 4,
    valorTotal: "300.00",
    valor: "66.66",
    dataVencimento: "2026-09-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
  });
});

test("update aceita quitar divida simples sem forma de pagamento explicita", async () => {
  const divida = {
    ...buildDividaBase(),
    totalParcelas: null,
    valorTotal: null,
  };
  const updatePayloads: Array<Partial<Divida>> = [];

  const repository = {
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      updatePayloads.push(patch);
      Object.assign(divida, patch);
      return divida as Divida;
    },
    getDivida: async () => divida as Divida,
    getParcelasByDivida: async () => [] as Parcela[],
  };

  const service = new DividasService(repository as any);
  const updated = await service.update(divida.id, divida.userId, {
    status: "pago",
    dataPagamento: "2026-06-20",
  });

  assert.ok(updated);
  assert.equal(updated?.status, "pago");
  assert.equal(updated?.dataPagamento, "2026-06-20");
  assert.equal(updated?.formaPagamento, null);
  assert.equal(updatePayloads.length, 1);
  assert.deepEqual(updatePayloads[0], {
    status: "pago",
    dataPagamento: "2026-06-20",
  });
});
