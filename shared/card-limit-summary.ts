import { format, parseISO } from "date-fns";
import { parseMoney } from "../utils/money";
import {
  findCardInvoiceSnapshot,
  getCardInvoicePaymentMonthReference,
  type CardInvoicePaymentRecord,
} from "./card-invoice-payments";

type MoneyValue = string | number | null | undefined;

export type CardSummaryInstallment = {
  cartaoId: string;
  valor: MoneyValue;
  statusCartao: string | null | undefined;
  dataVencimento: string | Date | null | undefined;
};

export type CardLimitSummary = {
  faturaAtual: number;
  limiteComprometido: number;
  limiteDisponivel: number;
  saldoRestanteTotal: number;
  quantidadeParcelasPendentes: number;
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

export function isCardInstallmentOutstandingStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized !== "pago" && normalized !== "cancelado";
}

export function getCardInstallmentMonthReference(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return format(value, "yyyy-MM");
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);

  try {
    return format(parseISO(raw), "yyyy-MM");
  } catch {
    return null;
  }
}

export function buildCardLimitSummary(params: {
  cartaoId: string;
  limiteTotal: MoneyValue;
  monthReference: string;
  installments: CardSummaryInstallment[];
  invoicePayments?: CardInvoicePaymentRecord[];
  getDueDayForCard?: (cartaoId: string) => number | null | undefined;
  referenceDate?: string;
}): CardLimitSummary {
  const relevantInstallments = params.installments.filter((row) => row.cartaoId === params.cartaoId);
  const pendingInstallments = relevantInstallments.filter((row) => isCardInstallmentOutstandingStatus(row.statusCartao));
  const monthReferences = new Set<string>();

  for (const installment of relevantInstallments) {
    const monthReference = getCardInstallmentMonthReference(installment.dataVencimento);
    if (monthReference) {
      monthReferences.add(monthReference);
    }
  }

  for (const payment of params.invoicePayments ?? []) {
    if (payment.cartaoId !== params.cartaoId) continue;
    const monthReference = getCardInvoicePaymentMonthReference(payment);
    if (monthReference) {
      monthReferences.add(monthReference);
    }
  }

  let limiteComprometido = 0;
  let faturaAtual = 0;
  for (const monthReference of Array.from(monthReferences)) {
    const snapshot = findCardInvoiceSnapshot({
      cartaoId: params.cartaoId,
      monthReference,
      installments: relevantInstallments,
      payments: params.invoicePayments,
      getDueDayForCard: params.getDueDayForCard,
      referenceDate: params.referenceDate,
    });
    if (!snapshot) continue;
    limiteComprometido += snapshot.remainingAmount;
    if (monthReference === params.monthReference) {
      faturaAtual = snapshot.remainingAmount;
    }
  }
  const limiteDisponivel = toMoneyNumber(params.limiteTotal) - limiteComprometido;

  return {
    faturaAtual: round2(faturaAtual),
    limiteComprometido: round2(limiteComprometido),
    limiteDisponivel: round2(limiteDisponivel),
    saldoRestanteTotal: round2(limiteComprometido),
    quantidadeParcelasPendentes: pendingInstallments.length,
  };
}
