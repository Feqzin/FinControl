export type ReembolsoModo = "total" | "metade" | "valor_custom" | "percentual_custom";

type MoneyLike = string | number | null | undefined;

export type CompraReembolsoLike = {
  pessoaId?: string | null;
  valorTotal?: MoneyLike;
  parcelas?: number | null;
  parcelaAtual?: number | null;
  reembolsoModo?: ReembolsoModo | null;
  reembolsoValorTotal?: MoneyLike;
  reembolsoPercentual?: MoneyLike;
};

export type CompraReembolsoBreakdown = {
  valorCompraCents: number;
  valorCompra: number;
  reembolsoPessoaCents: number;
  reembolsoPessoa: number;
  partePropriaCents: number;
  partePropria: number;
  totalParcelas: number;
  parcelaAtual: number;
  reembolsoPorParcelaCents: number[];
  reembolsoPorParcela: number[];
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampInteger(value: unknown, minValue: number, maxValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return minValue;
  return Math.max(minValue, Math.min(maxValue, Math.trunc(parsed)));
}

function normalizeTextNumber(value: string): string {
  const stripped = value
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

function parseNumberLike(value: MoneyLike): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") return 0;

  const normalized = normalizeTextNumber(value);
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value: MoneyLike): number {
  const parsed = parseNumberLike(value);
  return Math.max(0, Math.round(parsed * 100));
}

function clampCents(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  return Math.max(minValue, Math.min(maxValue, Math.round(value)));
}

function resolveTotalParcelas(compra: CompraReembolsoLike): number {
  return Math.max(1, clampInteger(compra.parcelas ?? 1, 1, Number.MAX_SAFE_INTEGER));
}

function resolveParcelaAtual(compra: CompraReembolsoLike, totalParcelas: number): number {
  return clampInteger(compra.parcelaAtual ?? 1, 1, totalParcelas);
}

function hasLinkedPessoa(compra: CompraReembolsoLike): boolean {
  return typeof compra.pessoaId === "string" && compra.pessoaId.trim().length > 0;
}

function resolveReembolsoTotalCents(compra: CompraReembolsoLike, valorCompraCents: number): number {
  if (!hasLinkedPessoa(compra)) return 0;

  const modo = compra.reembolsoModo ?? "total";
  if (modo === "metade") {
    return Math.ceil(valorCompraCents / 2);
  }

  if (modo === "valor_custom") {
    return clampCents(toCents(compra.reembolsoValorTotal), 0, valorCompraCents);
  }

  if (modo === "percentual_custom") {
    const percentual = Math.max(0, parseNumberLike(compra.reembolsoPercentual));
    return clampCents(Math.round((valorCompraCents * percentual) / 100), 0, valorCompraCents);
  }

  return valorCompraCents;
}

function buildParcelaCentsSchedule(totalCents: number, totalParcelas: number): number[] {
  const parcelas = Math.max(1, totalParcelas);
  const base = Math.floor(totalCents / parcelas);
  const remainder = totalCents % parcelas;
  const schedule = Array.from({ length: parcelas }, () => base);

  for (let index = 0; index < remainder; index += 1) {
    schedule[index] += 1;
  }

  return schedule;
}

export function buildCompraReembolsoBreakdown(compra: CompraReembolsoLike): CompraReembolsoBreakdown {
  const valorCompraCents = toCents(compra.valorTotal);
  const totalParcelas = resolveTotalParcelas(compra);
  const parcelaAtual = resolveParcelaAtual(compra, totalParcelas);
  const reembolsoPessoaCents = resolveReembolsoTotalCents(compra, valorCompraCents);
  const partePropriaCents = Math.max(0, valorCompraCents - reembolsoPessoaCents);
  const reembolsoPorParcelaCents = buildParcelaCentsSchedule(reembolsoPessoaCents, totalParcelas);

  return {
    valorCompraCents,
    valorCompra: round2(valorCompraCents / 100),
    reembolsoPessoaCents,
    reembolsoPessoa: round2(reembolsoPessoaCents / 100),
    partePropriaCents,
    partePropria: round2(partePropriaCents / 100),
    totalParcelas,
    parcelaAtual,
    reembolsoPorParcelaCents,
    reembolsoPorParcela: reembolsoPorParcelaCents.map((value) => round2(value / 100)),
  };
}

export function calculateCompraReembolsoAmountCents(compra: CompraReembolsoLike): number {
  return buildCompraReembolsoBreakdown(compra).reembolsoPessoaCents;
}

export function calculateCompraReembolsoAmount(compra: CompraReembolsoLike): number {
  return buildCompraReembolsoBreakdown(compra).reembolsoPessoa;
}

export function getReembolsoParcelaByNumeroCents(compra: CompraReembolsoLike, parcelaNumero: number): number {
  const breakdown = buildCompraReembolsoBreakdown(compra);
  const index = clampInteger(parcelaNumero, 1, breakdown.totalParcelas) - 1;
  return breakdown.reembolsoPorParcelaCents[index] ?? 0;
}

export function getReembolsoParcelaByNumero(compra: CompraReembolsoLike, parcelaNumero: number): number {
  return round2(getReembolsoParcelaByNumeroCents(compra, parcelaNumero) / 100);
}
