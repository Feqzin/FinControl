import { format, parseISO } from "date-fns";
import { parseMoney } from "../utils/money";

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
}): CardLimitSummary {
  const installments = params.installments.filter(
    (row) => row.cartaoId === params.cartaoId && isCardInstallmentOutstandingStatus(row.statusCartao),
  );

  const limiteComprometido = installments.reduce((sum, row) => sum + toMoneyNumber(row.valor), 0);
  const faturaAtual = installments
    .filter((row) => getCardInstallmentMonthReference(row.dataVencimento) === params.monthReference)
    .reduce((sum, row) => sum + toMoneyNumber(row.valor), 0);
  const limiteDisponivel = toMoneyNumber(params.limiteTotal) - limiteComprometido;

  return {
    faturaAtual: round2(faturaAtual),
    limiteComprometido: round2(limiteComprometido),
    limiteDisponivel: round2(limiteDisponivel),
    saldoRestanteTotal: round2(limiteComprometido),
    quantidadeParcelasPendentes: installments.length,
  };
}
