import type { CompraCartao, ParcelaCompra, Servico, ServicoCobrancaPagamento } from "@shared/schema";
import { resolveDueDateFromCompetencia } from "@shared/parcelas-compra-competency";
import { addMonths, format, parseISO } from "date-fns";
import { toMoneyNumber } from "@/lib/money";
import {
  buildCardLimitSummary,
  getCardInstallmentMonthReference,
  isCardInstallmentOutstandingStatus,
  type CardLimitSummary,
  type CardSummaryInstallment,
} from "@shared/card-limit-summary";
import {
  buildCardInvoiceSnapshots,
  type CardInvoicePaymentRecord,
} from "@shared/card-invoice-payments";
import {
  buildServicoCardProjectionInstallments,
  type ServicoCardProjectionInstallment,
} from "@shared/servico-periodicidade";

export type ParcelasCompraByCompraId = Map<string, ParcelaCompra[]>;
export type CardInvoiceSnapshot = {
  monthReference: string;
  dueDate: string | null;
  total: number;
  installmentCount: number;
};

type CardProjectionOptions = {
  servicos?: Servico[];
  servicoCobrancaPagamentos?: ServicoCobrancaPagamento[];
  monthReferences?: string[];
};

// Regras locais de limite ficam como fallback transitorio.
// Fonte oficial de calculo: backend /api/cartoes/resumo.
export function groupParcelasCompraByCompraId(parcelasCompra: ParcelaCompra[]): ParcelasCompraByCompraId {
  const grouped = new Map<string, ParcelaCompra[]>();
  for (const row of parcelasCompra) {
    const rows = grouped.get(row.compraCartaoId) ?? [];
    rows.push(row);
    grouped.set(row.compraCartaoId, rows);
  }
  return grouped;
}

export function isParcelaComprometendoLimite(statusCartao: string | null | undefined): boolean {
  return isCardInstallmentOutstandingStatus(statusCartao);
}

export function getInvoiceCompetency(value: string | Date | null | undefined): string | null {
  return getCardInstallmentMonthReference(value);
}

function resolveLegacyInstallmentMonth(compra: CompraCartao, installmentNumber: number): string | null {
  const dataCompra = String(compra.dataCompra ?? "").trim();
  if (!dataCompra) return null;
  const normalizedInstallment = Math.max(1, Math.trunc(Number(installmentNumber) || 1));
  try {
    return format(addMonths(parseISO(dataCompra), normalizedInstallment - 1), "yyyy-MM");
  } catch {
    return null;
  }
}

function normalizeInstallmentsTotal(compra: CompraCartao): number {
  const parsed = Math.trunc(Number(compra.parcelas) || 1);
  return Math.max(1, parsed);
}

function normalizeCurrentInstallment(compra: CompraCartao, totalInstallments: number): number {
  const parsed = Math.trunc(Number(compra.parcelaAtual) || 1);
  return Math.min(totalInstallments, Math.max(1, parsed));
}

function buildCompraMonthReferences(
  compra: CompraCartao,
  parcelasMaterializadas: ParcelaCompra[] | undefined,
): Set<string> {
  const monthReferences = new Set<string>();

  if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
    for (const parcela of parcelasMaterializadas) {
      const normalizedStatus = String(parcela.statusCartao ?? "").trim().toLowerCase();
      if (normalizedStatus === "cancelado") continue;
      const monthReference = getInvoiceCompetency(parcela.dataVencimento);
      if (monthReference) monthReferences.add(monthReference);
    }
    return monthReferences;
  }

  const totalInstallments = normalizeInstallmentsTotal(compra);
  const currentInstallment = normalizeCurrentInstallment(compra, totalInstallments);
  for (let installmentNumber = currentInstallment; installmentNumber <= totalInstallments; installmentNumber += 1) {
    const monthReference = resolveLegacyInstallmentMonth(compra, installmentNumber);
    if (monthReference) monthReferences.add(monthReference);
  }

  return monthReferences;
}

function buildRealPurchaseMonthsByCompraId(
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
): Map<string, Set<string>> {
  return new Map(
    compras.map((compra) => [
      compra.id,
      buildCompraMonthReferences(compra, parcelasByCompraId.get(compra.id)),
    ] as const),
  );
}

function normalizeProjectionMonthReferences(
  monthReferences: string[] | undefined,
  fallbackMonthReference?: string,
): string[] {
  const normalized = Array.from(
    new Set((monthReferences ?? []).filter((monthReference) => /^\d{4}-\d{2}$/.test(monthReference))),
  );

  if (normalized.length > 0) return normalized;
  if (fallbackMonthReference && /^\d{4}-\d{2}$/.test(fallbackMonthReference)) return [fallbackMonthReference];
  return [format(new Date(), "yyyy-MM")];
}

