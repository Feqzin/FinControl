import { format } from "date-fns";
import type {
  Cartao,
  CartaoFaturaPagamento,
  CompraCartao,
  Divida,
    Parcela,
    ParcelaCompra,
    Patrimonio,
    Pessoa,
    Renda,
    Servico,
    ServicoCobrancaPagamento,
} from "@shared/schema";
import type { DashboardOverviewResponse, FinancialInsight, FinancialScore, FinancialSummary } from "@shared/financial";
import { buildCardInvoiceSnapshots } from "@shared/card-invoice-payments";
import {
  buildServicoCardProjectionInstallments,
  calculateServicoEquivalentMonthlyAmount,
  calculateServicoRealMonthlyExpenseAmount,
  calculateServicoRealChargeForCompetency,
  isServicoLinkedToCardCharge,
} from "@shared/servico-periodicidade";
import { buildCardLimitSummary } from "@shared/card-limit-summary";
import type { FinancialRepository } from "../repositories/financial.repository";
import { formatMoneyFixed, parseMoney, toCentsBigInt } from "../../utils/money";
import { toErrorLog, writeTechnicalLog } from "../logger";
import {
  getDebtObligations,
  getDebtPortfolioSummary,
  getMonthlyDebtObligations,
  getMonthlyReceivedDebtObligations,
  getOutstandingDebtInstallments,
} from "./financial-debt-analytics";
import {
  getCardObligations,
} from "./financial-card-analytics";
import { loadInvoicePaymentsWithAllocations } from "./cartao-fatura-payment-loader";

type FinancialContext = {
  dividas: Divida[];
  parcelas: Parcela[];
  parcelasCompra: ParcelaCompra[];
  cartaoFaturaPagamentos: CartaoFaturaPagamento[];
  servicos: Servico[];
  servicoCobrancaPagamentos: ServicoCobrancaPagamento[];
  cartoes: Cartao[];
  compras: CompraCartao[];
  rendas: Renda[];
};

export type FinancialSimulationInput = {
  quitarDivida?: number;
  reducaoDespesas?: number;
  rendaExtra?: number;
};

export type CardConsolidatedSummary = {
  cartaoId: string;
  faturaAtual: number;
  limiteComprometido: number;
  limiteDisponivel: number;
  saldoRestanteTotal: number;
  quantidadeParcelasPendentes: number;
};

type MoneyValue = string | number | null | undefined;
const RECOVERABLE_CONTEXT_LOAD_ERROR_CODES = new Set(["42P01", "42703"]);
type ServicoSummaryTotals = {
  servicosEquivalenteMensalTotal: number;
  servicosCobrancaRealCompetenciaTotal: number;
  servicosVinculadosCartaoEquivalenteMensalTotal: number;
  servicosVinculadosCartaoCobrancaRealTotal: number;
  servicosNaoVinculadosCartaoEquivalenteMensalTotal: number;
  servicosNaoVinculadosCartaoCobrancaRealTotal: number;
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function centsToMoneyString(cents: number): string {
  const negative = cents < 0;
  const abs = negative ? -cents : cents;
  const intPart = Math.floor(abs / 100);
  const fracPart = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

function sumMoneyValues(values: MoneyValue[]): number {
  const totalCents = values.reduce<number>((sum, value) => sum + (toCentsBigInt(value) ?? 0), 0);
  return parseMoney(centsToMoneyString(totalCents)) ?? 0;
}

function sumMoneyBy<T>(items: T[], valueSelector: (item: T) => MoneyValue): number {
  return sumMoneyValues(items.map(valueSelector));
}

function formatMoneyText(value: number): string {
  return (formatMoneyFixed(value) ?? "0.00").replace(".", ",");
}

function round2(value: number): number {
  return parseMoney(formatMoneyFixed(value)) ?? 0;
}

function resolveMonthReference(input?: string): string {
  if (input && /^\d{4}-\d{2}$/.test(input)) return input;
  return format(new Date(), "yyyy-MM");
}

function isOpenDebtStatus(status: string): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized !== "pago" && normalized !== "cancelado";
}

function isRecoverableContextLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown } | unknown;
  };
  const code =
    (typeof maybeError.code === "string" && maybeError.code) ||
    (typeof maybeError.cause === "object"
      && maybeError.cause
      && typeof (maybeError.cause as { code?: unknown }).code === "string"
      ? ((maybeError.cause as { code?: unknown }).code as string)
      : "");

  if (!RECOVERABLE_CONTEXT_LOAD_ERROR_CODES.has(code)) return false;

  const message = String(maybeError.message ?? "").toLowerCase();
  const causeMessage =
    typeof maybeError.cause === "object" && maybeError.cause
      ? String((maybeError.cause as { message?: unknown }).message ?? "").toLowerCase()
      : "";
  const combined = `${message}\n${causeMessage}`;
  return combined.includes("does not exist")
    || combined.includes("relation")
    || combined.includes("column")
    || combined.includes("undefined");
}

