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

export function findPossibleExistingPurchaseMatch(
  item: ParsedItem,
  existentes: CompraCartao[],
  cartaoId: string | null | undefined,
): PossibleExistingPurchaseMatch | null {
  if (!cartaoId) return null;

  let best: PossibleExistingPurchaseMatch | null = null;

  for (const existing of existentes) {
    if (existing.cartaoId !== cartaoId) continue;

    const metrics = evaluatePossibleMatch(item, existing);
    if (!metrics) continue;

    const confidence: "media" | "alta" = metrics.score >= 8 ? "alta" : "media";
    const candidate: PossibleExistingPurchaseMatch = {
      existing,
      confidence,
      ...metrics,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

