import test from "node:test";
import assert from "node:assert/strict";
import type {
  Cartao,
  CartaoFaturaPagamento,
  CartaoFaturaPagamentoAlocacao,
  CompraCartao,
  Divida,
  Parcela,
  ParcelaCompra,
  Patrimonio,
  Pessoa,
  Renda,
  Servico,
} from "@shared/schema";
import { addMonths, format } from "date-fns";
import { FinancialService } from "../services/financial.service";
import { ReportsService } from "../services/reports.service";
import { FinancialService as ServerlessFinancialService } from "../../serverless/services/financial.service";
import { ReportsService as ServerlessReportsService } from "../../serverless/services/reports.service";
import { buildServicoFixture } from "./fixtures/servico.fixture";

type FinancialFixture = {
  dividas: Divida[];
  parcelas: Parcela[];
  parcelasCompra: ParcelaCompra[];
  cartaoFaturaPagamentos?: CartaoFaturaPagamento[];
  cartaoFaturaPagamentoAlocacoes?: CartaoFaturaPagamentoAlocacao[];
  servicos: Servico[];
  cartoes: Cartao[];
  compras: CompraCartao[];
  rendas: Renda[];
  pessoas?: Pessoa[];
  patrimonios?: Patrimonio[];
};

function createRepository(fixture: FinancialFixture) {
  return {
    getDividas: async () => fixture.dividas,
    getParcelas: async () => fixture.parcelas,
    getParcelasCompraByUser: async () => fixture.parcelasCompra,
    getCartaoFaturaPagamentos: async () => fixture.cartaoFaturaPagamentos ?? [],
    getCartaoFaturaPagamentosByCartao: async (cartaoId: string) => (
      (fixture.cartaoFaturaPagamentos ?? []).filter((pagamento) => pagamento.cartaoId === cartaoId)
    ),
    getCartaoFaturaPagamentoAlocacoesByPagamentoIds: async (paymentIds: string[]) => (
      (fixture.cartaoFaturaPagamentoAlocacoes ?? []).filter((alocacao) => paymentIds.includes(alocacao.pagamentoId))
    ),
    getServicos: async () => fixture.servicos,
    getCartoes: async () => fixture.cartoes,
    getComprasCartao: async () => fixture.compras,
    getRendas: async () => fixture.rendas,
    getPessoas: async () => fixture.pessoas ?? [],
    getPatrimonios: async () => fixture.patrimonios ?? [],
    getPessoaSaldoMovimentacoes: async () => [],
  };
}

function createService(fixture: FinancialFixture): FinancialService {
  return new FinancialService(createRepository(fixture) as any);
}

function createServerlessService(fixture: FinancialFixture): ServerlessFinancialService {
  return new ServerlessFinancialService(createRepository(fixture) as any);
}

function createReportsService(fixture: FinancialFixture): ReportsService {
  return new ReportsService(createRepository(fixture) as any);
}

function createServerlessReportsService(fixture: FinancialFixture): ServerlessReportsService {
  return new ServerlessReportsService(createRepository(fixture) as any);
}

