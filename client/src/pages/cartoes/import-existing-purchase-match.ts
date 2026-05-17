import type { CompraCartao } from "@shared/schema";
import type { ParsedItem } from "@/pages/cartoes/import-parser";

export interface PossibleExistingPurchaseMatch {
  existing: CompraCartao;
  score: number;
  confidence: "media" | "alta";
  valueDiff: number;
  totalDiff: number;
  dateDiffDays: number | null;
  parcelasMatch: boolean;
  parcelaAtualCompatible: boolean;
  aliasMatched: boolean;
  aliasMatchedNameOriginal: string | null;
  aliasMatchedNameImportado: string | null;
  aliasIssuerMatch: "same" | "different" | "unknown";
  aliasCardLast4Match: "same" | "different" | "unknown";
}

export interface CompraAliasDraft {
  compraCartaoId: string;
  cartaoId: string | null;
  nomeOriginal: string;
  nomeImportado: string;
  issuer: ParsedItem["invoiceIssuerDetected"] | "generic";
  parserUsed: string | null;
  cardLast4: string | null;
  valorParcela: number | null;
  totalParcelas: number | null;
}

export interface CompraAliasMatchSignal {
  id: string;
  compraCartaoId: string;
  cartaoId: string | null;
  nomeOriginal: string | null;
  nomeImportado: string;
  nomeNormalizado: string;
  issuer: string | null;
  parserUsed: string | null;
  cardLast4: string | null;
  valorParcela: string | number | null;
  totalParcelas: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

interface MatchCandidateMetrics {
  score: number;
  valueDiff: number;
  totalDiff: number;
  dateDiffDays: number | null;
  parcelasMatch: boolean;
  parcelaAtualCompatible: boolean;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAliasText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIssuer(value: string | null | undefined): string | null {
  const normalized = normalizeAliasText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeCardLast4(value: string | null | undefined): string | null {
  const sanitized = (value ?? "").trim();
  return /^\d{4}$/.test(sanitized) ? sanitized : null;
}

function normalizeNonEmptyText(value: unknown, maxLength?: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (typeof maxLength === "number" && maxLength > 0 && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength).trim();
  }
  return trimmed;
}

export function buildCompraAliasDraft(
  item: ParsedItem,
  existing: CompraCartao,
): CompraAliasDraft {
  const issuer = item.invoiceIssuerDetected ?? "generic";
  const valorParcela = Number.isFinite(item.valorParcela) && item.valorParcela > 0
    ? item.valorParcela
    : null;
  const totalParcelas = Number.isInteger(item.parcelas) && item.parcelas > 0
    ? item.parcelas
    : null;
  const compraCartaoId = normalizeNonEmptyText(existing.id);
  const cartaoId = normalizeNonEmptyText(existing.cartaoId);
  const nomeOriginal = normalizeNonEmptyText(existing.descricao);
  const nomeImportado = normalizeNonEmptyText(item.descricao, 220);

  return {
    compraCartaoId,
    cartaoId: cartaoId.length > 0 ? cartaoId : null,
    nomeOriginal,
    nomeImportado,
    issuer,
    parserUsed: item.parserUsed ?? null,
    cardLast4: normalizeCardLast4(item.cardLast4),
    valorParcela,
    totalParcelas,
  };
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function diffDays(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

function evaluatePossibleMatch(
  item: ParsedItem,
  existing: CompraCartao,
): MatchCandidateMetrics | null {
  const existingParcelas = Math.max(1, toNumber(existing.parcelas, 1));
  const existingParcelaAtual = Math.max(1, toNumber(existing.parcelaAtual, 1));
  const existingValorParcela = toNumber(existing.valorParcela);
  const existingValorTotal = toNumber(existing.valorTotal);
  if (!Number.isFinite(existingValorParcela) || existingValorParcela <= 0) return null;
  if (!Number.isFinite(existingValorTotal) || existingValorTotal <= 0) return null;

  const parcelasMatch = existingParcelas === item.parcelas;
  const parcelaAtualCompatible = Math.abs(existingParcelaAtual - item.parcelaAtual) <= 1;
  const valueDiff = Math.abs(existingValorParcela - item.valorParcela);
  const totalDiff = Math.abs(existingValorTotal - item.valor);
  const totalTolerance = Math.max(2, item.valor * 0.015);
  const valueClose = valueDiff <= 1;
  const totalClose = totalDiff <= totalTolerance;

  const itemDate = parseIsoDate(item.dataCompra);
  const existingDate = parseIsoDate(existing.dataCompra);
  const dateDiffDays = diffDays(itemDate, existingDate);
  const dateClose = dateDiffDays == null ? true : dateDiffDays <= 45;

  if (!(parcelasMatch || valueClose || totalClose)) return null;
  if (!dateClose) return null;
  if (!parcelaAtualCompatible && !parcelasMatch) return null;

  let score = 0;
  if (parcelasMatch) score += 3;
  if (parcelaAtualCompatible) score += 1;

  if (valueDiff <= 0.2) score += 4;
  else if (valueDiff <= 0.5) score += 3;
  else if (valueDiff <= 1) score += 2;

  if (totalDiff <= 1) score += 2;
  else if (totalClose) score += 1;

  if (dateDiffDays === 0) score += 2;
  else if (dateDiffDays != null && dateDiffDays <= 7) score += 1;
  else if (dateDiffDays != null && dateDiffDays <= 30) score += 0.5;

  if (score < 5.5) return null;

  return {
    score,
    valueDiff,
    totalDiff,
    dateDiffDays,
    parcelasMatch,
    parcelaAtualCompatible,
  };
}

function getAliasPriorityTimestamp(alias: CompraAliasMatchSignal): number {
  const updatedAt = alias.updatedAt ? new Date(alias.updatedAt).getTime() : NaN;
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = alias.createdAt ? new Date(alias.createdAt).getTime() : NaN;
  if (Number.isFinite(createdAt)) return createdAt;
  return 0;
}

function computeAliasBoost(
  item: ParsedItem,
  alias: CompraAliasMatchSignal,
): {
  boost: number;
  issuerMatch: "same" | "different" | "unknown";
  cardLast4Match: "same" | "different" | "unknown";
} {
  let boost = 2.5;
  const itemIssuer = normalizeIssuer(item.invoiceIssuerDetected ?? null);
  const aliasIssuer = normalizeIssuer(alias.issuer);
  let issuerMatch: "same" | "different" | "unknown" = "unknown";

  if (itemIssuer && aliasIssuer) {
    if (itemIssuer === aliasIssuer) {
      issuerMatch = "same";
      boost += 1;
    } else {
      issuerMatch = "different";
      boost += 0.2;
    }
  } else if (itemIssuer || aliasIssuer) {
    boost += 0.5;
  }

  const itemLast4 = normalizeCardLast4(item.cardLast4);
  const aliasLast4 = normalizeCardLast4(alias.cardLast4);
  let cardLast4Match: "same" | "different" | "unknown" = "unknown";
  if (itemLast4 && aliasLast4) {
    if (itemLast4 === aliasLast4) {
      cardLast4Match = "same";
      boost += 0.8;
    } else {
      cardLast4Match = "different";
      boost -= 0.8;
    }
  }

  const aliasTotalParcelas = toNumber(alias.totalParcelas, 0);
  if (aliasTotalParcelas > 0) {
    if (aliasTotalParcelas === item.parcelas) {
      boost += 0.6;
    } else {
      boost -= 0.4;
    }
  }

  const aliasValorParcela = toNumber(alias.valorParcela, 0);
  if (aliasValorParcela > 0) {
    const diff = Math.abs(aliasValorParcela - item.valorParcela);
    if (diff <= 0.3) boost += 0.8;
    else if (diff <= 1) boost += 0.4;
    else if (diff <= 3) boost += 0.1;
    else boost -= 1;
  }

  return {
    boost,
    issuerMatch,
    cardLast4Match,
  };
}

export function findPossibleExistingPurchaseMatch(
  item: ParsedItem,
  existentes: CompraCartao[],
  cartaoId: string | null | undefined,
  aliases: CompraAliasMatchSignal[] = [],
): PossibleExistingPurchaseMatch | null {
  if (!cartaoId) return null;
  const normalizedImportName = normalizeAliasText(item.descricao);
  const filteredAliases = aliases.filter((alias) => (
    normalizeAliasText(alias.nomeNormalizado) === normalizedImportName
    || normalizeAliasText(alias.nomeImportado) === normalizedImportName
  ));
  const aliasByCompraId = new Map<string, CompraAliasMatchSignal>();
  for (const alias of filteredAliases) {
    const current = aliasByCompraId.get(alias.compraCartaoId);
    if (!current) {
      aliasByCompraId.set(alias.compraCartaoId, alias);
      continue;
    }
    if (getAliasPriorityTimestamp(alias) > getAliasPriorityTimestamp(current)) {
      aliasByCompraId.set(alias.compraCartaoId, alias);
    }
  }

  let best: PossibleExistingPurchaseMatch | null = null;

  for (const existing of existentes) {
    if (existing.cartaoId !== cartaoId) continue;

    const metrics = evaluatePossibleMatch(item, existing);
    if (!metrics) continue;

    const matchedAlias = aliasByCompraId.get(existing.id) ?? null;
    const aliasSignals = matchedAlias
      ? computeAliasBoost(item, matchedAlias)
      : { boost: 0, issuerMatch: "unknown" as const, cardLast4Match: "unknown" as const };
    const finalScore = metrics.score + aliasSignals.boost;
    const confidence: "media" | "alta" = finalScore >= 8 ? "alta" : "media";
    const candidate: PossibleExistingPurchaseMatch = {
      existing,
      ...metrics,
      score: finalScore,
      confidence,
      aliasMatched: Boolean(matchedAlias),
      aliasMatchedNameOriginal: matchedAlias?.nomeOriginal ?? null,
      aliasMatchedNameImportado: matchedAlias?.nomeImportado ?? null,
      aliasIssuerMatch: aliasSignals.issuerMatch,
      aliasCardLast4Match: aliasSignals.cardLast4Match,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}
