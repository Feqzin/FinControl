import { format, parseISO } from "date-fns";
import { resolveDueDateFromCompetencia } from "./parcelas-compra-competency.js";
import { parseMoney } from "../utils/money.js";

type MoneyValue = string | number | null | undefined;

export type CardInvoiceAllocationMode =
  | "ordem_fatura"
  | "menores_primeiro"
  | "maiores_primeiro"
  | "manual";

export type CardInvoiceInstallmentPaymentStatus =
  | "pendente"
  | "parcialmente_pago"
  | "pago";

export type CardInvoiceInstallment = {
  id?: string | null;
  compraId?: string | null;
  descricao?: string | null;
  numero?: number | null;
  cartaoId: string;
  valor: MoneyValue;
  statusCartao: string | null | undefined;
  dataVencimento: string | Date | null | undefined;
};

export type CardInvoicePaymentAllocationRecord = {
  id?: string | null;
  pagamentoId?: string | null;
  parcelaCompraId: string;
  valorAplicado: MoneyValue;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type CardInvoiceManualAllocationInput = {
  parcelaCompraId: string;
  valorAplicado?: MoneyValue;
};

export type CardInvoicePaymentRecord = {
  id?: string | null;
  cartaoId: string;
  competenciaMes: number | string | null | undefined;
  competenciaAno: number | string | null | undefined;
  valorPago: MoneyValue;
  considerarNoSaldoCompetencia?: boolean | null | undefined;
  dataPagamento?: string | null | undefined;
  modoAlocacao?: CardInvoiceAllocationMode | string | null | undefined;
  alocacoes?: CardInvoicePaymentAllocationRecord[] | null | undefined;
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

export type CardInvoiceAllocationPlanItem = {
  parcelaCompraId: string;
  valorAplicado: number;
};

export type CardInvoiceAllocationPlanResult = {
  alocacoes: CardInvoiceAllocationPlanItem[];
  valorAlocado: number;
  valorNaoAlocado: number;
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

type AllocatableInstallment = CardInvoiceInstallment & {
  id: string;
  valorOriginal: number;
  valorPagoEfetivo: number;
  valorRestante: number;
  ordemFatura: number;
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

function hasPersistedAllocations(payment: CardInvoicePaymentRecord): boolean {
  return (payment.alocacoes ?? []).length > 0;
}

function compareOptionalText(left: string | null | undefined, right: string | null | undefined): number {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function compareOptionalNumber(left: number | null | undefined, right: number | null | undefined): number {
  return (left ?? 0) - (right ?? 0);
}

function compareInvoiceOrder(left: CardInvoiceInstallment, right: CardInvoiceInstallment): number {
  const leftDue = getCardInvoiceInstallmentMonthReference(left.dataVencimento) ?? "";
  const rightDue = getCardInvoiceInstallmentMonthReference(right.dataVencimento) ?? "";
  if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);

  const byDate = compareOptionalText(
    typeof left.dataVencimento === "string" ? left.dataVencimento : null,
    typeof right.dataVencimento === "string" ? right.dataVencimento : null,
  );
  if (byDate !== 0) return byDate;

  const byNumber = compareOptionalNumber(left.numero, right.numero);
  if (byNumber !== 0) return byNumber;

  const byDescription = compareOptionalText(left.descricao, right.descricao);
  if (byDescription !== 0) return byDescription;

  return compareOptionalText(left.id, right.id);
}

function buildPaymentAllocationAmountMap(
  payments: CardInvoicePaymentRecord[],
): Map<string, number> {
  const map = new Map<string, number>();

  for (const payment of payments) {
    for (const allocation of payment.alocacoes ?? []) {
      if (!allocation.parcelaCompraId) continue;
      const current = map.get(allocation.parcelaCompraId) ?? 0;
      map.set(
        allocation.parcelaCompraId,
        round2(current + toMoneyNumber(allocation.valorAplicado)),
      );
    }
  }

  return map;
}

function buildSnapshotAccumulator(
  cartaoId: string,
  monthReference: string,
  dueDate: string | null,
): SnapshotAccumulator {
  return {
    cartaoId,
    monthReference,
    dueDate,
    originalTotal: 0,
    paidInstallmentsTotal: 0,
    activePartialPaymentsTotal: 0,
    registeredPaymentsTotal: 0,
    installmentCount: 0,
    openInstallmentsCount: 0,
  };
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

function allocateAcrossInstallments(
  installments: AllocatableInstallment[],
  paymentAmount: number,
): CardInvoiceAllocationPlanResult {
  const alocacoes: CardInvoiceAllocationPlanItem[] = [];
  let restante = round2(paymentAmount);

  for (const installment of installments) {
    if (restante <= 0) break;
    if (installment.valorRestante <= 0) continue;
    const valorAplicado = round2(Math.min(restante, installment.valorRestante));
    if (valorAplicado <= 0) continue;
    alocacoes.push({
      parcelaCompraId: installment.id,
      valorAplicado,
    });
    restante = round2(restante - valorAplicado);
  }

  return {
    alocacoes,
    valorAlocado: round2(paymentAmount - restante),
    valorNaoAlocado: restante,
  };
}

function normalizeAllocatableInstallments(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
}): AllocatableInstallment[] {
  const relevantInstallments = params.installments
    .filter((installment): installment is CardInvoiceInstallment & { id: string } => Boolean(installment.id))
    .filter((installment) => !isCanceledStatus(installment.statusCartao));

  const sorted = [...relevantInstallments].sort(compareInvoiceOrder);

  return sorted
    .map((installment, index) => {
      const valorOriginal = round2(toMoneyNumber(installment.valor));
      const valorPagoEfetivo = getInstallmentEffectivePaidAmount(installment, params.payments);
      const valorRestante = round2(Math.max(0, valorOriginal - valorPagoEfetivo));
      return {
        ...installment,
        id: installment.id,
        valorOriginal,
        valorPagoEfetivo,
        valorRestante,
        ordemFatura: index,
      } satisfies AllocatableInstallment;
    })
    .filter((installment) => installment.valorRestante > 0);
}

function buildManualAllocationPlan(params: {
  installments: AllocatableInstallment[];
  paymentAmount: number;
  manualAllocations?: CardInvoiceManualAllocationInput[];
  applyRemainingAutomatically?: boolean;
}): CardInvoiceAllocationPlanResult {
  const selectedInputs = params.manualAllocations ?? [];
  const selectedById = new Map(selectedInputs.map((item) => [item.parcelaCompraId, item]));
  const selectedInstallments = params.installments.filter((installment) => selectedById.has(installment.id));

  let restante = round2(params.paymentAmount);
  const alocacoes: CardInvoiceAllocationPlanItem[] = [];

  for (const installment of selectedInstallments) {
    if (restante <= 0) break;
    const selected = selectedById.get(installment.id);
    const valorDesejado = selected?.valorAplicado == null
      ? installment.valorRestante
      : round2(Math.max(0, toMoneyNumber(selected.valorAplicado)));
    const valorAplicado = round2(Math.min(restante, installment.valorRestante, valorDesejado));
    if (valorAplicado <= 0) continue;
    alocacoes.push({
      parcelaCompraId: installment.id,
      valorAplicado,
    });
    restante = round2(restante - valorAplicado);
  }

  if (restante > 0 && params.applyRemainingAutomatically) {
    const unselectedInstallments = params.installments.filter((installment) => !selectedById.has(installment.id));
    const complemento = allocateAcrossInstallments(unselectedInstallments, restante);
    alocacoes.push(...complemento.alocacoes);
    restante = complemento.valorNaoAlocado;
  }

  return {
    alocacoes,
    valorAlocado: round2(params.paymentAmount - restante),
    valorNaoAlocado: restante,
  };
}

export function attachCardInvoicePaymentAllocations<
  TPayment extends CardInvoicePaymentRecord & { id?: string | null },
>(
  payments: TPayment[],
  allocations: CardInvoicePaymentAllocationRecord[],
): Array<TPayment & { alocacoes: CardInvoicePaymentAllocationRecord[] }> {
  const allocationsByPaymentId = new Map<string, CardInvoicePaymentAllocationRecord[]>();

  for (const allocation of allocations) {
    if (!allocation.pagamentoId) continue;
    const rows = allocationsByPaymentId.get(allocation.pagamentoId) ?? [];
    rows.push(allocation);
    allocationsByPaymentId.set(allocation.pagamentoId, rows);
  }

  return payments.map((payment) => ({
    ...payment,
    alocacoes: payment.id ? (allocationsByPaymentId.get(payment.id) ?? []) : [],
  }));
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

export function calculateInvoicePaidAmountByInstallment(
  installmentId: string | null | undefined,
  payments: CardInvoicePaymentRecord[] = [],
): number {
  if (!installmentId) return 0;
  return round2((buildPaymentAllocationAmountMap(payments).get(installmentId) ?? 0));
}

export function getInstallmentEffectivePaidAmount(
  installment: Pick<CardInvoiceInstallment, "id" | "valor" | "statusCartao">,
  payments: CardInvoicePaymentRecord[] = [],
): number {
  const originalAmount = round2(toMoneyNumber(installment.valor));
  if (originalAmount <= 0 || isCanceledStatus(installment.statusCartao)) return 0;
  if (isPaidStatus(installment.statusCartao)) return originalAmount;
  if (!installment.id) return 0;
  return round2(Math.min(
    originalAmount,
    calculateInvoicePaidAmountByInstallment(installment.id, payments),
  ));
}

export function getInstallmentRemainingAmount(
  installment: Pick<CardInvoiceInstallment, "id" | "valor" | "statusCartao">,
  payments: CardInvoicePaymentRecord[] = [],
): number {
  const originalAmount = round2(toMoneyNumber(installment.valor));
  const paidAmount = getInstallmentEffectivePaidAmount(installment, payments);
  return round2(Math.max(0, originalAmount - paidAmount));
}

export function getInstallmentInvoicePaymentStatus(
  installment: Pick<CardInvoiceInstallment, "id" | "valor" | "statusCartao">,
  payments: CardInvoicePaymentRecord[] = [],
): CardInvoiceInstallmentPaymentStatus {
  const originalAmount = round2(toMoneyNumber(installment.valor));
  const paidAmount = getInstallmentEffectivePaidAmount(installment, payments);
  if (originalAmount <= 0) return "pago";
  if (paidAmount <= 0) return "pendente";
  if (paidAmount >= originalAmount) return "pago";
  return "parcialmente_pago";
}

export function calculateInvoiceRemainingAfterAllocations(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
}): number {
  const snapshots = buildCardInvoiceSnapshots({
    installments: params.installments,
    payments: params.payments,
  });
  if (snapshots.length === 0) return 0;
  return round2(snapshots.reduce((sum, snapshot) => sum + snapshot.remainingAmount, 0));
}

export function allocatePaymentByInvoiceOrder(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  paymentAmount: number;
}): CardInvoiceAllocationPlanResult {
  const installments = normalizeAllocatableInstallments(params);
  return allocateAcrossInstallments(installments, round2(Math.max(0, params.paymentAmount)));
}

export function allocatePaymentSmallestFirst(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  paymentAmount: number;
}): CardInvoiceAllocationPlanResult {
  const installments = normalizeAllocatableInstallments(params)
    .sort((left, right) => {
      if (left.valorRestante !== right.valorRestante) return left.valorRestante - right.valorRestante;
      return left.ordemFatura - right.ordemFatura;
    });
  return allocateAcrossInstallments(installments, round2(Math.max(0, params.paymentAmount)));
}

export function allocatePaymentLargestFirst(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  paymentAmount: number;
}): CardInvoiceAllocationPlanResult {
  const installments = normalizeAllocatableInstallments(params)
    .sort((left, right) => {
      if (left.valorRestante !== right.valorRestante) return right.valorRestante - left.valorRestante;
      return left.ordemFatura - right.ordemFatura;
    });
  return allocateAcrossInstallments(installments, round2(Math.max(0, params.paymentAmount)));
}

export function allocatePaymentManually(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  paymentAmount: number;
  manualAllocations?: CardInvoiceManualAllocationInput[];
  applyRemainingAutomatically?: boolean;
}): CardInvoiceAllocationPlanResult {
  const installments = normalizeAllocatableInstallments(params);
  return buildManualAllocationPlan({
    installments,
    paymentAmount: round2(Math.max(0, params.paymentAmount)),
    manualAllocations: params.manualAllocations,
    applyRemainingAutomatically: params.applyRemainingAutomatically,
  });
}

