import test from "node:test";
import assert from "node:assert/strict";
import type { CompraCartao, Divida, Parcela, ParcelaCompra } from "@shared/schema";
import { ParcelasService } from "../services/parcelas.service";

function buildParcela(id: string, numero: number, status: "pendente" | "pago"): Parcela {
  return {
    id,
    userId: "user-parcelas-unit",
    dividaId: "divida-1",
    numero,
    valor: "100.00",
    dataVencimento: "2026-05-01",
    status,
    dataPagamento: status === "pago" ? "2026-04-01" : null,
    formaPagamento: status === "pago" ? "pix" : null,
  };
}

function buildDivida(totalParcelas: number): Divida {
  return {
    id: "divida-1",
    userId: "user-parcelas-unit",
    pessoaId: "pessoa-1",
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida teste",
    totalParcelas,
    valorTotal: String(totalParcelas * 100),
  };
}

test("antecipar marca parcelas e mantem agregado da divida coerente", async () => {
  const parcelas = [
    buildParcela("p1", 1, "pendente"),
    buildParcela("p2", 2, "pendente"),
  ];
  const divida = buildDivida(2);
  let dividaUpdated = 0;

  const repository = {
    getDivida: async () => divida,
    getParcelasByDivida: async () => parcelas,
    updateParcela: async (id: string, _userId: string, data: Partial<Parcela>) => {
      const row = parcelas.find((item) => item.id === id);
      assert.ok(row);
      Object.assign(row, data);
      return row;
    },
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      dividaUpdated += 1;
      Object.assign(divida, patch);
      return divida;
    },
  };

  const service = new ParcelasService(repository as any);
  const result = await service.antecipar("user-parcelas-unit", {
    dividaId: "divida-1",
    quantidade: 2,
    formaPagamento: "pix",
  });

  assert.equal(result.quantidadeAtualizada, 2);
  assert.equal(result.todasPagas, true);
  assert.ok(dividaUpdated >= 1);
  assert.ok(parcelas.every((item) => item.status === "pago"));
  assert.equal(divida.status, "pago");
  assert.equal(divida.formaPagamento, "pix");
});

test("antecipar parcialmente deixa divida pendente e sem data de quitacao", async () => {
  const parcelas = [
    buildParcela("p1", 1, "pendente"),
    buildParcela("p2", 2, "pendente"),
    buildParcela("p3", 3, "pendente"),
  ];
  const divida = buildDivida(3);

  const repository = {
    getDivida: async () => divida,
    getParcelasByDivida: async () => parcelas,
    updateParcela: async (id: string, _userId: string, data: Partial<Parcela>) => {
      const row = parcelas.find((item) => item.id === id);
      assert.ok(row);
      Object.assign(row, data);
      return row;
    },
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      Object.assign(divida, patch);
      return divida;
    },
  };

  const service = new ParcelasService(repository as any);
  const result = await service.antecipar("user-parcelas-unit", {
    dividaId: "divida-1",
    quantidade: 1,
    formaPagamento: "cartao",
  });

  assert.equal(result.quantidadeAtualizada, 1);
  assert.equal(result.todasPagas, false);
  assert.equal(parcelas.filter((item) => item.status === "pago").length, 1);
  assert.equal(divida.status, "pendente");
  assert.equal(divida.dataPagamento, null);
  assert.equal(divida.formaPagamento, null);
});

test("update de parcela sincroniza status da divida pai", async () => {
  const parcela = buildParcela("p1", 1, "pendente");
  const parcelas = [parcela];
  const divida = buildDivida(1);
  let dividaUpdated = 0;

  const repository = {
    getDivida: async () => divida,
    getParcelasByDivida: async () => parcelas,
    updateParcela: async (_id: string, _userId: string, data: Partial<Parcela>) => {
      Object.assign(parcela, data);
      return parcela;
    },
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      dividaUpdated += 1;
      Object.assign(divida, patch);
      return divida;
    },
  };

  const service = new ParcelasService(repository as any);
  const updated = await service.update("p1", "user-parcelas-unit", {
    status: "pago",
    dataPagamento: "2026-04-20",
    formaPagamento: "pix",
  });

  assert.ok(updated);
  assert.equal(updated.status, "pago");
  assert.equal(dividaUpdated, 1);
  assert.equal(divida.status, "pago");
  assert.equal(divida.dataPagamento, "2026-04-20");
});

test("listagem de parcelas_compra e read-only quando nao existe cronograma", async () => {
  const compra: CompraCartao = {
    id: "compra-1",
    userId: "user-parcelas-unit",
    cartaoId: "c1",
    descricao: "Curso",
    valorTotal: "300.00",
    parcelas: 3,
    parcelaAtual: 2,
    valorParcela: "100.00",
    dataCompra: "2026-03-15",
    pessoaId: "pessoa-1",
    statusPessoa: "pendente",
    dataPagamentoPessoa: null,
    iconeId: null,
  };
  let createCalled = false;

  const repository = {
    getCompraCartao: async () => compra,
    getParcelasCompra: async () => [] as ParcelaCompra[],
    createParcelasCompraBulk: async (_rows: ParcelaCompra[]) => {
      createCalled = true;
      return [] as ParcelaCompra[];
    },
  };

  const service = new ParcelasService(repository as any);
  const result = await service.listParcelasCompra("compra-1", "user-parcelas-unit");

  if ("error" in result) {
    assert.fail("Nao deveria retornar erro");
  }

  assert.equal(result.rows.length, 0);
  assert.equal(createCalled, false);
});
