import test from "node:test";
import assert from "node:assert/strict";
import type { Cartao, CompraCartao, Divida, Parcela, ParcelaCompra, Renda, Servico } from "@shared/schema";
import { addMonths, format } from "date-fns";
import { FinancialService } from "../services/financial.service";

type FinancialFixture = {
  dividas: Divida[];
  parcelas: Parcela[];
  parcelasCompra: ParcelaCompra[];
  servicos: Servico[];
  cartoes: Cartao[];
  compras: CompraCartao[];
  rendas: Renda[];
};

function createService(fixture: FinancialFixture): FinancialService {
  const repository = {
    getDividas: async () => fixture.dividas,
    getParcelas: async () => fixture.parcelas,
    getParcelasCompraByUser: async () => fixture.parcelasCompra,
    getServicos: async () => fixture.servicos,
    getCartoes: async () => fixture.cartoes,
    getComprasCartao: async () => fixture.compras,
    getRendas: async () => fixture.rendas,
  };

  return new FinancialService(repository as any);
}

function buildBaseFixture(): FinancialFixture {
  const userId = "user-financial-unit";
  return {
    dividas: [
      {
        id: "d1",
        userId,
        pessoaId: "p1",
        tipo: "receber",
        valor: "500.00",
        dataVencimento: "2026-04-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Cliente A",
        totalParcelas: null,
        valorTotal: null,
      },
      {
        id: "d2",
        userId,
        pessoaId: "p2",
        tipo: "pagar",
        valor: "300.00",
        dataVencimento: "2026-04-15",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Fornecedor B",
        totalParcelas: null,
        valorTotal: null,
      },
      {
        id: "d3",
        userId,
        pessoaId: "p3",
        tipo: "pagar",
        valor: "100.00",
        dataVencimento: "2026-03-10",
        status: "pago",
        dataPagamento: "2026-03-11",
        formaPagamento: "pix",
        descricao: "Despesa antiga",
        totalParcelas: null,
        valorTotal: null,
      },
    ],
    parcelas: [
      {
        id: "parc-1",
        userId,
        dividaId: "d2",
        numero: 1,
        valor: "50.00",
        dataVencimento: "2026-04-12",
        status: "pago",
        dataPagamento: "2026-04-12",
        formaPagamento: "pix",
      },
      {
        id: "parc-2",
        userId,
        dividaId: "d2",
        numero: 2,
        valor: "50.00",
        dataVencimento: "2026-05-12",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ],
    parcelasCompra: [],
    servicos: [
      {
        id: "s1",
        userId,
        nome: "Internet",
        categoria: "utilidades",
        valorMensal: "100.00",
        dataCobranca: 10,
        formaPagamento: "debito",
        status: "ativo",
        iconeId: null,
      },
    ],
    cartoes: [
      {
        id: "c1",
        userId,
        nome: "Cartao Principal",
        limite: "1000.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "cc1",
        userId,
        cartaoId: "c1",
        descricao: "Notebook",
        valorTotal: "400.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "200.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [
      {
        id: "r1",
        userId,
        tipo: "fixo",
        descricao: "Salario",
        valor: "1000.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  };
}

test("calcula resumo financeiro mensal com consistencia de valores", async () => {
  const fixture = buildBaseFixture();
  const service = createService(fixture);

  const summary = await service.getSummary("user-financial-unit", "2026-04");

  assert.equal(summary.mesReferencia, "2026-04");
  assert.equal(summary.totalRenda, 1000);
  assert.equal(summary.totalReceberMes, 500);
  assert.equal(summary.totalPagarMes, 0);
  assert.equal(summary.totalServicos, 100);
  assert.equal(summary.totalCartoesMes, 200);
  assert.equal(summary.totalEntradas, 1500);
  assert.equal(summary.totalSaidas, 300);
  assert.equal(summary.saldo, 1200);
  assert.equal(summary.dividaTotal, 700);
  assert.equal(summary.dividaTotalPendente, 550);
  assert.equal(summary.dividaTotalPaga, 150);
  assert.equal(summary.parcelas.total, 2);
  assert.equal(summary.parcelas.pagas, 1);
  assert.equal(summary.parcelas.pendentes, 1);
  assert.equal(summary.parcelas.valorPago, 50);
  assert.equal(summary.parcelas.valorPendente, 50);
});

test("aplica simulacao de renda extra sem quebrar a consistencia", async () => {
  const fixture = buildBaseFixture();
  const service = createService(fixture);

  const baseline = await service.getSummary("user-financial-unit", "2026-04");
  const simulated = await service.getSummary("user-financial-unit", "2026-04", {
    rendaExtra: 500,
  });

  assert.equal(simulated.totalRenda, baseline.totalRenda + 500);
  assert.equal(simulated.totalEntradas, baseline.totalEntradas + 500);
  assert.equal(simulated.totalSaidas, baseline.totalSaidas);
  assert.equal(simulated.saldo, baseline.saldo + 500);
});

test("gera score e insights com dividas vencidas e saldo negativo", async () => {
  const fixture = buildBaseFixture();
  fixture.dividas.push({
    id: "d-vencida",
    userId: "user-financial-unit",
    pessoaId: "p9",
    tipo: "pagar",
    valor: "900.00",
    dataVencimento: "2000-01-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Atrasada",
    totalParcelas: null,
    valorTotal: null,
  });
  fixture.rendas = [
    {
      id: "r1",
      userId: "user-financial-unit",
      tipo: "fixo",
      descricao: "Salario",
      valor: "400.00",
      diaRecebimento: 5,
      ativo: true,
    },
  ];

  const service = createService(fixture);
  const score = await service.getScore("user-financial-unit");
  const insights = await service.getInsights("user-financial-unit");

  assert.ok(score.valor >= 0 && score.valor <= 100);
  assert.ok(score.fatores.some((factor) => factor.label.includes("vencida")));
  assert.ok(insights.some((item) => item.texto.toLowerCase().includes("vencida")));
  assert.ok(insights.some((item) => item.tipo === "negativo"));
});

test("corrigido: totalPagarMes considera apenas obrigacoes pendentes do periodo", async () => {
  const fixture = buildBaseFixture();
  fixture.dividas.push({
    id: "d-paga-no-mes",
    userId: "user-financial-unit",
    pessoaId: "p4",
    tipo: "pagar",
    valor: "80.00",
    dataVencimento: "2026-04-22",
    status: "pago",
    dataPagamento: "2026-04-22",
    formaPagamento: "pix",
    descricao: "Ja paga no mes",
    totalParcelas: null,
    valorTotal: null,
  });

  const service = createService(fixture);
  const summary = await service.getSummary("user-financial-unit", "2026-04");

  assert.equal(summary.totalPagarMes, 0);
});

test("resumo e score com dividas parceladas e compras parceladas mantem consistencia atual", async () => {
  const userId = "user-financial-misto";
  const service = createService({
    dividas: [
      {
        id: "d-parcelada",
        userId,
        pessoaId: "p1",
        tipo: "pagar",
        valor: "150.00",
        dataVencimento: "2026-04-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Divida parcelada",
        totalParcelas: 4,
        valorTotal: "600.00",
      },
      {
        id: "d-receber",
        userId,
        pessoaId: "p2",
        tipo: "receber",
        valor: "200.00",
        dataVencimento: "2026-04-08",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Receber",
        totalParcelas: null,
        valorTotal: null,
      },
    ],
    parcelas: [
      {
        id: "dp-1",
        userId,
        dividaId: "d-parcelada",
        numero: 1,
        valor: "150.00",
        dataVencimento: "2026-02-10",
        status: "pago",
        dataPagamento: "2026-02-10",
        formaPagamento: "pix",
      },
      {
        id: "dp-2",
        userId,
        dividaId: "d-parcelada",
        numero: 2,
        valor: "150.00",
        dataVencimento: "2026-03-10",
        status: "pago",
        dataPagamento: "2026-03-10",
        formaPagamento: "pix",
      },
      {
        id: "dp-3",
        userId,
        dividaId: "d-parcelada",
        numero: 3,
        valor: "150.00",
        dataVencimento: "2026-04-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "dp-4",
        userId,
        dividaId: "d-parcelada",
        numero: 4,
        valor: "150.00",
        dataVencimento: "2026-05-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ],
    parcelasCompra: [
      {
        id: "pc-cc1-1",
        userId,
        compraCartaoId: "cc-1",
        numero: 1,
        valor: "100.00",
        dataVencimento: "2026-02-01",
        statusCartao: "pago",
        dataPagamentoCartao: "2026-02-01",
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-cc1-2",
        userId,
        compraCartaoId: "cc-1",
        numero: 2,
        valor: "100.00",
        dataVencimento: "2026-03-01",
        statusCartao: "pago",
        dataPagamentoCartao: "2026-03-01",
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-cc1-3",
        userId,
        compraCartaoId: "cc-1",
        numero: 3,
        valor: "100.00",
        dataVencimento: "2026-04-01",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-cc1-4",
        userId,
        compraCartaoId: "cc-1",
        numero: 4,
        valor: "100.00",
        dataVencimento: "2026-05-01",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-cc2-1",
        userId,
        compraCartaoId: "cc-2",
        numero: 1,
        valor: "80.00",
        dataVencimento: "2026-04-01",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-cc2-2",
        userId,
        compraCartaoId: "cc-2",
        numero: 2,
        valor: "80.00",
        dataVencimento: "2026-05-01",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    servicos: [],
    cartoes: [
      {
        id: "c1",
        userId,
        nome: "Cartao Misto",
        limite: "1000.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "cc-1",
        userId,
        cartaoId: "c1",
        descricao: "Compra 4x",
        valorTotal: "400.00",
        parcelas: 4,
        parcelaAtual: 3,
        valorParcela: "100.00",
        dataCompra: "2026-02-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-2",
        userId,
        cartaoId: "c1",
        descricao: "Compra 2x",
        valorTotal: "160.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "80.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [
      {
        id: "r1",
        userId,
        tipo: "fixo",
        descricao: "Salario",
        valor: "2000.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  });

  const summary = await service.getSummary(userId, "2026-04");
  const score = await service.getScore(userId);

  assert.equal(summary.totalRenda, 2000);
  assert.equal(summary.totalReceberMes, 200);
  assert.equal(summary.totalPagarMes, 150);
  assert.equal(summary.totalCartoesMes, 180);
  assert.equal(summary.dividaTotal, 800);
  assert.equal(summary.dividaTotalPendente, 500);
  assert.equal(summary.dividaTotalPaga, 300);
  assert.equal(summary.parcelas.total, 4);
  assert.equal(summary.parcelas.pagas, 2);
  assert.equal(summary.parcelas.pendentes, 2);
  assert.equal(summary.parcelas.valorPago, 300);
  assert.equal(summary.parcelas.valorPendente, 300);

  assert.ok(score.valor >= 0 && score.valor <= 100);
  assert.ok(score.fatores.length > 0);
});

test("resumo mensal usa cronograma de parcelas mesmo quando data da divida pai difere do mes", async () => {
  const userId = "user-financial-cronograma";
  const service = createService({
    dividas: [
      {
        id: "d-cronograma",
        userId,
        pessoaId: "p1",
        tipo: "pagar",
        valor: "100.00",
        dataVencimento: "2026-04-05",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Divida com cronograma futuro",
        totalParcelas: 5,
        valorTotal: "500.00",
      },
    ],
    parcelas: [
      {
        id: "pc-1",
        userId,
        dividaId: "d-cronograma",
        numero: 1,
        valor: "100.00",
        dataVencimento: "2026-06-05",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "pc-2",
        userId,
        dividaId: "d-cronograma",
        numero: 2,
        valor: "100.00",
        dataVencimento: "2026-07-05",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "pc-3",
        userId,
        dividaId: "d-cronograma",
        numero: 3,
        valor: "100.00",
        dataVencimento: "2026-08-05",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "pc-4",
        userId,
        dividaId: "d-cronograma",
        numero: 4,
        valor: "100.00",
        dataVencimento: "2026-09-05",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "pc-5",
        userId,
        dividaId: "d-cronograma",
        numero: 5,
        valor: "100.00",
        dataVencimento: "2026-10-05",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ],
    parcelasCompra: [],
    servicos: [],
    cartoes: [],
    compras: [],
    rendas: [],
  });

  const summaryApril = await service.getSummary(userId, "2026-04");
  const summaryJune = await service.getSummary(userId, "2026-06");

  assert.equal(summaryApril.totalPagarMes, 0);
  assert.equal(summaryJune.totalPagarMes, 100);
  assert.equal(summaryApril.dividaTotal, 500);
  assert.equal(summaryApril.dividaTotalPendente, 500);
  assert.equal(summaryApril.dividaTotalPaga, 0);
});

test("score considera parcelas vencidas da divida parcelada mesmo quando a divida pai nao esta vencida", async () => {
  const userId = "user-financial-score-parcelas";
  const baseFixture: FinancialFixture = {
    dividas: [
      {
        id: "d-parcelada-score",
        userId,
        pessoaId: "p1",
        tipo: "pagar",
        valor: "150.00",
        dataVencimento: "2099-12-31",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Divida parcelada para score",
        totalParcelas: 2,
        valorTotal: "300.00",
      },
    ],
    parcelas: [
      {
        id: "sp-1",
        userId,
        dividaId: "d-parcelada-score",
        numero: 1,
        valor: "150.00",
        dataVencimento: "2000-01-01",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "sp-2",
        userId,
        dividaId: "d-parcelada-score",
        numero: 2,
        valor: "150.00",
        dataVencimento: "2099-12-31",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ],
    parcelasCompra: [],
    servicos: [],
    cartoes: [],
    compras: [],
    rendas: [
      {
        id: "r1",
        userId,
        tipo: "fixo",
        descricao: "Salario",
        valor: "2000.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  };

  const scoreComParcelaVencida = await createService(baseFixture).getScore(userId);

  const fixtureSemVencida: FinancialFixture = {
    ...baseFixture,
    parcelas: baseFixture.parcelas.map((row) => ({ ...row, dataVencimento: "2099-12-31" })),
  };
  const scoreSemParcelaVencida = await createService(fixtureSemVencida).getScore(userId);

  assert.ok(
    scoreComParcelaVencida.fatores.some((factor) => factor.label.includes("vencida")),
  );
  assert.ok(scoreComParcelaVencida.valor < scoreSemParcelaVencida.valor);
});

test("score penaliza alto uso de cartao em compras parceladas", async () => {
  const userId = "user-financial-score-cartao";
  const lowUsageFixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [],
    cartoes: [
      {
        id: "card-1",
        userId,
        nome: "Cartao Score",
        limite: "1000.00",
        melhorDiaCompra: 10,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "c-low",
        userId,
        cartaoId: "card-1",
        descricao: "Compra baixa 4x",
        valorTotal: "400.00",
        parcelas: 4,
        parcelaAtual: 1,
        valorParcela: "100.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [
      {
        id: "r1",
        userId,
        tipo: "fixo",
        descricao: "Salario",
        valor: "2500.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  };

  const highUsageFixture: FinancialFixture = {
    ...lowUsageFixture,
    compras: [
      {
        id: "c-high-1",
        userId,
        cartaoId: "card-1",
        descricao: "Compra alta 5x",
        valorTotal: "2500.00",
        parcelas: 5,
        parcelaAtual: 1,
        valorParcela: "500.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "c-high-2",
        userId,
        cartaoId: "card-1",
        descricao: "Compra alta 4x",
        valorTotal: "1600.00",
        parcelas: 4,
        parcelaAtual: 1,
        valorParcela: "400.00",
        dataCompra: "2026-04-02",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
  };

  const scoreLowUsage = await createService(lowUsageFixture).getScore(userId);
  const scoreHighUsage = await createService(highUsageFixture).getScore(userId);

  assert.ok(scoreHighUsage.fatores.some((factor) => factor.label.includes("Uso elevado")));
  assert.ok(scoreHighUsage.valor < scoreLowUsage.valor);
});

test("resumo e score de cartoes usam parcelas_compra reais e evitam dupla contagem com compra pai", async () => {
  const userId = "user-financial-card-installments";
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const currentMonthDate = format(new Date(now.getFullYear(), now.getMonth(), 10), "yyyy-MM-dd");
  const prevMonthDate = format(addMonths(new Date(now.getFullYear(), now.getMonth(), 10), -1), "yyyy-MM-dd");
  const nextMonthDate = format(addMonths(new Date(now.getFullYear(), now.getMonth(), 10), 1), "yyyy-MM-dd");

  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "pc-avista-1",
        userId,
        compraCartaoId: "cc-avista",
        numero: 1,
        valor: "120.00",
        dataVencimento: currentMonthDate,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-parc-1",
        userId,
        compraCartaoId: "cc-parcelada",
        numero: 1,
        valor: "100.00",
        dataVencimento: prevMonthDate,
        statusCartao: "pago",
        dataPagamentoCartao: prevMonthDate,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-parc-2",
        userId,
        compraCartaoId: "cc-parcelada",
        numero: 2,
        valor: "100.00",
        dataVencimento: currentMonthDate,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-parc-3",
        userId,
        compraCartaoId: "cc-parcelada",
        numero: 3,
        valor: "100.00",
        dataVencimento: nextMonthDate,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-multi-1",
        userId,
        compraCartaoId: "cc-multi",
        numero: 1,
        valor: "80.00",
        dataVencimento: currentMonthDate,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-multi-2",
        userId,
        compraCartaoId: "cc-multi",
        numero: 2,
        valor: "80.00",
        dataVencimento: nextMonthDate,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    servicos: [],
    cartoes: [
      {
        id: "card-analytics",
        userId,
        nome: "Cartao Analytics",
        limite: "500.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "cc-avista",
        userId,
        cartaoId: "card-analytics",
        descricao: "Compra avista",
        valorTotal: "120.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "999.00",
        dataCompra: currentMonthDate,
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-parcelada",
        userId,
        cartaoId: "card-analytics",
        descricao: "Compra 3x",
        valorTotal: "300.00",
        parcelas: 3,
        parcelaAtual: 2,
        valorParcela: "999.00",
        dataCompra: prevMonthDate,
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-multi",
        userId,
        cartaoId: "card-analytics",
        descricao: "Compra 2x",
        valorTotal: "160.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "777.00",
        dataCompra: currentMonthDate,
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [
      {
        id: "r1",
        userId,
        tipo: "fixo",
        descricao: "Salario",
        valor: "2500.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  };

  const service = createService(fixture);
  const summaryCurrent = await service.getSummary(userId, currentMonth);
  const summaryNext = await service.getSummary(userId, format(addMonths(now, 1), "yyyy-MM"));
  const score = await service.getScore(userId);

  assert.equal(summaryCurrent.totalCartoesMes, 300);
  assert.equal(summaryNext.totalCartoesMes, 180);

  // Se houvesse dupla contagem ou uso da compra pai, esse valor seria muito maior
  // por causa de valorParcela artificialmente inflado no pai.
  assert.ok(summaryCurrent.totalCartoesMes < 500);

  assert.ok(score.fatores.some((factor) => factor.label.includes("Uso elevado")));
});

test("comprometimento e resumo mensal usam apenas parcelas reais do mes atual (nao todo saldo futuro)", async () => {
  const userId = "user-financial-commitment-monthly";
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const dueDate = (offsetMonths: number) => format(addMonths(new Date(now.getFullYear(), now.getMonth(), 10), offsetMonths), "yyyy-MM-dd");

  const fixture: FinancialFixture = {
    dividas: [
      {
        id: "d-12x-commitment",
        userId,
        pessoaId: "p1",
        tipo: "pagar",
        valor: "100.00",
        dataVencimento: dueDate(0),
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Divida 12x comprometimento",
        totalParcelas: 12,
        valorTotal: "1200.00",
      },
    ],
    parcelas: [
      {
        id: "cp-1",
        userId,
        dividaId: "d-12x-commitment",
        numero: 1,
        valor: "100.00",
        dataVencimento: dueDate(-1),
        status: "pago",
        dataPagamento: dueDate(-1),
        formaPagamento: "pix",
      },
      {
        id: "cp-2",
        userId,
        dividaId: "d-12x-commitment",
        numero: 2,
        valor: "100.00",
        dataVencimento: dueDate(0),
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `cp-future-${index + 1}`,
        userId,
        dividaId: "d-12x-commitment",
        numero: index + 3,
        valor: "100.00",
        dataVencimento: dueDate(index + 1),
        status: "pendente" as const,
        dataPagamento: null,
        formaPagamento: null,
      })),
    ],
    parcelasCompra: [],
    servicos: [],
    cartoes: [],
    compras: [],
    rendas: [
      {
        id: "r1",
        userId,
        tipo: "fixo",
        descricao: "Salario",
        valor: "2000.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  };

  const service = createService(fixture);
  const summary = await service.getSummary(userId, currentMonth);
  const score = await service.getScore(userId);

  assert.equal(summary.totalPagarMes, 100);
  assert.equal(summary.dividaTotal, 1200);
  assert.equal(summary.dividaTotalPendente, 1100);
  assert.equal(summary.dividaTotalPaga, 100);

  const comprometimentoFactor = score.fatores.find((factor) => factor.label.includes("% da renda comprometida"));
  assert.ok(comprometimentoFactor);
  assert.equal(comprometimentoFactor?.impacto, 5);
  assert.ok(comprometimentoFactor?.label.includes("5%"));
});
