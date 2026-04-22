import { addMonths, format } from "date-fns";
import type { CompraCartao, InsertParcelaCompra } from "../../shared/schema.js";
import type { FinancialRepository } from "../repositories/financial.repository.js";
import { formatMoneyFixed, parseMoney } from "../../utils/money.js";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency.js";

type CompraScheduleSource = Pick<
  CompraCartao,
  | "id"
  | "userId"
  | "parcelas"
  | "parcelaAtual"
  | "valorParcela"
  | "dataCompra"
  | "pessoaId"
  | "statusPessoa"
  | "dataPagamentoPessoa"
>;

export type ParcelasCompraSyncResult = {
  compraCartaoId: string;
  expectedCount: number;
  existingCount: number;
  createdCount: number;
  materialized: boolean;
};

function normalizeParcelas(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeParcelaAtual(value: number, total: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.trunc(value), total));
}

/**
 * Materializa o cronograma de parcelas de uma compra parcelada.
 * Regras mantidas para retrocompatibilidade com o comportamento anterior do sistema.
 */
export function buildParcelasCompraRows(compra: CompraScheduleSource): InsertParcelaCompra[] {
  const total = normalizeParcelas(Number(compra.parcelas));
  const atual = normalizeParcelaAtual(Number(compra.parcelaAtual), total);
  const valorParcela = parseMoney(compra.valorParcela) ?? 0;
  const baseDate = new Date(`${compra.dataCompra}T12:00:00`);

  return Array.from({ length: total }, (_, index) => {
    const numero = index + 1;
    // Semantica unica:
    // - parcelas anteriores a `parcelaAtual` sao historico pago.
    // - `parcelaAtual` e posteriores ficam em aberto.
    const isPaid = numero < atual;

    return {
      userId: compra.userId,
      compraCartaoId: compra.id,
      numero,
      valor: formatMoneyFixed(valorParcela) ?? "0.00",
      dataVencimento: format(addMonths(baseDate, index), "yyyy-MM-dd"),
      statusCartao: isPaid ? "pago" : "pendente",
      dataPagamentoCartao: isPaid ? compra.dataCompra : null,
      statusPessoa: isPaid
        ? (compra.statusPessoa || null)
        : (numero === atual && compra.pessoaId ? (compra.statusPessoa || "pendente") : null),
      dataPagamentoPessoa: isPaid ? (compra.dataPagamentoPessoa || null) : null,
    };
  });
}

export async function materializeParcelasCompraIfMissing(
  repository: FinancialRepository,
  compra: CompraScheduleSource,
): Promise<ParcelasCompraSyncResult> {
  const existing = await repository.getParcelasCompra(compra.id, compra.userId);
  const expectedCount = normalizeParcelas(Number(compra.parcelas));

  if (existing.length > 0) {
    return {
      compraCartaoId: compra.id,
      expectedCount,
      existingCount: existing.length,
      createdCount: 0,
      materialized: false,
    };
  }

  const rows = buildParcelasCompraRows(compra);
  const created = await repository.createParcelasCompraBulk(rows);

  return {
    compraCartaoId: compra.id,
    expectedCount,
    existingCount: 0,
    createdCount: created.length,
    materialized: created.length > 0,
  };
}

export async function syncParcelasCompraForCompraId(
  repository: FinancialRepository,
  compraId: string,
  userId: string,
): Promise<ParcelasCompraSyncResult | { error: "COMPRA_NOT_FOUND" }> {
  const compra = await repository.getCompraCartao(compraId, userId);
  if (!compra) return { error: "COMPRA_NOT_FOUND" };
  const syncResult = await materializeParcelasCompraIfMissing(repository, compra);
  await recomputeCardPurchaseAggregate(repository, compra.id, userId);
  return syncResult;
}