function getMonthlyDebtTotals(
  debtInput: Pick<FinancialContext, "dividas" | "parcelas">,
  monthReference: string,
) {
  const monthlyDebtObligations = getMonthlyDebtObligations(debtInput, monthReference);
  const totalReceberMes = sumMoneyBy(
    monthlyDebtObligations.filter((row) => row.tipo === "receber"),
    (row) => row.valor,
  );
  const totalPagarMes = sumMoneyBy(
    monthlyDebtObligations.filter((row) => row.tipo === "pagar"),
    (row) => row.valor,
  );
  const totalRecebidoMes = sumMoneyBy(
    getMonthlyReceivedDebtObligations(debtInput, monthReference),
    (row) => row.valor,
  );

  return { monthlyDebtObligations, totalReceberMes, totalRecebidoMes, totalPagarMes };
}

function getMonthlyCardTotals(
  cardInput: Pick<FinancialContext, "compras" | "parcelasCompra" | "cartaoFaturaPagamentos" | "cartoes" | "servicos" | "servicoCobrancaPagamentos">,
  monthReference: string,
) {
  const monthlyCardSnapshots = buildMonthlyCardSnapshots(cardInput, [monthReference]).filter(
    (snapshot) => snapshot.monthReference === monthReference,
  );
  const totalCartoesMes = monthlyCardSnapshots.reduce((sum, snapshot) => sum + snapshot.remainingAmount, 0);
  return { monthlyCardSnapshots, totalCartoesMes: round2(totalCartoesMes) };
}

function buildRealPurchaseMonthsByCompraId(
  compras: CompraCartao[],
  parcelasCompra: ParcelaCompra[],
): Map<string, Set<string>> {
  const obligations = getCardObligations({ compras, parcelasCompra });
  const byCompraId = new Map<string, Set<string>>();

  for (const obligation of obligations) {
    if (String(obligation.statusCartao ?? "").trim().toLowerCase() === "cancelado") continue;
    const monthReference = String(obligation.dataVencimento ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthReference)) continue;
    const rows = byCompraId.get(obligation.compraId) ?? new Set<string>();
    rows.add(monthReference);
    byCompraId.set(obligation.compraId, rows);
  }

  return byCompraId;
}

function buildProjectedCardInstallments(
  cardInput: Pick<FinancialContext, "compras" | "parcelasCompra" | "servicos" | "servicoCobrancaPagamentos">,
  monthReferences: string[],
) {
  return buildServicoCardProjectionInstallments({
    servicos: cardInput.servicos,
    monthReferences,
    payments: cardInput.servicoCobrancaPagamentos,
    realPurchaseMonthsByCompraId: buildRealPurchaseMonthsByCompraId(cardInput.compras, cardInput.parcelasCompra),
  }).map((projection) => ({
    id: projection.id,
    cartaoId: projection.cartaoId,
    valor: projection.valorPendente,
    statusCartao: "pendente",
    dataVencimento: projection.dataVencimento,
  }));
}

function buildMonthlyCardSnapshots(
  cardInput: Pick<FinancialContext, "compras" | "parcelasCompra" | "cartaoFaturaPagamentos" | "cartoes" | "servicos" | "servicoCobrancaPagamentos">,
  monthReferences: string[] = [],
) {
  const obligations = getCardObligations({
    compras: cardInput.compras,
    parcelasCompra: cardInput.parcelasCompra,
  });
  const dueDayByCardId = new Map(cardInput.cartoes.map((cartao) => [cartao.id, cartao.diaVencimento]));
  const projectedInstallments = buildProjectedCardInstallments(cardInput, monthReferences);

  return buildCardInvoiceSnapshots({
    installments: [
      ...obligations.map((obligation) => ({
        id: obligation.parcelaCompraId,
        cartaoId: obligation.cartaoId,
        valor: obligation.valor,
        statusCartao: obligation.statusCartao,
        dataVencimento: obligation.dataVencimento,
      })),
      ...projectedInstallments,
    ],
    payments: cardInput.cartaoFaturaPagamentos,
    getDueDayForCard: (cartaoId) => dueDayByCardId.get(cartaoId) ?? null,
    referenceDate: format(new Date(), "yyyy-MM-dd"),
  });
}

