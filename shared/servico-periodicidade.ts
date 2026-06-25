import { resolveDueDateFromCompetencia } from "./parcelas-compra-competency.js";

export const SERVICO_PERIODICIDADE_VALUES = [
  "mensal",
  "anual",
  "semestral",
  "trimestral",
  "bimestral",
  "semanal",
] as const;

export type ServicoPeriodicidade = (typeof SERVICO_PERIODICIDADE_VALUES)[number];

export type ServicoBillingLike = {
  periodicidadeCobranca?: string | null;
  valorMensal?: string | number | null;
  valorCobranca?: string | number | null;
  mesCobranca?: number | string | null;
};

export type ServicoPeriodicidadeComputationLike = ServicoBillingLike & {
  id?: string | null;
  compraCartaoId?: string | null;
  cartaoId?: string | null;
  formaPagamento?: string | null;
  nome?: string | null;
  status?: string | null;
  projetarNaFaturaCartao?: boolean | null;
  dataCobranca?: number | string | null;
  competenciaCobrancaBase?: string | null;
  competenciaBase?: string | null;
  proximaCompetencia?: string | null;
  dataProximaCobranca?: string | Date | null;
  proximaCobranca?: string | Date | null;
  dataInicioCobranca?: string | Date | null;
  dataInicio?: string | Date | null;
  createdAt?: string | Date | null;
};

export type ServicoBillingDisplayInfo = {
  periodicidade: ServicoPeriodicidade;
  periodicidadeLabel: string;
  valorCobranca: number;
  valorCobrancaCents: number;
  valorMensalPadrao: number;
  valorMensalPadraoCents: number;
  equivalenteMensal: number;
  equivalenteMensalCents: number;
  shortText: string;
};

export type ServicoCompetencyPaymentLike = {
  servicoId?: string | null;
  competenciaMes?: number | string | null;
  competenciaAno?: number | string | null;
  valorPago?: string | number | null;
  canceladoEm?: string | Date | null;
};

export type ServicoCardProjectionInstallment = {
  id: string;
  servicoId: string;
  cartaoId: string;
  nome: string;
  monthReference: string;
  valorOriginal: number;
  valorPendente: number;
  dataVencimento: string | null;
  billingDay: number | null;
  semDataFixa: boolean;
  linkedToRealPurchase: boolean;
};

export type BuildServicoCardProjectionInstallmentsParams = {
  servicos: ServicoPeriodicidadeComputationLike[];
  monthReferences: string[];
  payments?: ServicoCompetencyPaymentLike[];
  realPurchaseMonthsByCompraId?: ReadonlyMap<string, ReadonlySet<string> | readonly string[]>;
};

const PERIODICIDADE_EQUIVALENTE_MENSAL_FACTOR: Record<ServicoPeriodicidade, { numerator: number; denominator: number }> = {
  mensal: { numerator: 1, denominator: 1 },
  anual: { numerator: 1, denominator: 12 },
  semestral: { numerator: 1, denominator: 6 },
  trimestral: { numerator: 1, denominator: 3 },
  bimestral: { numerator: 1, denominator: 2 },
  semanal: { numerator: 52, denominator: 12 },
};

const PERIODICIDADE_INTERVALO_MESES: Record<Exclude<ServicoPeriodicidade, "mensal" | "semanal">, number> = {
  anual: 12,
  semestral: 6,
  trimestral: 3,
  bimestral: 2,
};

const CURRENCY_BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type CompetenciaMonth = {
  year: number;
  month: number;
};

function normalizeServicoBillingMonth(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1 && value <= 12) return value;
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^\d{1,2}$/.test(normalized)) return null;
    const numeric = Number(normalized);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  }

  return null;
}

function normalizeNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function realPurchaseMonthsInclude(
  months: ReadonlySet<string> | readonly string[] | null | undefined,
  monthReference: string,
): boolean {
  if (!months) return false;
  if (typeof (months as ReadonlySet<string>).has === "function") {
    return (months as ReadonlySet<string>).has(monthReference);
  }
  return Array.from(months).includes(monthReference);
}

