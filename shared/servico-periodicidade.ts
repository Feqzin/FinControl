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
};

export type ServicoPeriodicidadeComputationLike = ServicoBillingLike & {
  compraCartaoId?: string | null;
  cartaoId?: string | null;
  formaPagamento?: string | null;
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
  equivalenteMensal: number;
  equivalenteMensalCents: number;
  shortText: string;
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

export function isServicoPeriodicidade(value: unknown): value is ServicoPeriodicidade {
  if (typeof value !== "string") return false;
  return (SERVICO_PERIODICIDADE_VALUES as readonly string[]).includes(value);
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

export function calculateServicoMonthlyFinancialImpactAmountCents(
  servico: ServicoPeriodicidadeComputationLike,
): number {
  if (isServicoLinkedToCardCharge(servico)) return 0;

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

  if (periodicidade === "semanal") {
    // Sem uma data-base semanal (weekday + início), usamos aproximação mensal equivalente
    // para manter compatibilidade e evitar queda brusca de valores nas telas antigas.
    return calculateServicoValorMensalEquivalenteCents(valorCobrancaCents, periodicidade) / 100;
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

export function calculateServicoRealMonthlyExpenseAmount(
  servico: ServicoPeriodicidadeComputationLike,
  competencia: string,
): number {
  if (isServicoLinkedToCardCharge(servico)) return 0;
  return calculateServicoRealChargeForCompetency(servico, competencia);
}

export function isServicoLinkedToCardCharge(servico: ServicoPeriodicidadeComputationLike): boolean {
  const compraCartaoId = typeof servico.compraCartaoId === "string" ? servico.compraCartaoId.trim() : "";
  if (compraCartaoId.length > 0) return true;

  const cartaoId = typeof servico.cartaoId === "string" ? servico.cartaoId.trim() : "";
  if (cartaoId.length > 0) return true;

  return false;
}

export function getServicoBillingDisplayInfo(
  servico: ServicoPeriodicidadeComputationLike,
): ServicoBillingDisplayInfo {
  const resolved = resolveServicoBillingFields({}, servico);
  const periodicidade = resolved.periodicidadeCobranca;
  const valorCobrancaCents = parseMoneyToCents(resolved.valorCobranca) ?? 0;
  const equivalenteMensalCents = calculateServicoEquivalentMonthlyAmountCents(servico);
  const periodicidadeLabel = periodicidadeToShortLabel(periodicidade);

  const shortText = periodicidade === "mensal"
    ? `${formatBrlFromCents(valorCobrancaCents)}/mês`
    : `${formatBrlFromCents(valorCobrancaCents)}/${periodicidadeLabel} · equiv. ${formatBrlFromCents(equivalenteMensalCents)}/mês`;

  return {
    periodicidade,
    periodicidadeLabel,
    valorCobranca: valorCobrancaCents / 100,
    valorCobrancaCents,
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

  return {
    periodicidadeCobranca: periodicidade,
    valorCobranca: centsToFixed(valorCobrancaCents),
    valorMensal: centsToFixed(valorMensalCents),
    valorCobrancaNumber: valorCobrancaCents / 100,
    valorMensalNumber: valorMensalCents / 100,
  };
}