function calculateServicoSummaryTotals(
  servicos: Servico[],
  monthReference: string,
): ServicoSummaryTotals {
  const ativos = servicos.filter((servico) => servico.status === "ativo");
  const equivalenteMensalValues: MoneyValue[] = [];
  const cobrancaRealValues: MoneyValue[] = [];
  const vinculadosEquivalenteValues: MoneyValue[] = [];
  const vinculadosCobrancaRealValues: MoneyValue[] = [];
  const naoVinculadosEquivalenteValues: MoneyValue[] = [];
  const naoVinculadosCobrancaRealValues: MoneyValue[] = [];

  for (const servico of ativos) {
    const equivalenteMensal = calculateServicoEquivalentMonthlyAmount(servico);
    const cobrancaRealCompetencia = calculateServicoRealChargeForCompetency(servico, monthReference);
    const vinculadoCartao = isServicoLinkedToCardCharge(servico);

    equivalenteMensalValues.push(equivalenteMensal);
    cobrancaRealValues.push(cobrancaRealCompetencia);

    if (vinculadoCartao) {
      vinculadosEquivalenteValues.push(equivalenteMensal);
      vinculadosCobrancaRealValues.push(cobrancaRealCompetencia);
    } else {
      naoVinculadosEquivalenteValues.push(equivalenteMensal);
      naoVinculadosCobrancaRealValues.push(cobrancaRealCompetencia);
    }
  }

  return {
    servicosEquivalenteMensalTotal: sumMoneyValues(equivalenteMensalValues),
    servicosCobrancaRealCompetenciaTotal: sumMoneyValues(cobrancaRealValues),
    servicosVinculadosCartaoEquivalenteMensalTotal: sumMoneyValues(vinculadosEquivalenteValues),
    servicosVinculadosCartaoCobrancaRealTotal: sumMoneyValues(vinculadosCobrancaRealValues),
    servicosNaoVinculadosCartaoEquivalenteMensalTotal: sumMoneyValues(naoVinculadosEquivalenteValues),
    servicosNaoVinculadosCartaoCobrancaRealTotal: sumMoneyValues(naoVinculadosCobrancaRealValues),
  };
}

function calculateServicoRealMonthlyTotal(
  servicos: Servico[],
  monthReference: string,
): number {
  return servicos
    .filter((servico) => servico.status === "ativo")
    .reduce(
      (sum, servico) => sum + calculateServicoRealMonthlyExpenseAmount(servico, monthReference),
      0,
    );
}

function calculateScoreFromContext({
  dividas,
  parcelas,
  parcelasCompra,
  cartaoFaturaPagamentos,
  servicos,
  servicoCobrancaPagamentos,
  cartoes,
  compras,
  rendas,
}: Pick<FinancialContext, "dividas" | "parcelas" | "parcelasCompra" | "cartaoFaturaPagamentos" | "servicos" | "servicoCobrancaPagamentos" | "cartoes" | "compras" | "rendas">): FinancialScore {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = format(new Date(), "yyyy-MM");
  const fatores: FinancialScore["fatores"] = [];
  const debtInput = { dividas, parcelas };
  const cardInput = {
    compras,
    parcelasCompra,
    cartaoFaturaPagamentos,
    cartoes,
    servicos,
    servicoCobrancaPagamentos,
  };
  const outstandingDebtInstallments = getOutstandingDebtInstallments(debtInput);
  const debtPortfolio = getDebtPortfolioSummary(debtInput);
  const { totalRecebidoMes, totalPagarMes } = getMonthlyDebtTotals(debtInput, currentMonth);
  const { totalCartoesMes } = getMonthlyCardTotals(cardInput, currentMonth);
  const cardSnapshots = buildMonthlyCardSnapshots(cardInput, [currentMonth]);
  const limiteComprometidoTotal = sumMoneyValues(cardSnapshots.map((snapshot) => snapshot.remainingAmount));

  let score = 60;

  const vencidas = outstandingDebtInstallments.filter((row) => row.dataVencimento && row.dataVencimento < today);
  if (vencidas.length === 0) {
    score += 15;
    fatores.push({ label: "Sem dividas vencidas", impacto: +15, tipo: "positivo" });
  } else {
    const penalidade = Math.min(vencidas.length * 8, 30);
    score -= penalidade;
    fatores.push({ label: `${vencidas.length} obrigacao(oes) vencida(s)`, impacto: -penalidade, tipo: "negativo" });
  }

  const totalRenda = sumMoneyBy(rendas.filter((r) => r.ativo), (r) => r.valor);
  const totalServicos = calculateServicoRealMonthlyTotal(servicos, currentMonth);

  const entradas = totalRenda + totalRecebidoMes;
  const saidas = totalPagarMes + totalServicos + totalCartoesMes;
  const saldo = entradas - saidas;

  if (totalRenda > 0) {
    const bonus = Math.min(Math.round(totalRenda / 1000) * 2, 10);
    score += bonus;
    fatores.push({
      label: `Renda mensal cadastrada (${rendas.filter((r) => r.ativo).length} fonte(s))`,
      impacto: +bonus,
      tipo: "positivo",
    });
  }

  if (saldo > 0) {
    const bonus = Math.min(Math.round(saldo / 500), 10);
    score += bonus;
    fatores.push({ label: "Saldo mensal positivo", impacto: +bonus, tipo: "positivo" });
  } else if (saldo < 0) {
    score -= 20;
    fatores.push({ label: "Saldo mensal negativo", impacto: -20, tipo: "negativo" });
  }

  if (totalRenda > 0 && saidas > 0) {
    const comprometimento = (saidas / entradas) * 100;
    if (comprometimento < 50) {
      score += 5;
      fatores.push({ label: `${Math.round(comprometimento)}% da renda comprometida`, impacto: +5, tipo: "positivo" });
    } else if (comprometimento > 90) {
      score -= 10;
      fatores.push({ label: `${Math.round(comprometimento)}% da renda comprometida`, impacto: -10, tipo: "negativo" });
    }
  }

  const cardPenalidades: string[] = [];
  let totalCardPenalty = 0;
  for (const cartao of cartoes) {
    const usado = sumMoneyValues(
      cardSnapshots
        .filter((snapshot) => snapshot.cartaoId === cartao.id)
        .map((snapshot) => snapshot.remainingAmount),
    );
    const limite = toMoneyNumber(cartao.limite);
    const pct = limite > 0 ? (usado / limite) * 100 : 0;
    if (pct >= 80) {
      totalCardPenalty += 10;
      cardPenalidades.push(`${cartao.nome} ${Math.round(pct)}%`);
    } else if (pct >= 60) {
      totalCardPenalty += 5;
    } else if (pct < 30 && pct > 0) {
      score += 3;
    }
  }
  if (totalCardPenalty > 0) {
    const pen = Math.min(totalCardPenalty, 20);
    score -= pen;
    fatores.push({ label: `Uso elevado: ${cardPenalidades.join(", ")}`, impacto: -pen, tipo: "negativo" });
  } else if (cartoes.length > 0) {
    fatores.push({ label: "Uso de cartao saudavel", impacto: +3, tipo: "positivo" });
  }

  if (limiteComprometidoTotal > 0 && totalRenda > 0) {
    const carteiraSobreRenda = (limiteComprometidoTotal / totalRenda) * 100;
    if (carteiraSobreRenda > 100) {
      score -= 5;
      fatores.push({
        label: `Saldo restante no cartao em ${Math.round(carteiraSobreRenda)}% da renda mensal`,
        impacto: -5,
        tipo: "negativo",
      });
    }
  }

  const pagas = debtPortfolio.obrigacoes.pagas;
  const total = debtPortfolio.obrigacoes.total;
  if (total > 0 && pagas / total >= 0.5) {
    score += 5;
    fatores.push({ label: "Bom historico de quitacao", impacto: +5, tipo: "positivo" });
  }

  score = Math.max(0, Math.min(100, score));

  let classificacao: FinancialScore["classificacao"];
  if (score >= 80) classificacao = "Otima";
  else if (score >= 60) classificacao = "Boa";
  else if (score >= 40) classificacao = "Atencao";
  else classificacao = "Risco";

  const tendencia: FinancialScore["tendencia"] =
    vencidas.length > 2 ? "piorando" : saldo > 0 ? "melhorando" : "estavel";

  return { valor: score, classificacao, tendencia, fatores };
}

