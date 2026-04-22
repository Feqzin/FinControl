import { format } from "date-fns";
import type { Cartao, CompraCartao, Divida, Parcela, ParcelaCompra, Renda, Servico } from "../../shared/schema.js";
import type { FinancialInsight, FinancialScore, FinancialSummary } from "../../shared/financial.js";
import type { FinancialRepository } from "../repositories/financial.repository.js";
import { formatMoneyFixed, parseMoney, toCentsBigInt } from "../../utils/money.js";
import {
  getDebtObligations,
  getDebtPortfolioSummary,
  getMonthlyDebtObligations,
  getOutstandingDebtInstallments,
} from "./financial-debt-analytics.js";
import {
  type CardConsolidatedSummary,
  getCardConsolidatedSummaries,
  getCardPortfolioSummary,
  getMonthlyCardObligations,
  getOutstandingCardInstallments,
} from "./financial-card-analytics.js";

type FinancialContext = {
  dividas: Divida[];
  parcelas: Parcela[];
  parcelasCompra: ParcelaCompra[];
  servicos: Servico[];
  cartoes: Cartao[];
  compras: CompraCartao[];
  rendas: Renda[];
};

export type FinancialSimulationInput = {
  quitarDivida?: number;
  reducaoDespesas?: number;
  rendaExtra?: number;
};

type MoneyValue = string | number | null | undefined;

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

  return { monthlyDebtObligations, totalReceberMes, totalPagarMes };
}

function getMonthlyCardTotals(
  cardInput: Pick<FinancialContext, "compras" | "parcelasCompra">,
  monthReference: string,
) {
  const monthlyCardObligations = getMonthlyCardObligations(cardInput, monthReference);
  const totalCartoesMes = sumMoneyBy(monthlyCardObligations, (row) => row.valor);
  return { monthlyCardObligations, totalCartoesMes };
}

