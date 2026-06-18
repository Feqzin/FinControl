import { addMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Parcela,
  ParcelaCompra,
  Patrimonio,
  Renda,
  Servico,
} from "@shared/schema";
import { resolveDueDateFromCompetencia } from "@shared/parcelas-compra-competency";
import { buildFinancialCalendarEvents } from "@/lib/financial-calendar";
import { divide, formatMoneyFixed, toMoneyNumber, toCents } from "@/lib/money";

export type FuturePurchaseSimulationStatus = "Pode comprar" | "Atenção" | "Não recomendado";

export type FuturePurchaseExtraReceivable = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  recorrente: boolean;
};

export type FuturePurchaseSimulationContext = {
  cartoes: Cartao[];
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  dividas: Divida[];
  parcelas: Parcela[];
  servicos: Servico[];
  rendas: Renda[];
  patrimonios: Patrimonio[];
  referenceDate?: string;
};

export type FuturePurchaseSimulationInput = {
  nomeCompra: string;
  valorTotal: number;
  parcelas: number;
  cartaoId: string;
  mesPrimeiraParcela: string;
  reservaMinima: number;
  entradasExtras: FuturePurchaseExtraReceivable[];
};

export type FuturePurchaseSimulationMonth = {
  monthReference: string;
  label: string;
  startingBalance: number;
  actualIncome: number;
  simulatedExtraIncome: number;
  actualExpenses: number;
  simulatedInstallment: number;
  endingBalance: number;
  belowZero: boolean;
  belowReserve: boolean;
};

export type FuturePurchaseSimulationSuggestion = {
  kind: "fit" | "reserve" | "negative" | "extra_income" | "installments";
  text: string;
};

export type FuturePurchaseSimulationResult = {
  status: FuturePurchaseSimulationStatus;
  months: FuturePurchaseSimulationMonth[];
  worstMonth: FuturePurchaseSimulationMonth | null;
  lowestBalance: number;
  safePurchaseAmount: number;
  recommendedInstallmentCount: number | null;
  extraAmountNeeded: number;
  monthsBelowReserveCount: number;
  monthsNegativeCount: number;
  installmentAmount: number;
  initialAvailableBalance: number;
  suggestions: FuturePurchaseSimulationSuggestion[];
};

type BaseCashflowMonth = {
  monthReference: string;
  label: string;
  actualIncome: number;
  simulatedExtraIncome: number;
  actualExpenses: number;
};

type TemporaryReceivableEntry = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  monthReference: string;
};

const CASHFLOW_SOURCES = new Set([
  "renda_prevista",
  "divida_receber",
  "divida_pagar",
  "servico",
  "fatura_cartao",
]);