function generateInsightsFromContext({
  dividas,
  parcelas,
  parcelasCompra,
  cartaoFaturaPagamentos,
  servicos,
  servicoCobrancaPagamentos,
  cartoes,
  compras,
  rendas,
}: Pick<FinancialContext, "dividas" | "parcelas" | "parcelasCompra" | "cartaoFaturaPagamentos" | "servicos" | "servicoCobrancaPagamentos" | "cartoes" | "compras" | "rendas">): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), "yyyy-MM");
  const today = format(now, "yyyy-MM-dd");
  const in30 = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");
  const debtInput = { dividas, parcelas };
  const cardInput = {
    compras,
    parcelasCompra,
    cartaoFaturaPagamentos,
    cartoes,
    servicos,
    servicoCobrancaPagamentos,
  };
  const debtObligations = getDebtObligations(debtInput);
  const outstandingDebtInstallments = getOutstandingDebtInstallments(debtInput);
  const cardSnapshots = buildMonthlyCardSnapshots(cardInput, [currentMonth]);

  const totalRenda = sumMoneyBy(rendas.filter((r) => r.ativo), (r) => r.valor);
  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const totalServicos = calculateServicoRealMonthlyTotal(servicosAtivos, currentMonth);
  const { totalRecebidoMes, totalPagarMes } = getMonthlyDebtTotals(debtInput, currentMonth);
  const { totalCartoesMes } = getMonthlyCardTotals(cardInput, currentMonth);

  const entradas = totalRenda + totalRecebidoMes;
  const saidas = totalPagarMes + totalServicos + totalCartoesMes;
  const saldo = entradas - saidas;

  const pagosMes = debtObligations.filter((row) => row.status === "pago" && String(row.dataPagamento || "").startsWith(currentMonth)).length;
  const pagosMesAnterior = debtObligations.filter((row) => row.status === "pago" && String(row.dataPagamento || "").startsWith(prevMonth)).length;
  if (pagosMes > 0 && pagosMes > pagosMesAnterior) {
    insights.push({ tipo: "positivo", texto: `Voce quitou ${pagosMes} obrigacao(oes) este mes - mais que no mes anterior!`, icone: "trophy" });
  }

  const vencidas = outstandingDebtInstallments.filter((row) => row.dataVencimento && row.dataVencimento < today);
  if (vencidas.length > 0) {
    const total = sumMoneyBy(vencidas, (row) => row.valor);
    const dividasVencidasIds = Array.from(new Set(vencidas.map((row) => row.dividaId).filter(Boolean)));
    const highlightDividaId = dividasVencidasIds.length === 1 ? dividasVencidasIds[0] : null;
    const pathDividasVencidas = highlightDividaId
      ? `/dividas?status=vencido&highlight=${highlightDividaId}`
      : "/dividas?status=vencido";
    insights.push({
      tipo: "negativo",
      texto: `Voce tem ${vencidas.length} obrigacao(oes) vencida(s) totalizando R$ ${formatMoneyText(total)}`,
      icone: "alert",
      acao: {
        tipo: "abrir_dividas",
        label: "Ver pendencia",
        path: pathDividasVencidas,
        entidadeTipo: "divida",
        entidadeId: highlightDividaId ?? undefined,
        filtros: { status: "vencido" },
      },
    });
  }

  if (totalRenda > 0 && saidas > 0) {
    const comprometimento = (saidas / (entradas || 1)) * 100;
    if (comprometimento > 80) {
      insights.push({
        tipo: "negativo",
        texto: `Atencao: ${Math.round(comprometimento)}% da sua renda esta comprometida com despesas`,
        icone: "alert",
      });
    } else if (comprometimento < 50 && entradas > 0) {
      insights.push({
        tipo: "positivo",
        texto: `Otimo! Apenas ${Math.round(comprometimento)}% da renda esta comprometida`,
        icone: "star",
      });
    }
  }

  const receber30Dividas = outstandingDebtInstallments
    .filter((row) =>
      row.tipo === "receber"
      && row.dataVencimento
      && row.dataVencimento >= today
      && row.dataVencimento <= in30,
    );
  const receber30 = sumMoneyBy(receber30Dividas, (row) => row.valor);
  if (receber30 > 0) {
    insights.push({
      tipo: "positivo",
      texto: `Voce tem R$ ${formatMoneyText(receber30)} a receber nos proximos 30 dias`,
      icone: "money",
      acao: {
        tipo: "abrir_dividas",
        label: "Ver detalhes",
        path: "/dividas?status=pendente&tipo=receber",
        entidadeTipo: "divida",
        filtros: { status: "pendente", tipo: "receber" },
      },
    });
  }

  if (totalServicos > 300) {
    insights.push({
      tipo: "negativo",
      texto: `Seus servicos/assinaturas geram R$ ${formatMoneyText(totalServicos)} em cobrancas reais neste mes`,
      icone: "repeat",
      acao: {
        tipo: "abrir_servicos",
        label: "Ver detalhes",
        path: "/servicos",
        entidadeTipo: "servico",
      },
    });
  } else if (servicosAtivos.length > 0) {
    insights.push({
      tipo: "neutro",
      texto: totalServicos > 0
        ? `Voce tem ${servicosAtivos.length} servico(s) ativo(s) com R$ ${formatMoneyText(totalServicos)} em cobrancas reais neste mes`
        : `Voce tem ${servicosAtivos.length} servico(s) ativo(s), mas nenhum gera cobranca real neste mes`,
      icone: "repeat",
      acao: {
        tipo: "abrir_servicos",
        label: "Ver detalhes",
        path: "/servicos",
        entidadeTipo: "servico",
      },
    });
  }

  for (const cartao of cartoes) {
    const usado = sumMoneyValues(
      cardSnapshots
        .filter((snapshot) => snapshot.cartaoId === cartao.id)
        .map((snapshot) => snapshot.remainingAmount),
    );
    const limite = toMoneyNumber(cartao.limite);
    const pct = limite > 0 ? (usado / limite) * 100 : 0;
    if (pct >= 80) {
      insights.push({
        tipo: "negativo",
        texto: `Cartao ${cartao.nome} com ${Math.round(pct)}% do limite comprometido`,
        icone: "card",
        acao: {
          tipo: "abrir_cartao",
          label: "Ver detalhes",
          path: `/cartoes?cartaoId=${cartao.id}`,
          entidadeTipo: "cartao",
          entidadeId: cartao.id,
          filtros: { cartaoId: cartao.id },
        },
      });
    }
  }

  if (saldo < 0) {
    insights.push({
      tipo: "negativo",
      texto: "Mantendo o ritmo atual, seu saldo permanece negativo. Reduza despesas ou aumente receitas.",
      icone: "trend",
      acao: {
        tipo: "abrir_previsao",
        label: "Ver detalhes",
        path: "/previsao",
        entidadeTipo: "previsao",
      },
    });
  } else if (saldo > 1000) {
    insights.push({
      tipo: "positivo",
      texto: `Excelente! Saldo previsto de R$ ${formatMoneyText(saldo)} - considere criar uma meta de economia`,
      icone: "star",
      acao: {
        tipo: "abrir_metas",
        label: "Ver metas",
        path: "/metas",
        entidadeTipo: "meta",
      },
    });
  }

  return insights.slice(0, 5);
}

