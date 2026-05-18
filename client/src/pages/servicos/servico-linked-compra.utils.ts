import { resolveServicoBillingFields, type ServicoPeriodicidade } from "@shared/servico-periodicidade";
import type { CompraCartao } from "@shared/schema";

type CompraCartaoForServicoLink = Pick<CompraCartao, "valorTotal" | "valorParcela" | "parcelas"> & {
  totalParcelas?: number | string | null;
  numeroParcelas?: number | string | null;
};

type LinkedCompraBillingDecision = "prefill" | "confirm_overwrite" | "keep_current" | "no_suggested_value";

function normalizeNumberRaw(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value !== "string") return "";

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

function parsePositiveNumber(value: unknown): number | null {
  const normalized = normalizeNumberRaw(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = parsePositiveNumber(value);
  if (parsed == null) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getCompraCartaoTotalForServico(compra: CompraCartaoForServicoLink | null | undefined): number | null {
  if (!compra) return null;

  const valorTotal = parsePositiveNumber(compra.valorTotal);
  if (valorTotal != null) {
    return roundToTwoDecimals(valorTotal);
  }

  const valorParcela = parsePositiveNumber(compra.valorParcela);
  const totalParcelas =
    parsePositiveInt(compra.parcelas) ??
    parsePositiveInt(compra.totalParcelas) ??
    parsePositiveInt(compra.numeroParcelas);

  if (valorParcela != null && totalParcelas != null) {
    return roundToTwoDecimals(valorParcela * totalParcelas);
  }

  if (valorParcela != null) {
    return roundToTwoDecimals(valorParcela);
  }

  return null;
}

export function formatServicoBillingInputValue(value: number): string {
  return roundToTwoDecimals(value).toFixed(2);
}

export function decideLinkedCompraBillingValueFill(params: {
  currentValorCobranca: string | number | null | undefined;
  periodicidadeCobranca: ServicoPeriodicidade;
  suggestedValorCobranca: number | null;
}): {
  decision: LinkedCompraBillingDecision;
  suggestedValueInput: string | null;
} {
  const suggested = params.suggestedValorCobranca;
  if (suggested == null || !Number.isFinite(suggested) || suggested <= 0) {
    return { decision: "no_suggested_value", suggestedValueInput: null };
  }

  const normalizedSuggested = roundToTwoDecimals(suggested);
  const currentBilling = resolveServicoBillingFields({
    periodicidadeCobranca: params.periodicidadeCobranca,
    valorCobranca: params.currentValorCobranca,
  });

  if (currentBilling.valorCobrancaNumber <= 0) {
    return {
      decision: "prefill",
      suggestedValueInput: formatServicoBillingInputValue(normalizedSuggested),
    };
  }

  if (Math.abs(currentBilling.valorCobrancaNumber - normalizedSuggested) <= 0.005) {
    return { decision: "keep_current", suggestedValueInput: null };
  }

  return {
    decision: "confirm_overwrite",
    suggestedValueInput: formatServicoBillingInputValue(normalizedSuggested),
  };
}