const LIQUID_PATRIMONIO_TYPES = new Set(["conta_bancaria", "dinheiro", "poupanca"]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isMonthReference(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function normalizeMonthReference(value: string, fallback: string): string {
  return isMonthReference(value) ? value : fallback;
}

function listMonthReferences(startMonthReference: string, totalMonths: number): string[] {
  const start = parseISO(`${startMonthReference}-01`);
  return Array.from({ length: totalMonths }, (_, index) => format(addMonths(start, index), "yyyy-MM"));
}

function compareMonthReference(left: string, right: string): number {
  return left.localeCompare(right);
}

function getLiquidBalance(patrimonios: Patrimonio[]): number {
  return round2(
    patrimonios
      .filter((patrimonio) => LIQUID_PATRIMONIO_TYPES.has(String(patrimonio.tipo ?? "")))
      .reduce((sum, patrimonio) => sum + toMoneyNumber(patrimonio.valorAtual), 0),
  );
}

function resolveInstallmentAmount(totalAmount: number, installmentCount: number): number {
  const value = divide(formatMoneyFixed(totalAmount) ?? "0.00", installmentCount);
  return round2(toMoneyNumber(value));
}

function buildInstallmentSchedule(params: {
  card: Cartao | undefined;
  totalAmount: number;
  installmentCount: number;
  firstInstallmentMonth: string;
}): Map<string, number> {
  const schedule = new Map<string, number>();
  const installmentAmount = resolveInstallmentAmount(params.totalAmount, params.installmentCount);
  const months = listMonthReferences(params.firstInstallmentMonth, params.installmentCount);

  for (const monthReference of months) {
    const current = schedule.get(monthReference) ?? 0;
    schedule.set(monthReference, round2(current + installmentAmount));
  }

  return schedule;
}

export function includeTemporaryReceivables(
  monthReference: string,
  receivables: FuturePurchaseExtraReceivable[],
): TemporaryReceivableEntry[] {
  return receivables.flatMap((receivable) => {
    const amount = Number(receivable.valor);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const date = String(receivable.data ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

    const startMonthReference = date.slice(0, 7);
    const shouldInclude = receivable.recorrente
      ? compareMonthReference(monthReference, startMonthReference) >= 0
      : monthReference === startMonthReference;

    if (!shouldInclude) return [];

    const day = Number(date.slice(8, 10)) || 1;
    const resolvedDate = resolveDueDateFromCompetencia({
      competencia: monthReference,
      diaVencimento: day,
      fallbackDataVencimento: date,
    });

    if (!resolvedDate) return [];

    return [{
      id: `${receivable.id}-${monthReference}`,
      descricao: receivable.descricao.trim() || "Entrada extra",
      valor: round2(amount),
      data: resolvedDate,
      monthReference,
    }];
  });
}

function buildBaseCashflowMonths(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
  currentMonthReference: string,
): BaseCashflowMonth[] {
  const firstInstallmentMonth = normalizeMonthReference(input.mesPrimeiraParcela, currentMonthReference);
  const installmentCount = Math.max(1, Math.trunc(Number(input.parcelas) || 1));
  const startMonthReference = currentMonthReference;
  const startDate = parseISO(`${startMonthReference}-01`);
  const firstInstallmentDate = parseISO(`${firstInstallmentMonth}-01`);
  const monthOffsetUntilFirstInstallment = Math.max(
    0,
    (firstInstallmentDate.getFullYear() - startDate.getFullYear()) * 12 + (firstInstallmentDate.getMonth() - startDate.getMonth()),
  );
  const totalMonths = Math.max(installmentCount, monthOffsetUntilFirstInstallment + installmentCount);
  const monthReferences = listMonthReferences(startMonthReference, totalMonths);

  return monthReferences.map((monthReference) => {
    const events = buildFinancialCalendarEvents({
      monthReference,
      cartoes: context.cartoes,
      compras: context.compras,
      parcelasCompra: context.parcelasCompra,
      dividas: context.dividas,
      parcelas: context.parcelas,
      pessoas: [],
      servicos: context.servicos,
      rendas: context.rendas,
      metas: [],
      referenceDate: context.referenceDate,
    }).filter((event) => CASHFLOW_SOURCES.has(event.source));

    const actualIncome = round2(
      events
        .filter((event) => event.direction === "entrada")
        .reduce((sum, event) => sum + (event.amount ?? 0), 0),
    );
    const actualExpenses = round2(
      events
        .filter((event) => event.direction === "saida")
        .reduce((sum, event) => sum + (event.amount ?? 0), 0),
    );
    const temporaryReceivables = includeTemporaryReceivables(monthReference, input.entradasExtras);
    const simulatedExtraIncome = round2(
      temporaryReceivables.reduce((sum, receivable) => sum + receivable.valor, 0),
    );

    return {
      monthReference,
      label: format(parseISO(`${monthReference}-01`), "MMM 'de' yyyy", { locale: ptBR }),
      actualIncome,
      simulatedExtraIncome,
      actualExpenses,
    };
  });
}

function applyInstallmentsToBaseMonths(
  baseMonths: BaseCashflowMonth[],
  initialAvailableBalance: number,
  installmentSchedule: Map<string, number>,
  minimumReserve: number,
): FuturePurchaseSimulationMonth[] {
  let rollingBalance = round2(initialAvailableBalance);

  return baseMonths.map((month) => {
    const startingBalance = rollingBalance;
    const simulatedInstallment = round2(installmentSchedule.get(month.monthReference) ?? 0);
    const endingBalance = round2(
      startingBalance + month.actualIncome + month.simulatedExtraIncome - month.actualExpenses - simulatedInstallment,
    );

    rollingBalance = endingBalance;

    return {
      monthReference: month.monthReference,
      label: month.label,
      startingBalance,
      actualIncome: month.actualIncome,
      simulatedExtraIncome: month.simulatedExtraIncome,
      actualExpenses: month.actualExpenses,
      simulatedInstallment,
      endingBalance,
      belowZero: endingBalance < 0,
      belowReserve: endingBalance < minimumReserve,
    };
  });
}

function getStatus(months: FuturePurchaseSimulationMonth[], minimumReserve: number): FuturePurchaseSimulationStatus {
  if (months.some((month) => month.endingBalance < 0)) {
    return "Não recomendado";
  }

  if (minimumReserve > 0 && months.some((month) => month.endingBalance < minimumReserve)) {
    return "Atenção";
  }

  return "Pode comprar";
}

function getLowestBalance(months: FuturePurchaseSimulationMonth[]): number {
  if (months.length === 0) return 0;
  return months.reduce((lowest, month) => Math.min(lowest, month.endingBalance), months[0].endingBalance);
}

function findWorstMonth(months: FuturePurchaseSimulationMonth[]): FuturePurchaseSimulationMonth | null {
  if (months.length === 0) return null;
  return months.reduce((worst, month) => (month.endingBalance < worst.endingBalance ? month : worst), months[0]);
}

export function projectFuturePurchaseCashflow(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): FuturePurchaseSimulationMonth[] {
  const currentMonthReference = format(new Date(), "yyyy-MM");
  const normalizedInput: FuturePurchaseSimulationInput = {
    ...input,
    valorTotal: Math.max(0, round2(Number(input.valorTotal) || 0)),
    parcelas: Math.max(1, Math.trunc(Number(input.parcelas) || 1)),
    mesPrimeiraParcela: normalizeMonthReference(input.mesPrimeiraParcela, currentMonthReference),
    reservaMinima: Math.max(0, round2(Number(input.reservaMinima) || 0)),
  };

  const initialAvailableBalance = getLiquidBalance(context.patrimonios);
  const baseMonths = buildBaseCashflowMonths(context, normalizedInput, currentMonthReference);
  const installmentSchedule = buildInstallmentSchedule({
    card: context.cartoes.find((cartao) => cartao.id === normalizedInput.cartaoId),
    totalAmount: normalizedInput.valorTotal,
    installmentCount: normalizedInput.parcelas,
    firstInstallmentMonth: normalizedInput.mesPrimeiraParcela,
  });

  return applyInstallmentsToBaseMonths(
    baseMonths,
    initialAvailableBalance,
    installmentSchedule,
    normalizedInput.reservaMinima,
  );
}

export function calculateSafePurchaseAmount(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): number {
  const normalizedInput: FuturePurchaseSimulationInput = {
    ...input,
    valorTotal: Math.max(0, round2(Number(input.valorTotal) || 0)),
    parcelas: Math.max(1, Math.trunc(Number(input.parcelas) || 1)),
    reservaMinima: Math.max(0, round2(Number(input.reservaMinima) || 0)),
  };

  const baselineMonths = projectFuturePurchaseCashflow(context, {
    ...normalizedInput,
    valorTotal: 0,
  });

  const baselineThreshold = Math.max(0, normalizedInput.reservaMinima);
  if (baselineMonths.some((month) => month.endingBalance < baselineThreshold)) {
    return 0;
  }

  const fits = (candidateAmount: number): boolean => {
    const candidateMonths = projectFuturePurchaseCashflow(context, {
      ...normalizedInput,
      valorTotal: candidateAmount,
    });

    return candidateMonths.every((month) => month.endingBalance >= baselineThreshold);
  };

  let low = 0;
  let high = Math.max(toCents(normalizedInput.valorTotal) ?? 0, 10_000);

  while (fits(high / 100) && high < 100_000_000) {
    low = high;
    high *= 2;
  }

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid / 100)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round2(low / 100);
}

function calculateRecommendedInstallmentCount(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): number | null {
  const maxInstallments = Math.max(24, Math.max(1, Math.trunc(Number(input.parcelas) || 1)));
  const evaluated = Array.from({ length: maxInstallments }, (_, index) => {
    const installmentCount = index + 1;
    const months = projectFuturePurchaseCashflow(context, {
      ...input,
      parcelas: installmentCount,
    });

    return {
      installmentCount,
      status: getStatus(months, Math.max(0, Number(input.reservaMinima) || 0)),
      lowestBalance: getLowestBalance(months),
    };
  });

  const safeOption = evaluated.find((option) => option.status === "Pode comprar");
  if (safeOption) return safeOption.installmentCount;

  const attentionOption = evaluated.find((option) => option.status === "Atenção");
  if (attentionOption) return attentionOption.installmentCount;

  return evaluated.reduce((best, option) => (
    option.lowestBalance > best.lowestBalance ? option : best
  ), evaluated[0]).installmentCount;
}

function buildSuggestions(params: {
  status: FuturePurchaseSimulationStatus;
  monthsBelowReserveCount: number;
  monthsNegativeCount: number;
  extraAmountNeeded: number;
  recommendedInstallmentCount: number | null;
  selectedInstallmentCount: number;
}): FuturePurchaseSimulationSuggestion[] {
  const suggestions: FuturePurchaseSimulationSuggestion[] = [];

  if (params.status === "Pode comprar") {
    suggestions.push({
      kind: "fit",
      text: "Essa compra cabe no seu fluxo previsto sem consumir a reserva mínima.",
    });
  }

  if (params.monthsBelowReserveCount > 0) {
    suggestions.push({
      kind: "reserve",
      text: `Você ficaria abaixo da reserva em ${params.monthsBelowReserveCount} ${params.monthsBelowReserveCount === 1 ? "mês" : "meses"}.`,
    });
  }

  if (params.monthsNegativeCount > 0) {
    suggestions.push({
      kind: "negative",
      text: `O cenário entra no vermelho em ${params.monthsNegativeCount} ${params.monthsNegativeCount === 1 ? "mês" : "meses"}.`,
    });
  }

  if (params.extraAmountNeeded > 0) {
    suggestions.push({
      kind: "extra_income",
      text: `Você precisaria receber mais ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(params.extraAmountNeeded)} para manter o cenário no nível desejado.`,
    });
  }

  if (
    params.recommendedInstallmentCount != null
    && params.recommendedInstallmentCount !== params.selectedInstallmentCount
    && params.recommendedInstallmentCount > params.selectedInstallmentCount
  ) {
    suggestions.push({
      kind: "installments",
      text: `Parcelar em ${params.recommendedInstallmentCount}x é mais seguro para este cenário.`,
    });
  }

  return suggestions;
}

export function buildFuturePurchaseSimulation(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): FuturePurchaseSimulationResult {
  const normalizedInput: FuturePurchaseSimulationInput = {
    ...input,
    valorTotal: Math.max(0, round2(Number(input.valorTotal) || 0)),
    parcelas: Math.max(1, Math.trunc(Number(input.parcelas) || 1)),
    reservaMinima: Math.max(0, round2(Number(input.reservaMinima) || 0)),
  };

  const months = projectFuturePurchaseCashflow(context, normalizedInput);
  const status = getStatus(months, normalizedInput.reservaMinima);
  const worstMonth = findWorstMonth(months);
  const lowestBalance = round2(getLowestBalance(months));
  const monthsBelowReserveCount = months.filter((month) => month.endingBalance < normalizedInput.reservaMinima).length;
  const monthsNegativeCount = months.filter((month) => month.endingBalance < 0).length;
  const extraAmountNeeded = round2(
    status === "Não recomendado"
      ? Math.max(0, -lowestBalance)
      : Math.max(0, normalizedInput.reservaMinima - lowestBalance),
  );
  const safePurchaseAmount = calculateSafePurchaseAmount(context, normalizedInput);
  const recommendedInstallmentCount = calculateRecommendedInstallmentCount(context, normalizedInput);
  const installmentAmount = resolveInstallmentAmount(normalizedInput.valorTotal, normalizedInput.parcelas);
  const initialAvailableBalance = getLiquidBalance(context.patrimonios);
  const suggestions = buildSuggestions({
    status,
    monthsBelowReserveCount,
    monthsNegativeCount,
    extraAmountNeeded,
    recommendedInstallmentCount,
    selectedInstallmentCount: normalizedInput.parcelas,
  });

  return {
    status,
    months,
    worstMonth,
    lowestBalance,
    safePurchaseAmount,
    recommendedInstallmentCount,
    extraAmountNeeded,
    monthsBelowReserveCount,
    monthsNegativeCount,
    installmentAmount,
    initialAvailableBalance,
    suggestions,
  };
}
