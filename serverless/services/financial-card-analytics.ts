import { addMonths, format, parseISO } from "date-fns";
import type { CompraCartao, ParcelaCompra } from "@shared/schema";
import { parseMoney } from "../../utils/money.js";

type MoneyValue = string | number | null | undefined;

export type CardAnalyticsInput = {
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
};

export type CardInstallmentObligation = {
  compraId: string;
  cartaoId: string;
  source: "compra" | "parcela_compra";
  numero: number;
  valor: MoneyValue;
  statusCartao: string;
  dataVencimento: string | null;
  dataPagamentoCartao: string | null;
};

export type CardPortfolioSummary = {
  totalContratado: number;
  totalPendente: number;
  totalPago: number;
  parcelas: {
    total: number;
    pagas: number;
    pendentes: number;
  };
  compras: {
    total: number;
    avista: number;
    parceladas: number;
  };
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function normalizeStatus(status: string): string {
  return String(status || "").trim().toLowerCase();
}

function isPaidStatus(status: string): boolean {
  return normalizeStatus(status) === "pago";
}

function isCanceledStatus(status: string): boolean {
  return normalizeStatus(status) === "cancelado";
}

function isOutstandingStatus(status: string): boolean {
  return !isPaidStatus(status) && !isCanceledStatus(status);
}

function safeMonthDate(baseDate: string | null | undefined, offset: number): string | null {
  if (!baseDate) return null;
  try {
    return format(addMonths(parseISO(baseDate), offset), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

function normalizeInstallmentCount(value: number | null | undefined): number {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeCurrentInstallment(
  parcelaAtual: number | null | undefined,
  totalParcelas: number,
): number {
  const parsed = Number(parcelaAtual ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(totalParcelas, Math.max(1, Math.trunc(parsed)));
}

function byCompraId(parcelasCompra: ParcelaCompra[]): Map<string, ParcelaCompra[]> {
  const grouped = new Map<string, ParcelaCompra[]>();
  for (const parcela of parcelasCompra) {
    const rows = grouped.get(parcela.compraCartaoId) ?? [];
    rows.push(parcela);
    grouped.set(parcela.compraCartaoId, rows);
  }
  grouped.forEach((rows) => rows.sort((a, b) => a.numero - b.numero));
  return grouped;
}

function buildFallbackInstallments(compra: CompraCartao): CardInstallmentObligation[] {
  const totalParcelas = normalizeInstallmentCount(compra.parcelas);
  const parcelaAtual = normalizeCurrentInstallment(compra.parcelaAtual, totalParcelas);

  return Array.from({ length: totalParcelas }, (_, index) => {
    const numero = index + 1;
    const isPaid = numero < parcelaAtual;
    return {
      compraId: compra.id,
      cartaoId: compra.cartaoId,
      source: "compra" as const,
      numero,
      valor: compra.valorParcela,
      statusCartao: isPaid ? "pago" : "pendente",
      dataVencimento: safeMonthDate(compra.dataCompra, index),
      dataPagamentoCartao: null,
    };
  });
}

/**
 * Conceitos usados na camada analitica de cartao:
 * - valor total da compra: contratado no nivel da compra pai (compras_cartao.valorTotal).
 * - parcela mensal: obrigacao real por competencia (parcelas_compra).
 * - parcelas pagas/futuras: derivadas do status e data de vencimento de parcelas_compra.
 * - saldo restante: soma das parcelas em aberto (nao pagas e nao canceladas).
 *
 * Compatibilidade:
 * - quando nao ha parcelas_compra para uma compra legada, o fallback usa compras_cartao
 *   para estimar parcelas por mes, preservando comportamento historico.
 */
export function getCardObligations(input: CardAnalyticsInput): CardInstallmentObligation[] {
  const grouped = byCompraId(input.parcelasCompra);
  const obligations: CardInstallmentObligation[] = [];

  for (const compra of input.compras) {
    const rows = grouped.get(compra.id) ?? [];
    if (rows.length > 0) {
      for (const row of rows) {
        obligations.push({
          compraId: compra.id,
          cartaoId: compra.cartaoId,
          source: "parcela_compra",
          numero: row.numero,
          valor: row.valor,
          statusCartao: row.statusCartao,
          dataVencimento: row.dataVencimento ?? safeMonthDate(compra.dataCompra, row.numero - 1),
          dataPagamentoCartao: row.dataPagamentoCartao ?? null,
        });
      }
      continue;
    }

    obligations.push(...buildFallbackInstallments(compra));
  }

  return obligations;
}

export function getOutstandingCardInstallments(input: CardAnalyticsInput): CardInstallmentObligation[] {
  return getCardObligations(input).filter((row) => isOutstandingStatus(row.statusCartao));
}

export function getMonthlyCardObligations(input: CardAnalyticsInput, monthReference: string): CardInstallmentObligation[] {
  return getOutstandingCardInstallments(input)
    .filter((row) => String(row.dataVencimento || "").startsWith(monthReference));
}

export function getCardPortfolioSummary(input: CardAnalyticsInput): CardPortfolioSummary {
  const obligations = getCardObligations(input);
  const totalContratado = input.compras
    .reduce((sum, compra) => sum + toMoneyNumber(compra.valorTotal), 0);

  let totalPago = 0;
  let totalPendente = 0;
  for (const obligation of obligations) {
    const value = toMoneyNumber(obligation.valor);
    if (isPaidStatus(obligation.statusCartao)) {
      totalPago += value;
      continue;
    }

    if (isCanceledStatus(obligation.statusCartao)) {
      continue;
    }

    totalPendente += value;
  }

  const pagas = obligations.filter((row) => isPaidStatus(row.statusCartao)).length;
  const pendentes = obligations.filter((row) => isOutstandingStatus(row.statusCartao)).length;
  const comprasParceladas = input.compras.filter((compra) => normalizeInstallmentCount(compra.parcelas) > 1).length;

  return {
    totalContratado,
    totalPendente,
    totalPago,
    parcelas: {
      total: pagas + pendentes,
      pagas,
      pendentes,
    },
    compras: {
      total: input.compras.length,
      avista: input.compras.length - comprasParceladas,
      parceladas: comprasParceladas,
    },
  };
}