async function withFakeNow<T>(isoDate: string, run: () => Promise<T> | T): Promise<T> {
  const RealDate = Date;
  const fixedTime = new RealDate(isoDate).getTime();

  class FakeDate extends RealDate {
    constructor(value?: string | number | Date) {
      if (arguments.length === 0) {
        super(fixedTime);
        return;
      }
      super(value as string | number | Date);
    }

    static now() {
      return fixedTime;
    }
  }

  // @ts-expect-error test-only Date override
  globalThis.Date = FakeDate;
  try {
    return await run();
  } finally {
    globalThis.Date = RealDate;
  }
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
        periodicidadeCobranca: null,
        valorCobranca: null,
        dataCobranca: 10,
        mesCobranca: null,
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
  assert.equal(summary.servicosEquivalenteMensalTotal, 100);
  assert.equal(summary.servicosCobrancaRealCompetenciaTotal, 100);
  assert.equal(summary.servicosVinculadosCartaoEquivalenteMensalTotal, 0);
  assert.equal(summary.servicosVinculadosCartaoCobrancaRealTotal, 0);
  assert.equal(summary.servicosNaoVinculadosCartaoEquivalenteMensalTotal, 100);
  assert.equal(summary.servicosNaoVinculadosCartaoCobrancaRealTotal, 100);
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

test("resumo financeiro: métricas de serviços separam equivalente mensal, cobrança real e vínculo com cartão", async () => {
  const fixture = buildBaseFixture();
  fixture.servicos = [
    buildServicoFixture({
      id: "s-mensal",
      nome: "Servico Mensal",
      periodicidadeCobranca: "mensal",
      valorCobranca: "50.00",
      valorMensal: "50.00",
      compraCartaoId: null,
    }),
    {
      ...buildServicoFixture({
        id: "s-anual",
        nome: "Servico Anual",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: "compra-link-1",
      }),
    } as Servico,
    {
      ...buildServicoFixture({
        id: "s-trimestral",
        nome: "Servico Trimestral",
        periodicidadeCobranca: "trimestral",
        valorCobranca: "90.00",
        valorMensal: "30.00",
        compraCartaoId: null,
      }),
      competenciaBase: "2026-04",
    } as Servico,
    buildServicoFixture({
      id: "s-legado",
      nome: "Servico Legado",
      periodicidadeCobranca: null,
      valorCobranca: null,
      valorMensal: "40.00",
      compraCartaoId: null,
    }),
  ];

  const service = createService(fixture);
  const summaryAbril = await service.getSummary("user-financial-unit", "2026-04");
  const summaryMaio = await service.getSummary("user-financial-unit", "2026-05");

  // Saída mensal real não duplica serviços já representados pela fatura do cartão.
  assert.equal(summaryAbril.totalServicos, 180);
  assert.equal(summaryMaio.totalServicos, 90);
  assert.equal(summaryAbril.totalSaidas, 380);
  assert.equal(summaryMaio.totalSaidas, 340);

  // Planejamento mensal (equivalente) inclui todos os ativos.
  assert.equal(summaryAbril.servicosEquivalenteMensalTotal, 139.15);
  assert.equal(summaryMaio.servicosEquivalenteMensalTotal, 139.15);

  // Cobrança real por competência: anual cobra só no mês âncora e trimestral no intervalo.
  // Abril: mensal(50) + trimestral(90) + legado(40) = 180
  assert.equal(summaryAbril.servicosCobrancaRealCompetenciaTotal, 180);
  // Maio: mensal(50) + anual(229,82) + legado(40) = 319,82
  assert.equal(summaryMaio.servicosCobrancaRealCompetenciaTotal, 319.82);

  // Vinculado ao cartão: apenas o anual.
  assert.equal(summaryAbril.servicosVinculadosCartaoEquivalenteMensalTotal, 19.15);
  assert.equal(summaryMaio.servicosVinculadosCartaoEquivalenteMensalTotal, 19.15);
  assert.equal(summaryAbril.servicosVinculadosCartaoCobrancaRealTotal, 0);
  assert.equal(summaryMaio.servicosVinculadosCartaoCobrancaRealTotal, 229.82);

  // Não vinculados: mensal + trimestral + legado.
  assert.equal(summaryAbril.servicosNaoVinculadosCartaoEquivalenteMensalTotal, 120);
  assert.equal(summaryMaio.servicosNaoVinculadosCartaoEquivalenteMensalTotal, 120);
  assert.equal(summaryAbril.servicosNaoVinculadosCartaoCobrancaRealTotal, 180);
  assert.equal(summaryMaio.servicosNaoVinculadosCartaoCobrancaRealTotal, 90);

  // Cartões/faturas não mudam nesta fase.
  assert.equal(summaryAbril.totalCartoesMes, 200);
  assert.equal(summaryMaio.totalCartoesMes, 200);
});

test("resumo financeiro: serviço anual vinculado ao cartão não duplica saída mensal e compra continua na fatura", async () => {
  const userId = "user-financial-linked-card-service";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "pc-linked-1",
        userId,
        compraCartaoId: "cc-linked-annual",
        numero: 1,
        valor: "229.82",
        dataVencimento: "2026-05-20",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    servicos: [
      {
        ...buildServicoFixture({
          id: "svc-linked-annual",
          nome: "Distrokid",
          periodicidadeCobranca: "anual",
          valorCobranca: "229.82",
          valorMensal: "19.15",
          mesCobranca: 5,
          compraCartaoId: "cc-linked-annual",
        }),
      } as Servico,
      {
        ...buildServicoFixture({
          id: "svc-unlinked-annual",
          nome: "Hospedagem",
          periodicidadeCobranca: "anual",
          valorCobranca: "120.00",
          valorMensal: "10.00",
          mesCobranca: 5,
          compraCartaoId: null,
        }),
      } as Servico,
      buildServicoFixture({
        id: "svc-monthly",
        nome: "Internet",
        periodicidadeCobranca: "mensal",
        valorCobranca: "50.00",
        valorMensal: "50.00",
        compraCartaoId: null,
      }),
    ],
    cartoes: [
      {
        id: "card-1",
        userId,
        nome: "Cartão Principal",
        limite: "1500.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "cc-linked-annual",
        userId,
        cartaoId: "card-1",
        descricao: "Distrokid Anual",
        valorTotal: "229.82",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "229.82",
        dataCompra: "2026-05-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [],
  };

  const summary = await createService(fixture).getSummary(userId, "2026-05");

  assert.equal(summary.totalServicos, 170);
  assert.equal(summary.servicosEquivalenteMensalTotal, 79.15);
  assert.equal(summary.servicosVinculadosCartaoEquivalenteMensalTotal, 19.15);
  assert.equal(summary.servicosNaoVinculadosCartaoEquivalenteMensalTotal, 60);
  assert.equal(summary.servicosNaoVinculadosCartaoCobrancaRealTotal, 170);
  assert.equal(summary.totalCartoesMes, 229.82);
  assert.equal(summary.totalSaidas, 399.82);
});

test("resumo financeiro: serviços anuais respeitam mes_cobranca por competência", async () => {
  const userId = "user-financial-annual-months";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [
      buildServicoFixture({
        id: "svc-distrokid",
        userId,
        nome: "DistroKid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-meliuz",
        userId,
        nome: "Meliuz Prime",
        periodicidadeCobranca: "anual",
        valorCobranca: "99.90",
        valorMensal: "8.33",
        mesCobranca: 6,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-google",
        userId,
        nome: "Google One",
        periodicidadeCobranca: "anual",
        valorCobranca: "120.00",
        valorMensal: "10.00",
        mesCobranca: 8,
        compraCartaoId: null,
      }),
    ],
    cartoes: [],
    compras: [],
    rendas: [],
  };

  const service = createService(fixture);

  const maio = await service.getSummary(userId, "2026-05");
  const junho = await service.getSummary(userId, "2026-06");
  const agosto = await service.getSummary(userId, "2026-08");

  assert.equal(maio.totalServicos, 229.82);
  assert.equal(junho.totalServicos, 99.9);
  assert.equal(agosto.totalServicos, 120);
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

test("simulação de despesas: reduz apenas serviços com cobrança real na competência simulada", async () => {
  const userId = "user-simulacao-servicos-anual";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [
      buildServicoFixture({
        id: "svc-distrokid",
        userId,
        nome: "DistroKid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-meliuz",
        userId,
        nome: "Meliuz Prime",
        periodicidadeCobranca: "anual",
        valorCobranca: "99.90",
        valorMensal: "8.33",
        mesCobranca: 6,
        compraCartaoId: null,
      }),
    ],
    cartoes: [],
    compras: [],
    rendas: [],
  };

  const service = createService(fixture);

  const maio = await service.getSummary(userId, "2026-05", { reducaoDespesas: 99.9 });
  const junho = await service.getSummary(userId, "2026-06", { reducaoDespesas: 99.9 });

  assert.equal(maio.totalServicos, 229.82);
  assert.equal(junho.totalServicos, 0);
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

test("score financeiro: serviço anual fora da competência não afeta o score, mas no mês correto afeta", async () => {
  const userId = "user-score-servico-anual";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [
      buildServicoFixture({
        id: "svc-distrokid",
        userId,
        nome: "DistroKid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: null,
      }),
    ],
    cartoes: [],
    compras: [],
    rendas: [],
  };

  const service = createService(fixture);

  const scoreMaio = await withFakeNow("2026-05-15T12:00:00.000Z", () => service.getScore(userId));
  const scoreJunho = await withFakeNow("2026-06-15T12:00:00.000Z", () => service.getScore(userId));

  assert.equal(scoreMaio.valor, 55);
  assert.equal(scoreJunho.valor, 75);
});

test("insights financeiros: não usam equivalente mensal como gasto real fora da competência", async () => {
  const userId = "user-insights-servico-anual";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [
      buildServicoFixture({
        id: "svc-distrokid",
        userId,
        nome: "DistroKid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: null,
      }),
    ],
    cartoes: [],
    compras: [],
    rendas: [],
  };

  const service = createService(fixture);

  const maioInsights = await withFakeNow("2026-05-15T12:00:00.000Z", () => service.getInsights(userId));
  const junhoInsights = await withFakeNow("2026-06-15T12:00:00.000Z", () => service.getInsights(userId));

  assert.ok(maioInsights.some((item) => item.texto.includes("229,82")));
  assert.ok(junhoInsights.some((item) => item.texto.includes("nenhum gera cobranca real neste mes")));
  assert.equal(junhoInsights.some((item) => item.texto.includes("19,15")), false);
});

test("server e serverless: resumo financeiro usam a mesma regra real de mes_cobranca", async () => {
  const userId = "user-parity-financial";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [
      buildServicoFixture({
        id: "svc-distrokid",
        userId,
        nome: "DistroKid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-meliuz",
        userId,
        nome: "Meliuz Prime",
        periodicidadeCobranca: "anual",
        valorCobranca: "99.90",
        valorMensal: "8.33",
        mesCobranca: 6,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-google",
        userId,
        nome: "Google One",
        periodicidadeCobranca: "anual",
        valorCobranca: "120.00",
        valorMensal: "10.00",
        mesCobranca: 8,
        compraCartaoId: null,
      }),
    ],
    cartoes: [],
    compras: [],
    rendas: [],
  };

  const serverSummary = await createService(fixture).getSummary(userId, "2026-06");
  const serverlessSummary = await createServerlessService(fixture).getSummary(userId, "2026-06");

  assert.equal(serverSummary.totalServicos, 99.9);
  assert.deepEqual(serverlessSummary, serverSummary);
});

test("server e serverless: relatórios usam o mesmo gasto fixo real por período", async () => {
  const userId = "user-parity-reports";
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [],
    servicos: [
      buildServicoFixture({
        id: "svc-distrokid",
        userId,
        nome: "DistroKid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        mesCobranca: 5,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-meliuz",
        userId,
        nome: "Meliuz Prime",
        periodicidadeCobranca: "anual",
        valorCobranca: "99.90",
        valorMensal: "8.33",
        mesCobranca: 6,
        compraCartaoId: null,
      }),
      buildServicoFixture({
        id: "svc-google",
        userId,
        nome: "Google One",
        periodicidadeCobranca: "anual",
        valorCobranca: "120.00",
        valorMensal: "10.00",
        mesCobranca: 8,
        compraCartaoId: null,
      }),
    ],
    cartoes: [],
    compras: [],
    rendas: [],
    pessoas: [],
    patrimonios: [],
  };

  const query = { startDate: "2026-05-01", endDate: "2026-08-31" };
  const serverOverview = await createReportsService(fixture).getOverview(userId, query);
  const serverlessOverview = await createServerlessReportsService(fixture).getOverview(userId, query);

  assert.equal(serverOverview.summary.gastosFixos, 449.72);
  assert.equal(serverOverview.summary.servicosAtivosTotal, 449.72);
  assert.deepEqual(serverlessOverview.summary, serverOverview.summary);
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

test("getCardSummaries usa competencia do vencimento para fatura atual e parcelas abertas para limite", async () => {
  const userId = "user-financial-card-competency";
  const now = new Date();
  const dueDate = (offsetMonths: number, day: number) =>
    format(addMonths(new Date(now.getFullYear(), now.getMonth(), day), offsetMonths), "yyyy-MM-dd");

  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "pc-paga-anterior",
        userId,
        compraCartaoId: "cc-paga-anterior",
        numero: 1,
        valor: "200.00",
        dataVencimento: dueDate(-1, 10),
        statusCartao: "pago",
        dataPagamentoCartao: dueDate(-1, 12),
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-atual-pendente",
        userId,
        compraCartaoId: "cc-atual",
        numero: 1,
        valor: "150.00",
        dataVencimento: dueDate(0, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-futura",
        userId,
        compraCartaoId: "cc-futura",
        numero: 1,
        valor: "100.00",
        dataVencimento: dueDate(1, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-vencida-nao-paga",
        userId,
        compraCartaoId: "cc-vencida",
        numero: 1,
        valor: "80.00",
        dataVencimento: dueDate(-2, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-cancelada",
        userId,
        compraCartaoId: "cc-cancelada",
        numero: 1,
        valor: "50.00",
        dataVencimento: dueDate(0, 10),
        statusCartao: "cancelado",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    servicos: [],
    cartoes: [
      {
        id: "card-competency",
        userId,
        nome: "Cartao Competencia",
        limite: "1000.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "cc-paga-anterior",
        userId,
        cartaoId: "card-competency",
        descricao: "Parcela paga antiga",
        valorTotal: "200.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "200.00",
        dataCompra: dueDate(-1, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-atual",
        userId,
        cartaoId: "card-competency",
        descricao: "Parcela atual pendente",
        valorTotal: "150.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "150.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-futura",
        userId,
        cartaoId: "card-competency",
        descricao: "Parcela futura",
        valorTotal: "100.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "100.00",
        dataCompra: dueDate(1, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-vencida",
        userId,
        cartaoId: "card-competency",
        descricao: "Parcela vencida em aberto",
        valorTotal: "80.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "80.00",
        dataCompra: dueDate(-2, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "cc-cancelada",
        userId,
        cartaoId: "card-competency",
        descricao: "Parcela cancelada",
        valorTotal: "50.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "50.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [],
  };

  const service = createService(fixture);
  const summaries = await service.getCardSummaries(userId);
  const summary = summaries.find((item) => item.cartaoId === "card-competency");

  assert.ok(summary);
  assert.equal(summary?.faturaAtual, 150);
  assert.equal(summary?.limiteComprometido, 330);
  assert.equal(summary?.limiteDisponivel, 670);
  assert.equal(summary?.quantidadeParcelasPendentes, 3);
});

test("pagamento parcial de fatura reduz fatura atual e comprometido sem mexer nas futuras", async () => {
  const userId = "user-financial-card-partial-payment";
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const dueDate = (offsetMonths: number, day: number) =>
    format(addMonths(new Date(now.getFullYear(), now.getMonth(), day), offsetMonths), "yyyy-MM-dd");

  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "pc-current-1",
        userId,
        compraCartaoId: "compra-current-1",
        numero: 1,
        valor: "120.00",
        dataVencimento: dueDate(0, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: "pendente",
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-current-2",
        userId,
        compraCartaoId: "compra-current-2",
        numero: 1,
        valor: "80.00",
        dataVencimento: dueDate(0, 12),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-future-1",
        userId,
        compraCartaoId: "compra-future-1",
        numero: 1,
        valor: "90.00",
        dataVencimento: dueDate(1, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    cartaoFaturaPagamentos: [
      {
        id: "payment-partial-1",
        userId,
        cartaoId: "card-1",
        competenciaMes: Number(currentMonth.slice(5, 7)),
        competenciaAno: Number(currentMonth.slice(0, 4)),
        valorPago: "80.00",
        dataPagamento: dueDate(0, 15),
        observacao: null,
        tipoPagamento: "parcial",
        considerarNoSaldoCompetencia: true,
        conciliadoEm: null,
        createdAt: `${currentMonth}-15T12:00:00.000Z`,
        updatedAt: `${currentMonth}-15T12:00:00.000Z`,
      },
    ] as CartaoFaturaPagamento[],
    servicos: [],
    cartoes: [
      {
        id: "card-1",
        userId,
        nome: "Cartão Principal",
        limite: "1000.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "compra-current-1",
        userId,
        cartaoId: "card-1",
        descricao: "Compra atual 1",
        valorTotal: "120.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "120.00",
        dataCompra: dueDate(0, 1),
        pessoaId: "pessoa-1",
        statusPessoa: "pendente",
        dataPagamentoPessoa: null,
      },
      {
        id: "compra-current-2",
        userId,
        cartaoId: "card-1",
        descricao: "Compra atual 2",
        valorTotal: "80.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "80.00",
        dataCompra: dueDate(0, 2),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "compra-future-1",
        userId,
        cartaoId: "card-1",
        descricao: "Compra futura",
        valorTotal: "90.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "90.00",
        dataCompra: dueDate(1, 2),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [],
  };

  const service = createService(fixture);
  const summary = await service.getSummary(userId, currentMonth);
  const cardSummary = (await service.getCardSummaries(userId)).find((item) => item.cartaoId === "card-1");

  assert.equal(summary.totalCartoesMes, 120);
  assert.equal(cardSummary?.faturaAtual, 120);
  assert.equal(cardSummary?.limiteComprometido, 210);
  assert.equal(cardSummary?.limiteDisponivel, 790);
});

test("quitação total da fatura zera a competência atual e mantém parcelas futuras comprometidas", async () => {
  const userId = "user-financial-card-full-payment";
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const nextMonth = format(addMonths(now, 1), "yyyy-MM");
  const dueDate = (offsetMonths: number, day: number) =>
    format(addMonths(new Date(now.getFullYear(), now.getMonth(), day), offsetMonths), "yyyy-MM-dd");

  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "pc-current-paid",
        userId,
        compraCartaoId: "compra-current-paid",
        numero: 1,
        valor: "200.00",
        dataVencimento: dueDate(0, 10),
        statusCartao: "pago",
        dataPagamentoCartao: dueDate(0, 18),
        statusPessoa: "pendente",
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-future-open",
        userId,
        compraCartaoId: "compra-future-open",
        numero: 1,
        valor: "90.00",
        dataVencimento: dueDate(1, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    cartaoFaturaPagamentos: [
      {
        id: "payment-full-1",
        userId,
        cartaoId: "card-1",
        competenciaMes: Number(currentMonth.slice(5, 7)),
        competenciaAno: Number(currentMonth.slice(0, 4)),
        valorPago: "200.00",
        dataPagamento: dueDate(0, 18),
        observacao: "Quitação da fatura",
        tipoPagamento: "quitacao_total",
        considerarNoSaldoCompetencia: false,
        conciliadoEm: `${currentMonth}-18T12:00:00.000Z`,
        createdAt: `${currentMonth}-18T12:00:00.000Z`,
        updatedAt: `${currentMonth}-18T12:00:00.000Z`,
      },
    ] as CartaoFaturaPagamento[],
    servicos: [],
    cartoes: [
      {
        id: "card-1",
        userId,
        nome: "Cartão Principal",
        limite: "1000.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "compra-current-paid",
        userId,
        cartaoId: "card-1",
        descricao: "Compra quitada",
        valorTotal: "200.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "200.00",
        dataCompra: dueDate(0, 1),
        pessoaId: "pessoa-1",
        statusPessoa: "pendente",
        dataPagamentoPessoa: null,
      },
      {
        id: "compra-future-open",
        userId,
        cartaoId: "card-1",
        descricao: "Compra futura",
        valorTotal: "90.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "90.00",
        dataCompra: dueDate(1, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [],
  };

  const service = createService(fixture);
  const summaryCurrent = await service.getSummary(userId, currentMonth);
  const summaryNext = await service.getSummary(userId, nextMonth);
  const cardSummary = (await service.getCardSummaries(userId)).find((item) => item.cartaoId === "card-1");

  assert.equal(summaryCurrent.totalCartoesMes, 0);
  assert.equal(summaryNext.totalCartoesMes, 90);
  assert.equal(cardSummary?.faturaAtual, 0);
  assert.equal(cardSummary?.limiteComprometido, 90);
  assert.equal(cardSummary?.limiteDisponivel, 910);
});

test("relatórios usam pagamentos de fatura para evitar dupla contagem no período", async () => {
  const userId = "user-reports-card-payments";
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const dueDate = format(new Date(now.getFullYear(), now.getMonth(), 10), "yyyy-MM-dd");

  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "pc-report-current",
        userId,
        compraCartaoId: "compra-report-current",
        numero: 1,
        valor: "300.00",
        dataVencimento: dueDate,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    cartaoFaturaPagamentos: [
      {
        id: "payment-report-partial",
        userId,
        cartaoId: "card-report",
        competenciaMes: Number(currentMonth.slice(5, 7)),
        competenciaAno: Number(currentMonth.slice(0, 4)),
        valorPago: "120.00",
        dataPagamento: dueDate,
        observacao: null,
        tipoPagamento: "parcial",
        considerarNoSaldoCompetencia: true,
        conciliadoEm: null,
        createdAt: `${currentMonth}-10T12:00:00.000Z`,
        updatedAt: `${currentMonth}-10T12:00:00.000Z`,
      },
    ] as CartaoFaturaPagamento[],
    servicos: [],
    cartoes: [
      {
        id: "card-report",
        userId,
        nome: "Cartão Relatório",
        limite: "1000.00",
        melhorDiaCompra: 5,
        diaVencimento: 20,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "compra-report-current",
        userId,
        cartaoId: "card-report",
        descricao: "Compra relatório",
        valorTotal: "300.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "300.00",
        dataCompra: dueDate,
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [],
    pessoas: [],
    patrimonios: [],
  };

  const overview = await createReportsService(fixture).getOverview(userId, {
    startDate: `${currentMonth}-01`,
    endDate: `${currentMonth}-28`,
  });

  assert.equal(overview.summary.expenseTotal, 180);
  assert.equal(overview.summary.cartoesFaturaAtualTotal, 180);
});

test("getCardSummaries aplica a mesma regra global para todos os cartões", async () => {
  const userId = "user-financial-card-global";
  const now = new Date();
  const dueDate = (offsetMonths: number, day: number) =>
    format(addMonths(new Date(now.getFullYear(), now.getMonth(), day), offsetMonths), "yyyy-MM-dd");
  const fixture: FinancialFixture = {
    dividas: [],
    parcelas: [],
    parcelasCompra: [
      {
        id: "a-avista-abr",
        userId,
        compraCartaoId: "a-avista",
        numero: 1,
        valor: "200.00",
        dataVencimento: dueDate(0, 5),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-parcelada-abr",
        userId,
        compraCartaoId: "a-parcelada",
        numero: 1,
        valor: "100.00",
        dataVencimento: dueDate(0, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-parcelada-mai",
        userId,
        compraCartaoId: "a-parcelada",
        numero: 2,
        valor: "100.00",
        dataVencimento: dueDate(1, 10),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-reembolsada-abr",
        userId,
        compraCartaoId: "a-reembolsada",
        numero: 1,
        valor: "50.00",
        dataVencimento: dueDate(0, 15),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: "pago",
        dataPagamentoPessoa: dueDate(0, 16),
      },
      {
        id: "a-cancelada-abr",
        userId,
        compraCartaoId: "a-cancelada",
        numero: 1,
        valor: "40.00",
        dataVencimento: dueDate(0, 18),
        statusCartao: "cancelado",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-quitada-abr",
        userId,
        compraCartaoId: "a-quitada",
        numero: 1,
        valor: "30.00",
        dataVencimento: dueDate(0, 20),
        statusCartao: "pago",
        dataPagamentoCartao: dueDate(0, 20),
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "b-parcelada-1-abr",
        userId,
        compraCartaoId: "b-parcelada-1",
        numero: 1,
        valor: "60.00",
        dataVencimento: dueDate(0, 8),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "b-parcelada-1-mai",
        userId,
        compraCartaoId: "b-parcelada-1",
        numero: 2,
        valor: "60.00",
        dataVencimento: dueDate(1, 8),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "b-parcelada-2-abr",
        userId,
        compraCartaoId: "b-parcelada-2",
        numero: 1,
        valor: "80.00",
        dataVencimento: dueDate(0, 22),
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    servicos: [],
    cartoes: [
      {
        id: "card-empty",
        userId,
        nome: "Cartão sem compras",
        limite: "900.00",
        melhorDiaCompra: 5,
        diaVencimento: 10,
        iconeId: null,
      },
      {
        id: "card-a",
        userId,
        nome: "Banco livre platinum",
        limite: "1000.00",
        melhorDiaCompra: 7,
        diaVencimento: 12,
        iconeId: null,
      },
      {
        id: "card-b",
        userId,
        nome: "Qualquer emissor gold",
        limite: "500.00",
        melhorDiaCompra: 15,
        diaVencimento: 22,
        iconeId: null,
      },
    ],
    compras: [
      {
        id: "a-avista",
        userId,
        cartaoId: "card-a",
        descricao: "Compra à vista",
        valorTotal: "200.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "200.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-parcelada",
        userId,
        cartaoId: "card-a",
        descricao: "Compra parcelada",
        valorTotal: "200.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "100.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-reembolsada",
        userId,
        cartaoId: "card-a",
        descricao: "Compra reembolsada",
        valorTotal: "50.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "50.00",
        dataCompra: dueDate(0, 1),
        pessoaId: "pessoa-1",
        statusPessoa: "pago",
        dataPagamentoPessoa: dueDate(0, 16),
      },
      {
        id: "a-cancelada",
        userId,
        cartaoId: "card-a",
        descricao: "Compra cancelada",
        valorTotal: "40.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "40.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "a-quitada",
        userId,
        cartaoId: "card-a",
        descricao: "Compra quitada",
        valorTotal: "30.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "30.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "b-parcelada-1",
        userId,
        cartaoId: "card-b",
        descricao: "Compra parcelada 1",
        valorTotal: "120.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "60.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "b-parcelada-2",
        userId,
        cartaoId: "card-b",
        descricao: "Compra parcelada 2",
        valorTotal: "80.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "80.00",
        dataCompra: dueDate(0, 1),
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
    rendas: [],
  };

  const service = createService(fixture);
  const summaries = await service.getCardSummaries(userId);

  assert.deepEqual(summaries.find((item) => item.cartaoId === "card-empty"), {
    cartaoId: "card-empty",
    faturaAtual: 0,
    limiteComprometido: 0,
    limiteDisponivel: 900,
    saldoRestanteTotal: 0,
    quantidadeParcelasPendentes: 0,
  });
  assert.deepEqual(summaries.find((item) => item.cartaoId === "card-a"), {
    cartaoId: "card-a",
    faturaAtual: 350,
    limiteComprometido: 450,
    limiteDisponivel: 550,
    saldoRestanteTotal: 450,
    quantidadeParcelasPendentes: 4,
  });
  assert.deepEqual(summaries.find((item) => item.cartaoId === "card-b"), {
    cartaoId: "card-b",
    faturaAtual: 140,
    limiteComprometido: 200,
    limiteDisponivel: 300,
    saldoRestanteTotal: 200,
    quantidadeParcelasPendentes: 3,
  });
});