function resolveContextUserId(context: FinancialContext): string {
  return (
    context.rendas[0]?.userId
    || context.dividas[0]?.userId
    || context.servicos[0]?.userId
    || context.cartoes[0]?.userId
    || context.compras[0]?.userId
    || context.parcelasCompra[0]?.userId
    || context.parcelas[0]?.userId
    || "sim"
  );
}

function applyFinancialSimulation(
  context: FinancialContext,
  simulation?: FinancialSimulationInput,
  monthReference?: string,
): FinancialContext {
  if (!simulation) return context;
  const targetMonthReference = resolveMonthReference(monthReference);

  const quitarDivida = Math.max(0, simulation.quitarDivida ?? 0);
  const reducaoDespesas = Math.max(0, simulation.reducaoDespesas ?? 0);
  const rendaExtra = Math.max(0, simulation.rendaExtra ?? 0);

  if (quitarDivida === 0 && reducaoDespesas === 0 && rendaExtra === 0) return context;

  let remainingQuitar = quitarDivida;
  const simulatedParcelas = context.parcelas.map((parcela) => ({ ...parcela }));
  const parcelasPendentesOrdenadas = simulatedParcelas
    .filter((parcela) => isOpenDebtStatus(parcela.status))
    .sort((a, b) => {
      const dateOrder = String(a.dataVencimento || "").localeCompare(String(b.dataVencimento || ""));
      if (dateOrder !== 0) return dateOrder;
      return a.numero - b.numero;
    });

  for (const parcela of parcelasPendentesOrdenadas) {
    if (remainingQuitar <= 0) break;
    const valor = toMoneyNumber(parcela.valor);
    if (remainingQuitar >= valor) {
      remainingQuitar -= valor;
      parcela.status = "pago";
      parcela.dataPagamento = format(new Date(), "yyyy-MM-dd");
      parcela.formaPagamento = parcela.formaPagamento || "simulacao";
    }
  }

  const parcelasByDivida = new Map<string, Parcela[]>();
  for (const parcela of simulatedParcelas) {
    const rows = parcelasByDivida.get(parcela.dividaId) ?? [];
    rows.push(parcela);
    parcelasByDivida.set(parcela.dividaId, rows);
  }

  const simulatedDividas = context.dividas.map((divida) => {
    const linkedParcelas = parcelasByDivida.get(divida.id) ?? [];
    if (linkedParcelas.length > 0) {
      const todasPagas = linkedParcelas.every((parcela) => parcela.status === "pago");
      return todasPagas
        ? { ...divida, status: "pago" as const, dataPagamento: format(new Date(), "yyyy-MM-dd") }
        : divida;
    }

    if (isOpenDebtStatus(divida.status) && divida.tipo === "pagar" && remainingQuitar > 0) {
      const valor = toMoneyNumber(divida.valor);
      if (remainingQuitar >= valor) {
        remainingQuitar -= valor;
        return { ...divida, status: "pago" as const, dataPagamento: format(new Date(), "yyyy-MM-dd") };
      }
    }
    return divida;
  });

  let remainingReducao = reducaoDespesas;
  const simulatedServicos = context.servicos.map((servico) => {
    if (servico.status === "ativo" && remainingReducao > 0) {
      const valor = calculateServicoRealMonthlyExpenseAmount(servico, targetMonthReference);
      if (remainingReducao >= valor) {
        remainingReducao -= valor;
        return { ...servico, valorMensal: "0", valorCobranca: "0" };
      }
    }
    return servico;
  });

  const simulatedRendas = [...context.rendas];
  if (rendaExtra > 0) {
    simulatedRendas.push({
      id: "__sim_renda_extra__",
      userId: resolveContextUserId(context),
      tipo: "fixo",
      descricao: "Renda Extra (Simulacao)",
      valor: String(round2(rendaExtra)),
      diaRecebimento: 1,
      ativo: true,
    });
  }

  return {
    ...context,
    dividas: simulatedDividas,
    parcelas: simulatedParcelas,
    parcelasCompra: context.parcelasCompra,
    cartaoFaturaPagamentos: context.cartaoFaturaPagamentos,
    servicos: simulatedServicos,
    rendas: simulatedRendas,
  };
}