function calculateScoreFromContext({
  dividas,
  parcelas,
  parcelasCompra,
  servicos,
  cartoes,
  compras,
  rendas,
}: Pick<FinancialContext, "dividas" | "parcelas" | "parcelasCompra" | "servicos" | "cartoes" | "compras" | "rendas">): FinancialScore {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = format(new Date(), "yyyy-MM");
  const fatores: FinancialScore["fatores"] = [];
  const debtInput = { dividas, parcelas };
  const cardInput = { compras, parcelasCompra };
  const outstandingDebtInstallments = getOutstandingDebtInstallments(debtInput);
  const debtPortfolio = getDebtPortfolioSummary(debtInput);
  const { totalReceberMes, totalPagarMes } = getMonthlyDebtTotals(debtInput, currentMonth);
  const outstandingCardInstallments = getOutstandingCardInstallments(cardInput);
  const { totalCartoesMes } = getMonthlyCardTotals(cardInput, currentMonth);
  const cardPortfolio = getCardPortfolioSummary(cardInput);

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
  const totalServicos = sumMoneyBy(servicos.filter((s) => s.status === "ativo"), (sv) => sv.valorMensal);

  const entradas = totalRenda + totalReceberMes;
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
    const usado = sumMoneyBy(
      outstandingCardInstallments.filter((row) => row.cartaoId === cartao.id),
      (row) => row.valor,
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

  if (cardPortfolio.totalPendente > 0 && totalRenda > 0) {
    const carteiraSobreRenda = (cardPortfolio.totalPendente / totalRenda) * 100;
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
  servicos,
  cartoes,
  compras,
  rendas,
}: Pick<FinancialContext, "dividas" | "parcelas" | "parcelasCompra" | "servicos" | "cartoes" | "compras" | "rendas">): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), "yyyy-MM");
  const today = format(now, "yyyy-MM-dd");
  const in30 = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");
  const debtInput = { dividas, parcelas };
  const cardInput = { compras, parcelasCompra };
  const debtObligations = getDebtObligations(debtInput);
  const outstandingDebtInstallments = getOutstandingDebtInstallments(debtInput);
  const outstandingCardInstallments = getOutstandingCardInstallments(cardInput);

  const totalRenda = sumMoneyBy(rendas.filter((r) => r.ativo), (r) => r.valor);
  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const totalServicos = sumMoneyBy(servicosAtivos, (sv) => sv.valorMensal);
  const { totalReceberMes, totalPagarMes } = getMonthlyDebtTotals(debtInput, currentMonth);
  const { totalCartoesMes } = getMonthlyCardTotals(cardInput, currentMonth);

  const entradas = totalRenda + totalReceberMes;
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
    insights.push({
      tipo: "negativo",
      texto: `Voce tem ${vencidas.length} obrigacao(oes) vencida(s) totalizando R$ ${formatMoneyText(total)}`,
      icone: "alert",
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
    });
  }

  if (totalServicos > 300) {
    insights.push({
      tipo: "negativo",
      texto: `Seus gastos com servicos/assinaturas sao R$ ${formatMoneyText(totalServicos)} por mes`,
      icone: "repeat",
    });
  } else if (servicosAtivos.length > 0) {
    insights.push({
      tipo: "neutro",
      texto: `Voce tem ${servicosAtivos.length} servico(s) ativo(s) custando R$ ${formatMoneyText(totalServicos)} mensais`,
      icone: "repeat",
    });
  }

  for (const cartao of cartoes) {
    const usado = sumMoneyBy(
      outstandingCardInstallments.filter((row) => row.cartaoId === cartao.id),
      (row) => row.valor,
    );
    const limite = toMoneyNumber(cartao.limite);
    const pct = limite > 0 ? (usado / limite) * 100 : 0;
    if (pct >= 80) {
      insights.push({
        tipo: "negativo",
        texto: `Cartao ${cartao.nome} com ${Math.round(pct)}% do limite comprometido`,
        icone: "card",
      });
    }
  }

  if (saldo < 0) {
    insights.push({
      tipo: "negativo",
      texto: "Mantendo o ritmo atual, seu saldo permanece negativo. Reduza despesas ou aumente receitas.",
      icone: "trend",
    });
  } else if (saldo > 1000) {
    insights.push({
      tipo: "positivo",
      texto: `Excelente! Saldo previsto de R$ ${formatMoneyText(saldo)} - considere criar uma meta de economia`,
      icone: "star",
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
): FinancialContext {
  if (!simulation) return context;

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
      const valor = toMoneyNumber(servico.valorMensal);
      if (remainingReducao >= valor) {
        remainingReducao -= valor;
        return { ...servico, valorMensal: "0" };
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
    servicos: simulatedServicos,
    rendas: simulatedRendas,
  };
}

export class FinancialService {
  constructor(private readonly repository: FinancialRepository) {}

  private async loadContext(userId: string): Promise<FinancialContext> {
    const [dividas, parcelas, parcelasCompra, servicos, cartoes, compras, rendas] = await Promise.all([
      this.repository.getDividas(userId),
      this.repository.getParcelas(userId),
      this.repository.getParcelasCompraByUser(userId),
      this.repository.getServicos(userId),
      this.repository.getCartoes(userId),
      this.repository.getComprasCartao(userId),
      this.repository.getRendas(userId),
    ]);

    return { dividas, parcelas, parcelasCompra, servicos, cartoes, compras, rendas };
  }

  private async loadCardContext(userId: string): Promise<Pick<FinancialContext, "cartoes" | "compras" | "parcelasCompra">> {
    const [cartoes, compras, parcelasCompra] = await Promise.all([
      this.repository.getCartoes(userId),
      this.repository.getComprasCartao(userId),
      this.repository.getParcelasCompraByUser(userId),
    ]);

    return { cartoes, compras, parcelasCompra };
  }

  async getSummary(
    userId: string,
    monthReference?: string,
    simulation?: FinancialSimulationInput,
  ): Promise<FinancialSummary> {
    const ctx = await this.loadContext(userId);
    const simulated = applyFinancialSimulation(ctx, simulation);
    const mesReferencia = resolveMonthReference(monthReference);
    const debtInput = { dividas: simulated.dividas, parcelas: simulated.parcelas };
    const cardInput = { compras: simulated.compras, parcelasCompra: simulated.parcelasCompra };
    const { totalReceberMes, totalPagarMes } = getMonthlyDebtTotals(debtInput, mesReferencia);
    const { totalCartoesMes } = getMonthlyCardTotals(cardInput, mesReferencia);
    const debtPortfolio = getDebtPortfolioSummary(debtInput);

    const totalRenda = sumMoneyBy(simulated.rendas.filter((r) => r.ativo), (r) => r.valor);
    const totalServicos = sumMoneyBy(simulated.servicos.filter((s) => s.status === "ativo"), (sv) => sv.valorMensal);

    const totalEntradas = totalRenda + totalReceberMes;
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
      totalPagarMes: round2(totalPagarMes),
      totalServicos: round2(totalServicos),
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

  async getCardSummaries(userId: string): Promise<CardConsolidatedSummary[]> {
    const { cartoes, compras, parcelasCompra } = await this.loadCardContext(userId);
    return getCardConsolidatedSummaries({ cartoes, compras, parcelasCompra });
  }
}
