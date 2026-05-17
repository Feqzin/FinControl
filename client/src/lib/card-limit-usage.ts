import type { CompraCartao, ParcelaCompra } from "@shared/schema";
import { addMonths, format, parseISO } from "date-fns";
import { toMoneyNumber } from "@/lib/money";

export type ParcelasCompraByCompraId = Map<string, ParcelaCompra[]>;

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
  const normalized = String(statusCartao ?? "").trim().toLowerCase();
  return normalized !== "pago" && normalized !== "cancelado";
}

export function getInvoiceCompetency(value: string | Date | null | undefined): string | null {
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
  if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
    return parcelasMaterializadas
      .filter((row) => isParcelaComprometendoLimite(row.statusCartao))
      .reduce((acc, row) => acc + toMoneyNumber(row.valor), 0);
  }

  const parcelas = Math.max(1, Number(compra.parcelas) || 1);
  const parcelaAtual = Math.min(Math.max(1, Number(compra.parcelaAtual) || 1), parcelas);
  const parcelasRestantes = Math.max(parcelas - parcelaAtual + 1, 0);
  const valorParcela = toMoneyNumber(compra.valorParcela);
  const valorTotal = toMoneyNumber(compra.valorTotal);

  return Math.min(valorParcela * parcelasRestantes, valorTotal || valorParcela * parcelas);
}

export function calculateCardUsedLimit(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
): number {
  return compras
    .filter((compra) => compra.cartaoId === cartaoId)
    .reduce((sum, compra) => {
      const parcelasMaterializadas = parcelasByCompraId.get(compra.id);
      return sum + calculateComprometidoByCompra(compra, parcelasMaterializadas);
    }, 0);
}

export function calculateCardCurrentInvoiceTotal(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
): number {
  return compras
    .filter((compra) => compra.cartaoId === cartaoId)
    .reduce((sum, compra) => {
      const parcelasMaterializadas = parcelasByCompraId.get(compra.id);
      if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
        const monthlyOpenTotal = filterParcelasByCompetency(parcelasMaterializadas, monthReference)
          .filter((row) => isParcelaComprometendoLimite(row.statusCartao))
          .reduce((acc, row) => acc + toMoneyNumber(row.valor), 0);
        return sum + monthlyOpenTotal;
      }

      const totalInstallments = normalizeInstallmentsTotal(compra);
      const currentInstallment = normalizeCurrentInstallment(compra, totalInstallments);
      const legacyInstallmentMonth = resolveLegacyInstallmentMonth(compra, currentInstallment);
      if (legacyInstallmentMonth !== monthReference) return sum;
      return sum + toMoneyNumber(compra.valorParcela);
    }, 0);
}

export function calculateCardInvoiceForCompetency(
  cartaoId: string,
  compras: CompraCartao[],
  parcelasByCompraId: ParcelasCompraByCompraId,
  monthReference: string,
): number {
  return calculateCardCurrentInvoiceTotal(cartaoId, compras, parcelasByCompraId, monthReference);
}