function mapProjectedInstallmentToCardSummaryInstallment(
  installment: ServicoCardProjectionInstallment,
): CardSummaryInstallment {
  return {
    id: installment.id,
    cartaoId: installment.cartaoId,
    valor: installment.valorPendente,
    statusCartao: "pendente",
    dataVencimento: installment.dataVencimento,
  };
}

export function buildProjectedServiceInstallmentsForCard(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  options?: CardProjectionOptions,
): CardSummaryInstallment[] {
  const servicos = options?.servicos ?? [];
  if (servicos.length === 0) return [];

  const monthReferences = normalizeProjectionMonthReferences(options?.monthReferences);
  const projected = buildServicoCardProjectionInstallments({
    servicos,
    monthReferences,
    payments: options?.servicoCobrancaPagamentos ?? [],
    realPurchaseMonthsByCompraId: buildRealPurchaseMonthsByCompraId(compras, parcelasByCompraId),
  });

  return projected
    .filter((installment) => installment.cartaoId === cartaoId)
    .map(mapProjectedInstallmentToCardSummaryInstallment);
}

export function compraHasOpenInstallmentInMonth(
  compra: CompraCartao,
  parcelasMaterializadas: ParcelaCompra[] | undefined,
  monthReference: string,
): boolean {
  if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
    return parcelasMaterializadas.some((row) =>
      isParcelaComprometendoLimite(row.statusCartao)
      && getInvoiceCompetency(row.dataVencimento) === monthReference);
  }

  const totalInstallments = normalizeInstallmentsTotal(compra);
  const currentInstallment = normalizeCurrentInstallment(compra, totalInstallments);
  const legacyInstallmentMonth = resolveLegacyInstallmentMonth(compra, currentInstallment);
  if (!legacyInstallmentMonth) return false;
  return legacyInstallmentMonth === monthReference;
}

export function filterParcelasByCompetency(
  parcelas: ParcelaCompra[] | undefined,
  monthReference: string,
): ParcelaCompra[] {
  if (!parcelas || parcelas.length === 0) return [];
  return parcelas.filter((parcela) => getInvoiceCompetency(parcela.dataVencimento) === monthReference);
}

export function compraHasInstallmentInCompetency(
  compra: CompraCartao,
  parcelasMaterializadas: ParcelaCompra[] | undefined,
  monthReference: string,
  options?: { includePaid?: boolean; includeCanceled?: boolean },
): boolean {
  const includePaid = options?.includePaid === true;
  const includeCanceled = options?.includeCanceled === true;

  if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
    const parcelasNoMes = filterParcelasByCompetency(parcelasMaterializadas, monthReference);
    return parcelasNoMes.some((parcela) => {
      const normalizedStatus = String(parcela.statusCartao ?? "").trim().toLowerCase();
      if (normalizedStatus === "cancelado" && !includeCanceled) return false;
      if (normalizedStatus === "pago" && !includePaid) return false;
      return true;
    });
  }

  const totalInstallments = normalizeInstallmentsTotal(compra);
  const currentInstallment = normalizeCurrentInstallment(compra, totalInstallments);
  const legacyInstallmentMonth = resolveLegacyInstallmentMonth(compra, currentInstallment);
  if (!legacyInstallmentMonth) return false;
  return legacyInstallmentMonth === monthReference;
}

export function calculateComprometidoByCompra(
  compra: CompraCartao,
  parcelasMaterializadas: ParcelaCompra[] | undefined,
): number {
  return buildOutstandingInstallmentsForCompra(compra, parcelasMaterializadas)
    .reduce((acc, row) => acc + toMoneyNumber(row.valor), 0);
}

function buildOutstandingInstallmentsForCompra(
  compra: CompraCartao,
  parcelasMaterializadas: ParcelaCompra[] | undefined,
): CardSummaryInstallment[] {
  if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
    return parcelasMaterializadas
      .filter((row) => isParcelaComprometendoLimite(row.statusCartao))
      .map((row) => ({
        id: row.id,
        cartaoId: compra.cartaoId,
        valor: row.valor,
        statusCartao: row.statusCartao,
        dataVencimento: row.dataVencimento,
      }));
  }

  const totalInstallments = normalizeInstallmentsTotal(compra);
  const currentInstallment = normalizeCurrentInstallment(compra, totalInstallments);
  const rows: CardSummaryInstallment[] = [];

  for (let installmentNumber = currentInstallment; installmentNumber <= totalInstallments; installmentNumber += 1) {
    rows.push({
      cartaoId: compra.cartaoId,
      valor: compra.valorParcela,
      statusCartao: "pendente",
      dataVencimento: resolveLegacyInstallmentMonth(compra, installmentNumber),
    });
  }

  return rows;
}

