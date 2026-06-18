import { format, parseISO } from "date-fns";
import { resolveDueDateFromCompetencia } from "./parcelas-compra-competency";
import { parseMoney } from "../utils/money";

type MoneyValue = string | number | null | undefined;

export type CardInvoiceInstallment = {
  cartaoId: string;
  valor: MoneyValue;
  statusCartao: string | null | undefined;
  dataVencimento: string | Date | null | undefined;
};

export type CardInvoicePaymentRecord = {
  cartaoId: string;
  competenciaMes: number | string | null | undefined;
  competenciaAno: number | string | null | undefined;
  valorPago: MoneyValue;
  considerarNoSaldoCompetencia?: boolean | null | undefined;
  dataPagamento?: string | null | undefined;
};

export type CardInvoiceStatus =
  | "aberta"
  | "parcialmente_paga"
  | "paga"
  | "vencida"
  | "vencida_parcialmente_paga";

export type CardInvoiceSnapshot = {
  cartaoId: string;
  monthReference: string;
  dueDate: string | null;
  originalTotal: number;
  paidInstallmentsTotal: number;
  activePartialPaymentsTotal: number;
  registeredPaymentsTotal: number;
  amountPaid: number;
  remainingAmount: number;
  installmentCount: number;
  openInstallmentsCount: number;
  status: CardInvoiceStatus;
};

type SnapshotAccumulator = {
  cartaoId: string;
  monthReference: string;
  dueDate: string | null;
  originalTotal: number;
  paidInstallmentsTotal: number;
  activePartialPaymentsTotal: number;
  registeredPaymentsTotal: number;
  installmentCount: number;
  openInstallmentsCount: number;
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

function isCanceledStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "cancelado";
}

function isPaidStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "pago";
}

function isOutstandingStatus(status: string | null | undefined): boolean {
  return !isPaidStatus(status) && !isCanceledStatus(status);
}

