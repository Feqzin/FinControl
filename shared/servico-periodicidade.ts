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

const PERIODICIDADE_EQUIVALENTE_MENSAL_FACTOR: Record<ServicoPeriodicidade, { numerator: number; denominator: number }> = {
  mensal: { numerator: 1, denominator: 1 },
  anual: { numerator: 1, denominator: 12 },
  semestral: { numerator: 1, denominator: 6 },
  trimestral: { numerator: 1, denominator: 3 },
  bimestral: { numerator: 1, denominator: 2 },
  semanal: { numerator: 52, denominator: 12 },
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