function buildInvoiceTrackingInstallmentsForCompra(
  compra: CompraCartao,
  parcelasMaterializadas: ParcelaCompra[] | undefined,
): CardSummaryInstallment[] {
  if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
    return parcelasMaterializadas
      .filter((row) => String(row.statusCartao ?? "").trim().toLowerCase() !== "cancelado")
      .map((row) => ({
        id: row.id,
        cartaoId: compra.cartaoId,
        valor: row.valor,
        statusCartao: row.statusCartao,
        dataVencimento: row.dataVencimento,
      }));
  }

  return buildOutstandingInstallmentsForCompra(compra, parcelasMaterializadas);
}

function buildOutstandingInstallmentsForCard(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
): CardSummaryInstallment[] {
  return compras
    .filter((compra) => compra.cartaoId === cartaoId)
    .flatMap((compra) => buildOutstandingInstallmentsForCompra(compra, parcelasByCompraId.get(compra.id)));
}

export function buildInvoiceTrackingInstallmentsForCard(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  options?: CardProjectionOptions,
): CardSummaryInstallment[] {
  const realInstallments = compras
    .filter((compra) => compra.cartaoId === cartaoId)
    .flatMap((compra) => buildInvoiceTrackingInstallmentsForCompra(compra, parcelasByCompraId.get(compra.id)));
  const projectedInstallments = buildProjectedServiceInstallmentsForCard(
    cartaoId,
    compras,
    parcelasByCompraId,
    options,
  );

  return [...realInstallments, ...projectedInstallments];
}

export function listOutstandingCardInvoiceSnapshots(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  diaVencimento?: number | null,
  invoicePayments: CardInvoicePaymentRecord[] = [],
  options?: CardProjectionOptions,
): CardInvoiceSnapshot[] {
  const monthReferences = normalizeProjectionMonthReferences(options?.monthReferences);
  return buildCardInvoiceSnapshots({
    installments: [
      ...buildOutstandingInstallmentsForCard(cartaoId, compras, parcelasByCompraId),
      ...buildProjectedServiceInstallmentsForCard(cartaoId, compras, parcelasByCompraId, {
        ...options,
        monthReferences,
      }),
    ],
    payments: invoicePayments.filter((payment) => payment.cartaoId === cartaoId),
    getDueDayForCard: () => diaVencimento ?? null,
    referenceDate: format(new Date(), "yyyy-MM-dd"),
  })
    .filter((snapshot) => snapshot.remainingAmount > 0)
    .map((snapshot) => ({
      monthReference: snapshot.monthReference,
      dueDate: snapshot.dueDate,
      total: snapshot.remainingAmount,
      installmentCount: snapshot.openInstallmentsCount,
    }));
}

export function getNextOutstandingCardInvoiceSnapshot(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  diaVencimento?: number | null,
  invoicePayments: CardInvoicePaymentRecord[] = [],
  options?: CardProjectionOptions,
): CardInvoiceSnapshot | null {
  return listOutstandingCardInvoiceSnapshots(
    cartaoId,
    compras,
    parcelasByCompraId,
    diaVencimento,
    invoicePayments,
    options,
  )[0] ?? null;
}

export function calculateCardLimitSummary(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
  limiteTotal: string | number | null | undefined = 0,
  invoicePayments: CardInvoicePaymentRecord[] = [],
  options?: Omit<CardProjectionOptions, "monthReferences">,
): CardLimitSummary {
  return buildCardLimitSummary({
    cartaoId,
    limiteTotal,
    monthReference,
    installments: [
      ...buildOutstandingInstallmentsForCard(cartaoId, compras, parcelasByCompraId),
      ...buildProjectedServiceInstallmentsForCard(cartaoId, compras, parcelasByCompraId, {
        ...options,
        monthReferences: [monthReference],
      }),
    ],
    invoicePayments: invoicePayments.filter((payment) => payment.cartaoId === cartaoId),
  });
}

export function calculateCardUsedLimit(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  invoicePayments: CardInvoicePaymentRecord[] = [],
  options?: Omit<CardProjectionOptions, "monthReferences">,
): number {
  return calculateCardLimitSummary(
    cartaoId,
    compras,
    parcelasByCompraId,
    format(new Date(), "yyyy-MM"),
    0,
    invoicePayments,
    options,
  ).limiteComprometido;
}

export function calculateCardCurrentInvoiceTotal(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
  invoicePayments: CardInvoicePaymentRecord[] = [],
  options?: Omit<CardProjectionOptions, "monthReferences">,
): number {
  return calculateCardLimitSummary(
    cartaoId,
    compras,
    parcelasByCompraId,
    monthReference,
    0,
    invoicePayments,
    options,
  ).faturaAtual;
}

export function calculateCardInvoiceForCompetency(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
  invoicePayments: CardInvoicePaymentRecord[] = [],
  options?: Omit<CardProjectionOptions, "monthReferences">,
): number {
  return calculateCardCurrentInvoiceTotal(
    cartaoId,
    compras,
    parcelasByCompraId,
    monthReference,
    invoicePayments,
    options,
  );
}