export function getCardInvoiceInstallmentMonthReference(
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

export function getCardInvoicePaymentMonthReference(
  payment: Pick<CardInvoicePaymentRecord, "competenciaMes" | "competenciaAno">,
): string | null {
  const year = Number(payment.competenciaAno);
  const month = Number(payment.competenciaMes);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return `${String(Math.trunc(year)).padStart(4, "0")}-${String(Math.trunc(month)).padStart(2, "0")}`;
}

function resolveSnapshotStatus(snapshot: {
  remainingAmount: number;
  amountPaid: number;
  dueDate: string | null;
}, referenceDate: string): CardInvoiceStatus {
  if (snapshot.remainingAmount <= 0) return "paga";
  const overdue = Boolean(snapshot.dueDate && snapshot.dueDate < referenceDate);
  if (overdue && snapshot.amountPaid > 0) return "vencida_parcialmente_paga";
  if (overdue) return "vencida";
  if (snapshot.amountPaid > 0) return "parcialmente_paga";
  return "aberta";
}

export function buildCardInvoiceSnapshots(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  getDueDayForCard?: (cartaoId: string) => number | null | undefined;
  referenceDate?: string;
}): CardInvoiceSnapshot[] {
  const grouped = new Map<string, SnapshotAccumulator>();
  const referenceDate = params.referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(params.referenceDate)
    ? params.referenceDate
    : format(new Date(), "yyyy-MM-dd");

  for (const installment of params.installments) {
    if (isCanceledStatus(installment.statusCartao)) continue;
    const monthReference = getCardInvoiceInstallmentMonthReference(installment.dataVencimento);
    if (!monthReference) continue;
    const key = `${installment.cartaoId}:${monthReference}`;
    const dueDay = params.getDueDayForCard?.(installment.cartaoId);
    const fallbackDataVencimento = typeof installment.dataVencimento === "string"
      ? installment.dataVencimento
      : null;
    const resolvedDueDate = resolveDueDateFromCompetencia({
      competencia: monthReference,
      diaVencimento: dueDay,
      fallbackDataVencimento,
    });

    const current = grouped.get(key) ?? {
      cartaoId: installment.cartaoId,
      monthReference,
      dueDate: resolvedDueDate,
      originalTotal: 0,
      paidInstallmentsTotal: 0,
      activePartialPaymentsTotal: 0,
      registeredPaymentsTotal: 0,
      installmentCount: 0,
      openInstallmentsCount: 0,
    };

    const amount = toMoneyNumber(installment.valor);
    current.originalTotal = round2(current.originalTotal + amount);
    current.installmentCount += 1;

    if (isPaidStatus(installment.statusCartao)) {
      current.paidInstallmentsTotal = round2(current.paidInstallmentsTotal + amount);
    } else if (isOutstandingStatus(installment.statusCartao)) {
      current.openInstallmentsCount += 1;
    }

    if (!current.dueDate || (resolvedDueDate && resolvedDueDate < current.dueDate)) {
      current.dueDate = resolvedDueDate;
    }

    grouped.set(key, current);
  }

  for (const payment of params.payments ?? []) {
    const monthReference = getCardInvoicePaymentMonthReference(payment);
    if (!monthReference) continue;
    const key = `${payment.cartaoId}:${monthReference}`;
    const dueDay = params.getDueDayForCard?.(payment.cartaoId);
    const resolvedDueDate = resolveDueDateFromCompetencia({
      competencia: monthReference,
      diaVencimento: dueDay,
    });
    const current = grouped.get(key) ?? {
      cartaoId: payment.cartaoId,
      monthReference,
      dueDate: resolvedDueDate,
      originalTotal: 0,
      paidInstallmentsTotal: 0,
      activePartialPaymentsTotal: 0,
      registeredPaymentsTotal: 0,
      installmentCount: 0,
      openInstallmentsCount: 0,
    };

    const amount = toMoneyNumber(payment.valorPago);
    current.registeredPaymentsTotal = round2(current.registeredPaymentsTotal + amount);
    if (payment.considerarNoSaldoCompetencia !== false) {
      current.activePartialPaymentsTotal = round2(current.activePartialPaymentsTotal + amount);
    }
    if (!current.dueDate && resolvedDueDate) {
      current.dueDate = resolvedDueDate;
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((snapshot) => {
      const remainingAmount = round2(Math.max(
        0,
        snapshot.originalTotal - snapshot.paidInstallmentsTotal - snapshot.activePartialPaymentsTotal,
      ));
      const amountPaid = round2(Math.max(0, snapshot.originalTotal - remainingAmount));
      return {
        cartaoId: snapshot.cartaoId,
        monthReference: snapshot.monthReference,
        dueDate: snapshot.dueDate,
        originalTotal: round2(snapshot.originalTotal),
        paidInstallmentsTotal: round2(snapshot.paidInstallmentsTotal),
        activePartialPaymentsTotal: round2(snapshot.activePartialPaymentsTotal),
        registeredPaymentsTotal: round2(snapshot.registeredPaymentsTotal),
        amountPaid,
        remainingAmount,
        installmentCount: snapshot.installmentCount,
        openInstallmentsCount: snapshot.openInstallmentsCount,
        status: resolveSnapshotStatus({
          remainingAmount,
          amountPaid,
          dueDate: snapshot.dueDate,
        }, referenceDate),
      } satisfies CardInvoiceSnapshot;
    })
    .sort((left, right) => {
      const leftDue = left.dueDate ?? `${left.monthReference}-99`;
      const rightDue = right.dueDate ?? `${right.monthReference}-99`;
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
      if (left.cartaoId !== right.cartaoId) return left.cartaoId.localeCompare(right.cartaoId);
      return left.monthReference.localeCompare(right.monthReference);
    });
}

export function findCardInvoiceSnapshot(params: {
  cartaoId: string;
  monthReference: string;
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  getDueDayForCard?: (cartaoId: string) => number | null | undefined;
  referenceDate?: string;
}): CardInvoiceSnapshot | null {
  return buildCardInvoiceSnapshots(params).find((snapshot) => (
    snapshot.cartaoId === params.cartaoId && snapshot.monthReference === params.monthReference
  )) ?? null;
}
