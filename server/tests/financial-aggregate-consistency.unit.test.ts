import test from "node:test";
import assert from "node:assert/strict";
import type { CompraCartao, Divida, Parcela, ParcelaCompra } from "@shared/schema";
import {
  DOMAIN_STATUS,
  recomputeCardPurchaseAggregate,
  recomputeDebtAggregate,
} from "../services/financial-aggregate-consistency";

function buildDivida(): Divida {
  return {
    id: "divida-1",
    userId: "user-aggregate-unit",
    pessoaId: "pessoa-1",
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida aggregate unit",
    totalParcelas: 2,
    valorTotal: "200.00",
  };
}

test("recomputeDebtAggregate deriva status pago quando todas parcelas estao pagas", async () => {
  const divida = buildDivida();
  const parcelas: Parcela[] = [
    {
      id: "p1",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-05-01",
      status: "pago",
      dataPagamento: "2026-05-01",
      formaPagamento: "pix",
    },
    {
      id: "p2",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-06-01",
      status: "pago",
      dataPagamento: "2026-06-01",
      formaPagamento: "pix",
    },
  ];

  const repository = {
    getDivida: async () => divida,
    getParcelasByDivida: async () => parcelas,
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      Object.assign(divida, patch);
      return divida;
    },
  };

  const result = await recomputeDebtAggregate(repository as any, divida.id, divida.userId);

  assert.equal(result.sourceOfTruth, "parcelas");
  assert.equal(result.derivedStatus, DOMAIN_STATUS.pago);
  assert.equal(result.persistedStatus, "pago");
  assert.equal(divida.status, "pago");
  assert.equal(divida.dataPagamento, "2026-06-01");
});

test("recomputeDebtAggregate deriva status pendente quando restam parcelas", async () => {
  const divida = buildDivida();
  const parcelas: Parcela[] = [
    {
      id: "p1",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-05-01",
      status: "pago",
      dataPagamento: "2026-05-01",
      formaPagamento: "pix",
    },
    {
      id: "p2",
      userId: divida.userId,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-06-01",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ];

  const repository = {
    getDivida: async () => divida,
    getParcelasByDivida: async () => parcelas,
    updateDivida: async (_id: string, _userId: string, patch: Partial<Divida>) => {
      Object.assign(divida, patch);
      return divida;
    },
  };

  const result = await recomputeDebtAggregate(repository as any, divida.id, divida.userId);

  assert.equal(result.derivedStatus, DOMAIN_STATUS.parcial);
  assert.equal(result.persistedStatus, "pendente");
  assert.equal(divida.status, "pendente");
  assert.equal(divida.dataPagamento, null);
});

test("recomputeCardPurchaseAggregate recalcula parcelaAtual e totais", async () => {
  const compra: CompraCartao = {
    id: "compra-1",
    userId: "user-aggregate-unit",
    cartaoId: "cartao-1",
    descricao: "Compra aggregate unit",
    valorTotal: "300.00",
    parcelas: 3,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-04-01",
    pessoaId: "pessoa-1",
    statusPessoa: "pendente",
    dataPagamentoPessoa: null,
    iconeId: null,
  };

  const parcelasCompra: ParcelaCompra[] = [
    {
      id: "pc-1",
      userId: compra.userId,
      compraCartaoId: compra.id,
      numero: 1,
      valor: "60.00",
      dataVencimento: "2026-04-01",
      statusCartao: "pago",
      dataPagamentoCartao: "2026-04-01",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-04-01",
    },
    {
      id: "pc-2",
      userId: compra.userId,
      compraCartaoId: compra.id,
      numero: 2,
      valor: "40.00",
      dataVencimento: "2026-05-01",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
  ];

  const repository = {
    getCompraCartao: async () => compra,
    getParcelasCompra: async () => parcelasCompra,
    updateCompraCartao: async (_id: string, _userId: string, patch: Partial<CompraCartao>) => {
      Object.assign(compra, patch);
      return compra;
    },
  };

  const result = await recomputeCardPurchaseAggregate(repository as any, compra.id, compra.userId);

  assert.equal(result.sourceOfTruth, "parcelas_compra");
  assert.equal(result.derivedCardStatus, DOMAIN_STATUS.pendente);
  assert.equal(compra.valorTotal, "100.00");
  assert.equal(compra.valorParcela, "40.00");
  assert.equal(compra.parcelaAtual, 2);
  assert.equal(compra.statusPessoa, "pendente");
});

test("recomputeCardPurchaseAggregate nao marca compra como reembolsada quando ainda existe parcela sem statusPessoa", async () => {
  const compra: CompraCartao = {
    id: "compra-2",
    userId: "user-aggregate-unit",
    cartaoId: "cartao-1",
    descricao: "Compra com ultima parcela sem reembolso",
    valorTotal: "226.66",
    parcelas: 2,
    parcelaAtual: 2,
    valorParcela: "113.33",
    dataCompra: "2026-04-01",
    pessoaId: "pessoa-1",
    statusPessoa: "pago",
    dataPagamentoPessoa: "2026-05-01",
    iconeId: null,
  };

  const parcelasCompra: ParcelaCompra[] = [
    {
      id: "pc-21",
      userId: compra.userId,
      compraCartaoId: compra.id,
      numero: 1,
      valor: "113.33",
      dataVencimento: "2030-04-10",
      statusCartao: "pago",
      dataPagamentoCartao: "2030-04-10",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2030-04-11",
    },
    {
      id: "pc-22",
      userId: compra.userId,
      compraCartaoId: compra.id,
      numero: 2,
      valor: "113.33",
      dataVencimento: "2030-05-10",
      statusCartao: "pago",
      dataPagamentoCartao: "2030-05-10",
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];

  const repository = {
    getCompraCartao: async () => compra,
    getParcelasCompra: async () => parcelasCompra,
    updateCompraCartao: async (_id: string, _userId: string, patch: Partial<CompraCartao>) => {
      Object.assign(compra, patch);
      return compra;
    },
  };

  const result = await recomputeCardPurchaseAggregate(repository as any, compra.id, compra.userId);

  assert.equal(result.derivedCardStatus, DOMAIN_STATUS.pago);
  assert.equal(result.derivedPessoaStatus, DOMAIN_STATUS.parcial);
  assert.equal(compra.statusPessoa, "pendente");
  assert.equal(compra.dataPagamentoPessoa, null);
});