function normalizeMoneyRaw(input: string | number | null | undefined): string {
  if (input == null) return "";
  if (typeof input === "number") {
    return Number.isFinite(input) ? String(input) : "";
  }

  const stripped = input
    .trim()
    .replace(/^r\$/i, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!stripped) return "";

  const hasComma = stripped.includes(",");
  const hasDot = stripped.includes(".");

  if (hasComma && hasDot) {
    const commaPos = stripped.lastIndexOf(",");
    const dotPos = stripped.lastIndexOf(".");
    if (commaPos > dotPos) {
      return stripped.replace(/\./g, "").replace(",", ".");
    }
    return stripped.replace(/,/g, "");
  }

  if (hasComma) {
    return stripped.replace(/\./g, "").replace(",", ".");
  }

  return stripped.replace(/,/g, "");
}

function parseMoneyToCents(input: string | number | null | undefined): number | null {
  const normalized = normalizeMoneyRaw(input);
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.round(parsed * 100));
}

function hasMoneyInput(input: string | number | null | undefined): boolean {
  if (input == null) return false;
  if (typeof input === "number") return Number.isFinite(input);
  return normalizeMoneyRaw(input).length > 0;
}

function centsToFixed(cents: number): string {
  const normalized = Math.max(0, Math.round(cents));
  const whole = Math.floor(normalized / 100);
  const fraction = String(normalized % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function formatBrlFromCents(cents: number): string {
  return CURRENCY_BRL_FORMATTER.format(Math.max(0, Math.round(cents)) / 100);
}

function periodicidadeToShortLabel(periodicidade: ServicoPeriodicidade): string {
  switch (periodicidade) {
    case "anual":
      return "ano";
    case "semestral":
      return "semestre";
    case "trimestral":
      return "trimestre";
    case "bimestral":
      return "bimestre";
    case "semanal":
      return "semana";
    case "mensal":
    default:
      return "mês";
  }
}

function parseCompetenciaMonth(value: string | null | undefined): CompetenciaMonth | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));

  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;

  return { year, month };
}