export function buildInvoicePaymentAllocationPlan(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  paymentAmount: number;
  mode: CardInvoiceAllocationMode;
  manualAllocations?: CardInvoiceManualAllocationInput[];
  applyRemainingAutomatically?: boolean;
}): CardInvoiceAllocationPlanResult {
  switch (params.mode) {
    case "menores_primeiro":
      return allocatePaymentSmallestFirst(params);
    case "maiores_primeiro":
      return allocatePaymentLargestFirst(params);
    case "manual":
      return allocatePaymentManually(params);
    case "ordem_fatura":
    default:
      return allocatePaymentByInvoiceOrder(params);
  }
}

export function buildCardInvoiceSnapshots(params: {
  installments: CardInvoiceInstallment[];
  payments?: CardInvoicePaymentRecord[];
  getDueDayForCard?: (cartaoId: string) => number | null | undefined;
  referenceDate?: string;
}): CardInvoiceSnapshot[] {
  const grouped = new Map<string, SnapshotAccumulator>();
  const payments = params.payments ?? [];
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

    const current = grouped.get(key) ?? buildSnapshotAccumulator(
      installment.cartaoId,
      monthReference,
      resolvedDueDate,
    );

    const amount = round2(toMoneyNumber(installment.valor));
    const amountPaid = getInstallmentEffectivePaidAmount(installment, payments);
    const remainingAmount = round2(Math.max(0, amount - amountPaid));

    current.originalTotal = round2(current.originalTotal + amount);
    current.paidInstallmentsTotal = round2(current.paidInstallmentsTotal + amountPaid);
    current.installmentCount += 1;

    if (remainingAmount > 0 && isOutstandingStatus(installment.statusCartao)) {
      current.openInstallmentsCount += 1;
    }

    if (!current.dueDate || (resolvedDueDate && resolvedDueDate < current.dueDate)) {
      current.dueDate = resolvedDueDate;
    }

    grouped.set(key, current);
  }

  for (const payment of payments) {
    const monthReference = getCardInvoicePaymentMonthReference(payment);
    if (!monthReference) continue;
    const key = `${payment.cartaoId}:${monthReference}`;
    const dueDay = params.getDueDayForCard?.(payment.cartaoId);
    const resolvedDueDate = resolveDueDateFromCompetencia({
      competencia: monthReference,
      diaVencimento: dueDay,
    });

    const current = grouped.get(key) ?? buildSnapshotAccumulator(
      payment.cartaoId,
      monthReference,
      resolvedDueDate,
    );

    const amount = round2(toMoneyNumber(payment.valorPago));
    current.registeredPaymentsTotal = round2(current.registeredPaymentsTotal + amount);
    if (!hasPersistedAllocations(payment) && payment.considerarNoSaldoCompetencia !== false) {
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
