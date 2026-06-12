import type { CompraCartao, ParcelaCompra } from "@shared/schema";
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

export type ParcelasCompraByCompraId = Map<string, ParcelaCompra[]>;
export type CardInvoiceSnapshot = {
  monthReference: string;
  dueDate: string | null;
  total: number;
  installmentCount: number;
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

function buildOutstandingInstallmentsForCard(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
): CardSummaryInstallment[] {
  return compras
    .filter((compra) => compra.cartaoId === cartaoId)
    .flatMap((compra) => buildOutstandingInstallmentsForCompra(compra, parcelasByCompraId.get(compra.id)));
}

export function listOutstandingCardInvoiceSnapshots(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  diaVencimento?: number | null,
): CardInvoiceSnapshot[] {
  const grouped = new Map<string, CardInvoiceSnapshot>();

  for (const installment of buildOutstandingInstallmentsForCard(cartaoId, compras, parcelasByCompraId)) {
    const monthReference = getCardInstallmentMonthReference(installment.dataVencimento);
    if (!monthReference) continue;

    const fallbackDataVencimento = typeof installment.dataVencimento === "string"
      ? installment.dataVencimento
      : null;
    const dueDate = resolveDueDateFromCompetencia({
      competencia: monthReference,
      diaVencimento,
      fallbackDataVencimento,
    });

    const current = grouped.get(monthReference);
    if (current) {
      current.total = Math.round((current.total + toMoneyNumber(installment.valor)) * 100) / 100;
      current.installmentCount += 1;
      if (!current.dueDate || (dueDate && dueDate < current.dueDate)) {
        current.dueDate = dueDate;
      }
      continue;
    }

    grouped.set(monthReference, {
      monthReference,
      dueDate,
      total: Math.round(toMoneyNumber(installment.valor) * 100) / 100,
      installmentCount: 1,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const left = a.dueDate ?? `${a.monthReference}-99`;
    const right = b.dueDate ?? `${b.monthReference}-99`;
    return left.localeCompare(right);
  });
}

export function getNextOutstandingCardInvoiceSnapshot(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  diaVencimento?: number | null,
): CardInvoiceSnapshot | null {
  return listOutstandingCardInvoiceSnapshots(cartaoId, compras, parcelasByCompraId, diaVencimento)[0] ?? null;
}

export function calculateCardLimitSummary(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
  limiteTotal: string | number | null | undefined = 0,
): CardLimitSummary {
  return buildCardLimitSummary({
    cartaoId,
    limiteTotal,
    monthReference,
    installments: buildOutstandingInstallmentsForCard(cartaoId, compras, parcelasByCompraId),
  });
}

export function calculateCardUsedLimit(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
): number {
  return calculateCardLimitSummary(
    cartaoId,
    compras,
    parcelasByCompraId,
    format(new Date(), "yyyy-MM"),
  ).limiteComprometido;
}

export function calculateCardCurrentInvoiceTotal(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
): number {
  return calculateCardLimitSummary(
    cartaoId,
    compras,
    parcelasByCompraId,
    monthReference,
  ).faturaAtual;
}

export function calculateCardInvoiceForCompetency(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
): number {
  return calculateCardCurrentInvoiceTotal(cartaoId, compras, parcelasByCompraId, monthReference);
}
