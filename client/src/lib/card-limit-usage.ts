import type { CompraCartao, ParcelaCompra } from "@shared/schema";
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