export class FinancialService {
  constructor(private readonly repository: FinancialRepository) {}

  private async loadContextSlice<T>(
    userId: string,
    contextKey: string,
    loader: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await loader();
    } catch (error) {
      if (!isRecoverableContextLoadError(error)) {
        throw error;
      }

      writeTechnicalLog({
        event: "financial.context.partial_fallback",
        source: "financial.service",
        level: "warn",
        data: {
          userId,
          contextKey,
          reason: "recoverable_schema_error",
          error: toErrorLog(error),
        },
      });

      return fallback;
    }
  }

  private async loadContext(userId: string): Promise<FinancialContext> {
    const [dividas, parcelas, parcelasCompra, cartaoFaturaPagamentos, servicos, servicoCobrancaPagamentos, cartoes, compras, rendas] = await Promise.all([
      this.loadContextSlice(userId, "dividas", () => this.repository.getDividas(userId), [] as Divida[]),
      this.loadContextSlice(userId, "parcelas", () => this.repository.getParcelas(userId), [] as Parcela[]),
      this.loadContextSlice(
        userId,
        "parcelas_compra",
        () => this.repository.getParcelasCompraByUser(userId),
        [] as ParcelaCompra[],
      ),
      this.loadContextSlice(
        userId,
        "cartao_fatura_pagamentos",
        () => loadInvoicePaymentsWithAllocations(this.repository, userId),
        [] as CartaoFaturaPagamento[],
      ),
      this.loadContextSlice(userId, "servicos", () => this.repository.getServicos(userId), [] as Servico[]),
      this.loadContextSlice(
        userId,
        "servico_cobranca_pagamentos",
        () => this.repository.getServicoCobrancaPagamentos(userId),
        [] as ServicoCobrancaPagamento[],
      ),
      this.loadContextSlice(userId, "cartoes", () => this.repository.getCartoes(userId), [] as Cartao[]),
      this.loadContextSlice(
        userId,
        "compras_cartao",
        () => this.repository.getComprasCartao(userId),
        [] as CompraCartao[],
      ),
      this.loadContextSlice(userId, "rendas", () => this.repository.getRendas(userId), [] as Renda[]),
    ]);

    return { dividas, parcelas, parcelasCompra, cartaoFaturaPagamentos, servicos, servicoCobrancaPagamentos, cartoes, compras, rendas };
  }

  async getSummary(
    userId: string,
    monthReference?: string,
    simulation?: FinancialSimulationInput,
  ): Promise<FinancialSummary> {
    const ctx = await this.loadContext(userId);
    const mesReferencia = resolveMonthReference(monthReference);
    const simulated = applyFinancialSimulation(ctx, simulation, mesReferencia);
    const debtInput = { dividas: simulated.dividas, parcelas: simulated.parcelas };
    const cardInput = {
      compras: simulated.compras,
      parcelasCompra: simulated.parcelasCompra,
      cartaoFaturaPagamentos: simulated.cartaoFaturaPagamentos,
      cartoes: simulated.cartoes,
      servicos: simulated.servicos,
      servicoCobrancaPagamentos: simulated.servicoCobrancaPagamentos,
    };
    const { totalReceberMes, totalRecebidoMes, totalPagarMes } = getMonthlyDebtTotals(debtInput, mesReferencia);
    const { totalCartoesMes } = getMonthlyCardTotals(cardInput, mesReferencia);
    const debtPortfolio = getDebtPortfolioSummary(debtInput);
    const servicoSummaryTotals = calculateServicoSummaryTotals(simulated.servicos, mesReferencia);

    const totalRenda = sumMoneyBy(simulated.rendas.filter((r) => r.ativo), (r) => r.valor);
    const totalServicos = servicoSummaryTotals.servicosNaoVinculadosCartaoCobrancaRealTotal;

    const totalEntradas = totalRenda + totalRecebidoMes;
    const totalSaidas = totalPagarMes + totalServicos + totalCartoesMes;
    const saldo = totalEntradas - totalSaidas;

    const parcelasPagas = simulated.parcelas.filter((p) => p.status === "pago");
    const parcelasPendentes = simulated.parcelas.filter((p) => p.status === "pendente");

    return {
      mesReferencia,
      totalEntradas: round2(totalEntradas),
      totalSaidas: round2(totalSaidas),
      saldo: round2(saldo),
      totalRenda: round2(totalRenda),
      totalReceberMes: round2(totalReceberMes),
      totalRecebidoMes: round2(totalRecebidoMes),
      totalPagarMes: round2(totalPagarMes),
      totalServicos: round2(totalServicos),
      servicosEquivalenteMensalTotal: round2(servicoSummaryTotals.servicosEquivalenteMensalTotal),
      servicosCobrancaRealCompetenciaTotal: round2(servicoSummaryTotals.servicosCobrancaRealCompetenciaTotal),
      servicosVinculadosCartaoEquivalenteMensalTotal: round2(servicoSummaryTotals.servicosVinculadosCartaoEquivalenteMensalTotal),
      servicosVinculadosCartaoCobrancaRealTotal: round2(servicoSummaryTotals.servicosVinculadosCartaoCobrancaRealTotal),
      servicosNaoVinculadosCartaoEquivalenteMensalTotal: round2(servicoSummaryTotals.servicosNaoVinculadosCartaoEquivalenteMensalTotal),
      servicosNaoVinculadosCartaoCobrancaRealTotal: round2(servicoSummaryTotals.servicosNaoVinculadosCartaoCobrancaRealTotal),
      totalCartoesMes: round2(totalCartoesMes),
      dividaTotal: round2(debtPortfolio.totalContratado),
      dividaTotalPendente: round2(debtPortfolio.totalPendente),
      dividaTotalPaga: round2(debtPortfolio.totalPago),
      parcelas: {
        total: simulated.parcelas.length,
        pagas: parcelasPagas.length,
        pendentes: parcelasPendentes.length,
        valorPago: round2(sumMoneyBy(parcelasPagas, (p) => p.valor)),
        valorPendente: round2(sumMoneyBy(parcelasPendentes, (p) => p.valor)),
      },
    };
  }

  async getDashboardOverview(
    userId: string,
    monthReference?: string,
    simulation?: FinancialSimulationInput,
  ): Promise<DashboardOverviewResponse> {
    const [ctx, pessoas, patrimonios, financialSummary] = await Promise.all([
      this.loadContext(userId),
      this.loadContextSlice(userId, "pessoas", () => this.repository.getPessoas(userId), [] as Pessoa[]),
      this.loadContextSlice(userId, "patrimonios", () => this.repository.getPatrimonios(userId), [] as Patrimonio[]),
      this.getSummary(userId, monthReference, simulation),
    ]);

    const simulated = applyFinancialSimulation(ctx, simulation, financialSummary.mesReferencia);

    return {
      mesReferencia: financialSummary.mesReferencia,
      dividas: simulated.dividas,
      parcelas: simulated.parcelas,
      servicos: simulated.servicos,
      servicoCobrancaPagamentos: simulated.servicoCobrancaPagamentos,
      pessoas,
      cartoes: simulated.cartoes,
      compras: simulated.compras,
      parcelasCompra: simulated.parcelasCompra,
      cartaoFaturaPagamentos: simulated.cartaoFaturaPagamentos,
      rendas: simulated.rendas,
      patrimonios,
      financialSummary,
      financialScore: calculateScoreFromContext(simulated),
      financialInsights: generateInsightsFromContext(simulated),
    };
  }

  async getCardSummaries(userId: string): Promise<CardConsolidatedSummary[]> {
    const [cartoes, compras, parcelasCompra, cartaoFaturaPagamentos, servicos, servicoCobrancaPagamentos] = await Promise.all([
      this.repository.getCartoes(userId),
      this.repository.getComprasCartao(userId),
      this.repository.getParcelasCompraByUser(userId),
      this.loadContextSlice(
        userId,
        "cartao_fatura_pagamentos",
        () => loadInvoicePaymentsWithAllocations(this.repository, userId),
        [] as CartaoFaturaPagamento[],
      ),
      this.loadContextSlice(userId, "servicos", () => this.repository.getServicos(userId), [] as Servico[]),
      this.loadContextSlice(
        userId,
        "servico_cobranca_pagamentos",
        () => this.repository.getServicoCobrancaPagamentos(userId),
        [] as ServicoCobrancaPagamento[],
      ),
    ]);

    const currentMonthReference = format(new Date(), "yyyy-MM");
    const allObligations = getCardObligations({ compras, parcelasCompra });
    const byCard = new Map<string, typeof allObligations>();
    for (const row of allObligations) {
      const rows = byCard.get(row.cartaoId) ?? [];
      rows.push(row);
      byCard.set(row.cartaoId, rows);
    }

    return cartoes.map((cartao) => {
      const cardRows = byCard.get(cartao.id) ?? [];
      const summary = buildCardLimitSummary({
        cartaoId: cartao.id,
        limiteTotal: cartao.limite,
        monthReference: currentMonthReference,
        installments: [
          ...cardRows,
          ...buildProjectedCardInstallments(
            {
              compras,
              parcelasCompra,
              servicos,
              servicoCobrancaPagamentos,
            },
            [currentMonthReference],
          ).filter((row) => row.cartaoId === cartao.id),
        ],
        invoicePayments: cartaoFaturaPagamentos.filter((pagamento) => pagamento.cartaoId === cartao.id),
        getDueDayForCard: () => cartao.diaVencimento,
        referenceDate: format(new Date(), "yyyy-MM-dd"),
      });

      return {
        cartaoId: cartao.id,
        ...summary,
      };
    });
  }

  async getScore(userId: string, simulation?: FinancialSimulationInput): Promise<FinancialScore> {
    const ctx = await this.loadContext(userId);
    const simulated = applyFinancialSimulation(ctx, simulation);
    return calculateScoreFromContext(simulated);
  }

  async getInsights(userId: string, simulation?: FinancialSimulationInput): Promise<FinancialInsight[]> {
    const ctx = await this.loadContext(userId);
    const simulated = applyFinancialSimulation(ctx, simulation);
    return generateInsightsFromContext(simulated);
  }
}