function buildCompetenciaDate(competencia: string, billingDay?: number | null): string | null {
  const parsed = parseCompetenciaMonth(competencia);
  if (!parsed) return null;

  const day = Number.isInteger(billingDay) && (billingDay ?? 0) >= 1
    ? Math.max(1, Math.trunc(billingDay ?? 1))
    : 1;
  const lastDay = new Date(parsed.year, parsed.month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);

  return `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

function parseDateToCompetenciaMonth(value: string | Date | null | undefined): CompetenciaMonth | null {
  if (!value) return null;

  if (typeof value === "string") {
    const asCompetencia = parseCompetenciaMonth(value);
    if (asCompetencia) return asCompetencia;

    const isoMatch = value.match(/^(\d{4})-(\d{2})-\d{2}/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        return { year, month };
      }
    }

    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        year: parsedDate.getUTCFullYear(),
        month: parsedDate.getUTCMonth() + 1,
      };
    }
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
    };
  }

  return null;
}

function toCompetenciaIndex(competencia: CompetenciaMonth): number {
  return (competencia.year * 12) + (competencia.month - 1);
}

function resolveAnchorCompetenciaMonth(
  servico: ServicoPeriodicidadeComputationLike,
): CompetenciaMonth | null {
  const explicitCompetencia =
    parseCompetenciaMonth(servico.competenciaCobrancaBase ?? null)
    ?? parseCompetenciaMonth(servico.competenciaBase ?? null)
    ?? parseCompetenciaMonth(servico.proximaCompetencia ?? null);
  if (explicitCompetencia) return explicitCompetencia;

  return (
    parseDateToCompetenciaMonth(servico.dataProximaCobranca)
    ?? parseDateToCompetenciaMonth(servico.proximaCobranca)
    ?? parseDateToCompetenciaMonth(servico.dataInicioCobranca)
    ?? parseDateToCompetenciaMonth(servico.dataInicio)
    ?? parseDateToCompetenciaMonth(servico.createdAt)
  );
}

function resolveFallbackCurrentMonth(referenceDate?: Date): number {
  const date = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate
    : new Date();
  return date.getMonth() + 1;
}

function resolveAnnualBillingMonth(
  servico: ServicoPeriodicidadeComputationLike,
  referenceDate?: Date,
): number {
  const explicitMonth = normalizeServicoBillingMonth(servico.mesCobranca);
  if (explicitMonth != null) return explicitMonth;

  const anchorCompetencia = resolveAnchorCompetenciaMonth(servico);
  if (anchorCompetencia) return anchorCompetencia.month;

  return resolveFallbackCurrentMonth(referenceDate);
}

function buildLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeCompetenciaNumber(
  value: number | string | null | undefined,
  max: number,
): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= max ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) return null;
    const numeric = Number(normalized);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= max ? numeric : null;
  }

  return null;
}

function isServicoCompetencyPaymentCanceled(
  payment: Pick<ServicoCompetencyPaymentLike, "canceladoEm">,
): boolean {
  if (!payment.canceladoEm) return false;
  if (payment.canceladoEm instanceof Date) {
    return !Number.isNaN(payment.canceladoEm.getTime());
  }
  return String(payment.canceladoEm).trim().length > 0;
}

export function getServicoCompetencyPaymentMonthReference(
  payment: ServicoCompetencyPaymentLike,
): string | null {
  const competenciaAno = normalizeCompetenciaNumber(payment.competenciaAno, 9999);
  const competenciaMes = normalizeCompetenciaNumber(payment.competenciaMes, 12);
  if (!competenciaAno || !competenciaMes || competenciaMes < 1) return null;
  return `${String(competenciaAno).padStart(4, "0")}-${String(competenciaMes).padStart(2, "0")}`;
}

export function getActiveServicoCompetencyPayments<TPayment extends ServicoCompetencyPaymentLike>(
  payments: TPayment[] = [],
): TPayment[] {
  return payments.filter((payment) => !isServicoCompetencyPaymentCanceled(payment));
}

export function calculateServicoChargePaidAmountForCompetency(
  servicoId: string | null | undefined,
  competencia: string,
  payments: ServicoCompetencyPaymentLike[] = [],
): number {
  const normalizedServicoId = typeof servicoId === "string" ? servicoId.trim() : "";
  if (!normalizedServicoId) return 0;

  const paidCents = getActiveServicoCompetencyPayments(payments)
    .filter((payment) => payment.servicoId === normalizedServicoId)
    .filter((payment) => getServicoCompetencyPaymentMonthReference(payment) === competencia)
    .reduce((sum, payment) => sum + (parseMoneyToCents(payment.valorPago) ?? 0), 0);

  return paidCents / 100;
}

export function isServicoPeriodicidade(value: unknown): value is ServicoPeriodicidade {
  if (typeof value !== "string") return false;
  return (SERVICO_PERIODICIDADE_VALUES as readonly string[]).includes(value);
}

export function isServicoBillingMonth(value: unknown): value is number {
  return normalizeServicoBillingMonth(value) != null;
}

export function normalizeServicoPeriodicidade(value: unknown): ServicoPeriodicidade {
  return isServicoPeriodicidade(value) ? value : "mensal";
}

export function calculateServicoValorMensalEquivalenteCents(
  valorCobrancaCents: number,
  periodicidadeInput: unknown,
): number {
  const periodicidade = normalizeServicoPeriodicidade(periodicidadeInput);
  const factor = PERIODICIDADE_EQUIVALENTE_MENSAL_FACTOR[periodicidade];
  return Math.max(0, Math.round((Math.max(0, valorCobrancaCents) * factor.numerator) / factor.denominator));
}

export function calculateServicoValorMensalEquivalente(
  valorCobranca: string | number | null | undefined,
  periodicidadeInput: unknown,
): number {
  const valorCobrancaCents = parseMoneyToCents(valorCobranca) ?? 0;
  return calculateServicoValorMensalEquivalenteCents(valorCobrancaCents, periodicidadeInput) / 100;
}

export function calculateServicoEquivalentMonthlyAmountCents(
  servico: ServicoPeriodicidadeComputationLike,
): number {
  const resolved = resolveServicoBillingFields({}, servico);
  return Math.max(
    0,
    calculateServicoValorMensalEquivalenteCents(
      parseMoneyToCents(resolved.valorCobranca) ?? 0,
      resolved.periodicidadeCobranca,
    ),
  );
}

export function calculateServicoEquivalentMonthlyAmount(
  servico: ServicoPeriodicidadeComputationLike,
): number {
  return calculateServicoEquivalentMonthlyAmountCents(servico) / 100;
}

export function calculateServicoDefaultMonthlyAmountCents(
  valorCobrancaCents: number,
  periodicidadeInput: unknown,
): number {
  const periodicidade = normalizeServicoPeriodicidade(periodicidadeInput);
  const normalizedValorCobrancaCents = Math.max(0, Math.round(valorCobrancaCents));

  if (periodicidade === "semanal") {
    return normalizedValorCobrancaCents * 4;
  }

  return calculateServicoValorMensalEquivalenteCents(normalizedValorCobrancaCents, periodicidade);
}

export function calculateServicoDefaultMonthlyAmount(
  servico: ServicoPeriodicidadeComputationLike,
): number {
  const resolved = resolveServicoBillingFields({}, servico);
  const valorCobrancaCents = parseMoneyToCents(resolved.valorCobranca) ?? 0;

  return calculateServicoDefaultMonthlyAmountCents(valorCobrancaCents, resolved.periodicidadeCobranca) / 100;
}

export function calculateServicoMonthlyFinancialImpactAmountCents(
  servico: ServicoPeriodicidadeComputationLike,
): number {
  if (isServicoLinkedToCardCharge(servico)) return 0;

  // Mantido como referência mensal de planejamento/compatibilidade.
  // Gasto real mensal por competência deve usar calculateServicoRealChargeForCompetency.
  const storedMonthlyCents = parseMoneyToCents(servico.valorMensal);
  if (storedMonthlyCents != null) {
    return Math.max(0, storedMonthlyCents);
  }

  return calculateServicoEquivalentMonthlyAmountCents(servico);
}

export function calculateServicoMonthlyFinancialImpactAmount(
  servico: ServicoPeriodicidadeComputationLike,
): number {
  return calculateServicoMonthlyFinancialImpactAmountCents(servico) / 100;
}

export function calculateServicoRealChargeForCompetency(
  servico: ServicoPeriodicidadeComputationLike,
  competencia: string,
): number {
  const targetCompetencia = parseCompetenciaMonth(competencia);
  if (!targetCompetencia) return 0;

  const resolved = resolveServicoBillingFields({}, servico);
  const periodicidade = resolved.periodicidadeCobranca;
  const valorCobrancaCents = parseMoneyToCents(resolved.valorCobranca) ?? 0;
  if (valorCobrancaCents <= 0) return 0;

  if (periodicidade === "mensal") {
    return valorCobrancaCents / 100;
  }

  if (periodicidade === "anual") {
    const billingMonth = resolveAnnualBillingMonth(servico);
    return targetCompetencia.month === billingMonth ? (valorCobrancaCents / 100) : 0;
  }

  if (periodicidade === "semanal") {
    // Para gasto real mensal padrão, o app considera 4 semanas por mês.
    return calculateServicoDefaultMonthlyAmountCents(valorCobrancaCents, periodicidade) / 100;
  }

  const interval = PERIODICIDADE_INTERVALO_MESES[periodicidade];
  const anchorCompetencia = resolveAnchorCompetenciaMonth(servico);
  if (!anchorCompetencia) {
    // Fallback seguro/compatível quando não há mês-base suficiente.
    return calculateServicoValorMensalEquivalenteCents(valorCobrancaCents, periodicidade) / 100;
  }

  const deltaMonths = toCompetenciaIndex(targetCompetencia) - toCompetenciaIndex(anchorCompetencia);
  const mod = ((deltaMonths % interval) + interval) % interval;
  return mod === 0 ? (valorCobrancaCents / 100) : 0;
}

export function resolveServicoNextChargeDate(
  servico: ServicoPeriodicidadeComputationLike,
  referenceDate?: Date,
): string | null {
  const billingDay = Number(servico.dataCobranca);
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
    return null;
  }

  const periodicidade = normalizeServicoPeriodicidade(servico.periodicidadeCobranca);
  const now = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? new Date(referenceDate)
    : new Date();
  const today = buildLocalIsoDate(now);

  if (periodicidade === "anual") {
    const billingMonth = resolveAnnualBillingMonth(servico, now);
    let candidate = new Date(now.getFullYear(), billingMonth - 1, billingDay);
    if (buildLocalIsoDate(candidate) < today) {
      candidate = new Date(now.getFullYear() + 1, billingMonth - 1, billingDay);
    }
    return buildLocalIsoDate(candidate);
  }

  let candidate = new Date(now.getFullYear(), now.getMonth(), billingDay);
  if (buildLocalIsoDate(candidate) < today) {
    candidate = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
  }
  return buildLocalIsoDate(candidate);
}

export function calculateServicoRealMonthlyExpenseAmount(
  servico: ServicoPeriodicidadeComputationLike,
  competencia: string,
): number {
  if (isServicoLinkedToCardCharge(servico)) return 0;
  return calculateServicoRealChargeForCompetency(servico, competencia);
}

export function calculateServicoOutstandingChargeForCompetency(
  servico: ServicoPeriodicidadeComputationLike,
  competencia: string,
  payments: ServicoCompetencyPaymentLike[] = [],
): number {
  const charge = calculateServicoRealMonthlyExpenseAmount(servico, competencia);
  if (charge <= 0) return 0;

  const paidAmount = calculateServicoChargePaidAmountForCompetency(servico.id ?? null, competencia, payments);
  const remainingCents = Math.max(0, Math.round((charge - paidAmount) * 100));
  return remainingCents / 100;
}

export function isServicoChargeSettledForCompetency(
  servico: ServicoPeriodicidadeComputationLike,
  competencia: string,
  payments: ServicoCompetencyPaymentLike[] = [],
): boolean {
  return calculateServicoOutstandingChargeForCompetency(servico, competencia, payments) <= 0;
}

export function hasServicoRealCardPurchaseLink(servico: ServicoPeriodicidadeComputationLike): boolean {
  return normalizeNonEmptyText(servico.compraCartaoId) != null;
}

export function resolveServicoTargetCardId(
  servico: ServicoPeriodicidadeComputationLike,
): string | null {
  return normalizeNonEmptyText(servico.cartaoId);
}

export function isServicoProjectedToCardInvoice(
  servico: ServicoPeriodicidadeComputationLike,
): boolean {
  const targetCardId = resolveServicoTargetCardId(servico);
  if (!targetCardId) return false;

  const formaPagamento = String(servico.formaPagamento ?? "").trim().toLowerCase();
  if (formaPagamento !== "cartao") return false;

  return servico.projetarNaFaturaCartao === true;
}

export function isServicoLinkedToCardCharge(servico: ServicoPeriodicidadeComputationLike): boolean {
  return hasServicoRealCardPurchaseLink(servico) || isServicoProjectedToCardInvoice(servico);
}

export function buildServicoCardProjectionInstallments(
  params: BuildServicoCardProjectionInstallmentsParams,
): ServicoCardProjectionInstallment[] {
  const payments = params.payments ?? [];
  const monthReferences = Array.from(new Set(params.monthReferences.filter((month) => /^\d{4}-\d{2}$/.test(month))));
  if (monthReferences.length === 0) return [];

  const rows: ServicoCardProjectionInstallment[] = [];

  for (const servico of params.servicos) {
    if (String(servico.status ?? "").trim().toLowerCase() !== "ativo") continue;
    if (!isServicoProjectedToCardInvoice(servico)) continue;

    const servicoId = normalizeNonEmptyText(servico.id);
    const cartaoId = resolveServicoTargetCardId(servico);
    if (!servicoId || !cartaoId) continue;

    const compraCartaoId = normalizeNonEmptyText(servico.compraCartaoId);
    const realPurchaseMonths = compraCartaoId
      ? params.realPurchaseMonthsByCompraId?.get(compraCartaoId)
      : null;
    const billingDay = normalizeCompetenciaNumber(servico.dataCobranca, 31);
    const semDataFixa = billingDay == null || billingDay < 1;

    for (const monthReference of monthReferences) {
      const realCharge = calculateServicoRealChargeForCompetency(servico, monthReference);
      if (realCharge <= 0) continue;

      const hasRealPurchaseCharge = realPurchaseMonthsInclude(realPurchaseMonths, monthReference);
      if (hasRealPurchaseCharge) continue;

      const paidAmount = calculateServicoChargePaidAmountForCompetency(servicoId, monthReference, payments);
      const remainingAmount = Math.max(0, Math.round((realCharge - paidAmount) * 100) / 100);
      if (remainingAmount <= 0) continue;

      rows.push({
        id: `servico-projecao:${servicoId}:${monthReference}`,
        servicoId,
        cartaoId,
        nome: normalizeNonEmptyText(servico.nome) ?? "Serviço previsto",
        monthReference,
        valorOriginal: realCharge,
        valorPendente: remainingAmount,
        dataVencimento: buildCompetenciaDate(monthReference, billingDay),
        billingDay,
        semDataFixa,
        linkedToRealPurchase: compraCartaoId != null,
      });
    }
  }

  return rows.sort((left, right) => (
    left.monthReference.localeCompare(right.monthReference)
    || left.cartaoId.localeCompare(right.cartaoId)
    || left.nome.localeCompare(right.nome)
    || left.id.localeCompare(right.id)
  ));
}

export function getServicoBillingDisplayInfo(
  servico: ServicoPeriodicidadeComputationLike,
): ServicoBillingDisplayInfo {
  const resolved = resolveServicoBillingFields({}, servico);
  const periodicidade = resolved.periodicidadeCobranca;
  const valorCobrancaCents = parseMoneyToCents(resolved.valorCobranca) ?? 0;
  const valorMensalPadraoCents = calculateServicoDefaultMonthlyAmountCents(valorCobrancaCents, periodicidade);
  const equivalenteMensalCents = calculateServicoEquivalentMonthlyAmountCents(servico);
  const periodicidadeLabel = periodicidadeToShortLabel(periodicidade);

  const shortText = periodicidade === "mensal"
    ? `${formatBrlFromCents(valorCobrancaCents)}/mês`
    : periodicidade === "semanal"
      ? `${formatBrlFromCents(valorCobrancaCents)}/${periodicidadeLabel} · ${formatBrlFromCents(valorMensalPadraoCents)}/mês`
      : `${formatBrlFromCents(valorCobrancaCents)}/${periodicidadeLabel} · equiv. ${formatBrlFromCents(equivalenteMensalCents)}/mês`;

  return {
    periodicidade,
    periodicidadeLabel,
    valorCobranca: valorCobrancaCents / 100,
    valorCobrancaCents,
    valorMensalPadrao: valorMensalPadraoCents / 100,
    valorMensalPadraoCents,
    equivalenteMensal: equivalenteMensalCents / 100,
    equivalenteMensalCents,
    shortText,
  };
}

export function resolveServicoBillingFields(
  incoming: ServicoBillingLike,
  fallback?: ServicoBillingLike,
): {
  periodicidadeCobranca: ServicoPeriodicidade;
  valorCobranca: string;
  valorMensal: string;
  mesCobranca: number | null;
  valorCobrancaNumber: number;
  valorMensalNumber: number;
} {
  const periodicidade = normalizeServicoPeriodicidade(
    incoming.periodicidadeCobranca ?? fallback?.periodicidadeCobranca ?? null,
  );

  const incomingHasValorCobranca = hasMoneyInput(incoming.valorCobranca);
  const incomingHasValorMensal = hasMoneyInput(incoming.valorMensal);

  const fallbackValorCobrancaCents =
    parseMoneyToCents(fallback?.valorCobranca) ??
    parseMoneyToCents(fallback?.valorMensal) ??
    0;

  let valorCobrancaCents: number;
  if (incomingHasValorCobranca) {
    valorCobrancaCents = parseMoneyToCents(incoming.valorCobranca) ?? 0;
  } else if (incomingHasValorMensal && periodicidade === "mensal") {
    // Compatibilidade com payloads antigos que enviam apenas valorMensal.
    valorCobrancaCents = parseMoneyToCents(incoming.valorMensal) ?? 0;
  } else {
    valorCobrancaCents = fallbackValorCobrancaCents;
  }

  const valorMensalCents = calculateServicoValorMensalEquivalenteCents(valorCobrancaCents, periodicidade);
  const mesCobranca = periodicidade === "anual"
    ? (
      normalizeServicoBillingMonth(incoming.mesCobranca)
      ?? normalizeServicoBillingMonth(fallback?.mesCobranca)
      ?? resolveFallbackCurrentMonth()
    )
    : null;

  return {
    periodicidadeCobranca: periodicidade,
    valorCobranca: centsToFixed(valorCobrancaCents),
    valorMensal: centsToFixed(valorMensalCents),
    mesCobranca,
    valorCobrancaNumber: valorCobrancaCents / 100,
    valorMensalNumber: valorMensalCents / 100,
  };
}
