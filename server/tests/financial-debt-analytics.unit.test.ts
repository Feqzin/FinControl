import test from "node:test";
import assert from "node:assert/strict";
import type { Divida, Parcela } from "@shared/schema";
import {
  getDebtObligations,
  getDebtPortfolioSummary,
  getMonthlyDebtObligations,
  getMonthlyReceivedDebtObligations,
  getOutstandingDebtInstallments,
} from "../services/financial-debt-analytics";

const userId = "user-debt-analytics";

function buildDividas(): Divida[] {
  return [
    {
      id: "d-simple",
      userId,
      pessoaId: "p1",
      tipo: "pagar",
      valor: "300.00",
      dataVencimento: "2026-04-15",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida simples",
      totalParcelas: null,
      valorTotal: null,
    },
    {
      id: "d-parcelada",
      userId,
      pessoaId: "p2",
      tipo: "receber",
      valor: "200.00",
      dataVencimento: "2026-04-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida parcelada",
      totalParcelas: 2,
      valorTotal: "400.00",
    },
  ];
}

function buildParcelas(): Parcela[] {
  return [
    {
      id: "pc-1",
      userId,
      dividaId: "d-parcelada",
      numero: 1,
      valor: "200.00",
      dataVencimento: "2026-04-10",
      status: "pago",
      dataPagamento: "2026-04-10",
      formaPagamento: "pix",
    },
    {
      id: "pc-2",
      userId,
      dividaId: "d-parcelada",
      numero: 2,
      valor: "200.00",
      dataVencimento: "2026-05-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ];
}

test("getDebtObligations gera obrigacoes por parcela para dividas parceladas e por pai para simples", () => {
  const obligations = getDebtObligations({
    dividas: buildDividas(),
    parcelas: buildParcelas(),
  });

  assert.equal(obligations.length, 3);
  assert.equal(obligations.filter((row) => row.source === "divida").length, 1);
  assert.equal(obligations.filter((row) => row.source === "parcela").length, 2);
});

test("getOutstandingDebtInstallments retorna apenas obrigacoes pendentes", () => {
  const outstanding = getOutstandingDebtInstallments({
    dividas: buildDividas(),
    parcelas: buildParcelas(),
  });

  assert.equal(outstanding.length, 2);
  assert.deepEqual(outstanding.map((row) => row.dividaId).sort(), ["d-parcelada", "d-simple"]);
});

test("getMonthlyDebtObligations filtra pendencias pelo mes de vencimento real", () => {
  const april = getMonthlyDebtObligations({
    dividas: buildDividas(),
    parcelas: buildParcelas(),
  }, "2026-04");
  const may = getMonthlyDebtObligations({
    dividas: buildDividas(),
    parcelas: buildParcelas(),
  }, "2026-05");

  assert.equal(april.length, 1);
  assert.equal(april[0]?.dividaId, "d-simple");
  assert.equal(may.length, 1);
  assert.equal(may[0]?.dividaId, "d-parcelada");
});

test("recebiveis mensais excluem divida sem expectativa, mas entrada realizada usa a data do pagamento", () => {
  const semExpectativa: Divida = {
    id: "d-sem-expectativa",
    userId,
    pessoaId: "p3",
    tipo: "receber",
    valor: "500.00",
    dataVencimento: "2026-07-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Acordo não cumprido",
    expectativaRecebimento: false,
    totalParcelas: null,
    valorTotal: null,
  };
  const recebida: Divida = {
    ...semExpectativa,
    id: "d-recebida",
    valor: "120.00",
    status: "pago",
    dataPagamento: "2026-07-20",
  };

  const expected = getMonthlyDebtObligations({
    dividas: [semExpectativa, recebida],
    parcelas: [],
  }, "2026-07");
  const received = getMonthlyReceivedDebtObligations({
    dividas: [semExpectativa, recebida],
    parcelas: [],
  }, "2026-07");

  assert.equal(expected.length, 0);
  assert.deepEqual(received.map((row) => row.dividaId), ["d-recebida"]);
  assert.equal(received[0]?.valor, "120.00");
});

test("getDebtPortfolioSummary separa total contratado e saldo pendente", () => {
  const summary = getDebtPortfolioSummary({
    dividas: buildDividas(),
    parcelas: buildParcelas(),
  });

  assert.equal(summary.totalContratado, 700);
  assert.equal(summary.totalPendente, 500);
  assert.equal(summary.totalPago, 200);
  assert.equal(summary.pendentePorTipo.pagar, 300);
  assert.equal(summary.pendentePorTipo.receber, 200);
  assert.equal(summary.obrigacoes.total, 3);
  assert.equal(summary.obrigacoes.pagas, 1);
  assert.equal(summary.obrigacoes.pendentes, 2);
});

test("divida 12x usa cronograma real para total pago, saldo pendente e obrigacao mensal", () => {
  const divida12x: Divida = {
    id: "d-12x",
    userId,
    pessoaId: "p12",
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-01-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida 12x",
    totalParcelas: 12,
    valorTotal: "1200.00",
  };

  const parcelas12x: Parcela[] = Array.from({ length: 12 }, (_, index) => {
    const numero = index + 1;
    const month = String(numero).padStart(2, "0");
    const paid = numero <= 3;
    return {
      id: `d12x-p${numero}`,
      userId,
      dividaId: divida12x.id,
      numero,
      valor: "100.00",
      dataVencimento: `2026-${month}-10`,
      status: paid ? "pago" : "pendente",
      dataPagamento: paid ? `2026-${month}-10` : null,
      formaPagamento: paid ? "pix" : null,
    };
  });

  const summary = getDebtPortfolioSummary({
    dividas: [divida12x],
    parcelas: parcelas12x,
  });

  assert.equal(summary.totalContratado, 1200);
  assert.equal(summary.totalPago, 300);
  assert.equal(summary.totalPendente, 900);
  assert.equal(summary.obrigacoes.total, 12);
  assert.equal(summary.obrigacoes.pagas, 3);
  assert.equal(summary.obrigacoes.pendentes, 9);

  const monthlyOctober = getMonthlyDebtObligations({
    dividas: [divida12x],
    parcelas: parcelas12x,
  }, "2026-10");

  assert.equal(monthlyOctober.length, 1);
  assert.equal(monthlyOctober[0]?.source, "parcela");
  assert.equal(monthlyOctober[0]?.numero, 10);
  assert.equal(monthlyOctober[0]?.valor, "100.00");
});

test("obrigacoes canceladas nao entram como saldo pendente nem obrigacao mensal", () => {
  const dividas: Divida[] = [
    {
      id: "d-cancelada",
      userId,
      pessoaId: "pc",
      tipo: "pagar",
      valor: "250.00",
      dataVencimento: "2026-04-15",
      status: "cancelado",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida cancelada",
      totalParcelas: null,
      valorTotal: null,
    },
    {
      id: "d-pendente",
      userId,
      pessoaId: "pp",
      tipo: "pagar",
      valor: "100.00",
      dataVencimento: "2026-04-20",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida pendente",
      totalParcelas: null,
      valorTotal: null,
    },
  ];

  const outstanding = getOutstandingDebtInstallments({ dividas, parcelas: [] });
  assert.equal(outstanding.length, 1);
  assert.equal(outstanding[0]?.dividaId, "d-pendente");

  const monthly = getMonthlyDebtObligations({ dividas, parcelas: [] }, "2026-04");
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0]?.dividaId, "d-pendente");

  const summary = getDebtPortfolioSummary({ dividas, parcelas: [] });
  assert.equal(summary.totalContratado, 350);
  assert.equal(summary.totalPendente, 100);
  assert.equal(summary.totalPago, 0);
  assert.equal(summary.obrigacoes.total, 1);
  assert.equal(summary.obrigacoes.pendentes, 1);
  assert.equal(summary.obrigacoes.pagas, 0);
});
