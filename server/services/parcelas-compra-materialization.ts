import { addMonths, differenceInCalendarDays, format } from "date-fns";
import type { Cartao, CompraCartao, InsertParcelaCompra } from "@shared/schema";
import type { FinancialRepository } from "../repositories/financial.repository";
import { formatMoneyFixed, parseMoney } from "../../utils/money";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency";

type CompraScheduleSource = Pick<
  CompraCartao,
  | "id"
  | "userId"
  | "cartaoId"
  | "parcelas"
  | "parcelaAtual"
  | "valorParcela"
  | "dataCompra"
  | "pessoaId"
  | "statusPessoa"
  | "dataPagamentoPessoa"
> & {
  vencimentoFatura?: string | null;
};

type CardCycleSource = Pick<Cartao, "diaVencimento" | "melhorDiaCompra"> | null;

export type ParcelasCompraSyncResult = {
  compraCartaoId: string;
  expectedCount: number;
  existingCount: number;
  createdCount: number;
  materialized: boolean;
};

function isRowProtectedForDeletion(
  row: {
    id: string;
    statusCartao: string;
    statusPessoa: string | null;
    dataPagamentoCartao: string | null;
    dataPagamentoPessoa: string | null;
  },
  movimentacoesByParcelaId: Set<string>,
): boolean {
  if (movimentacoesByParcelaId.has(row.id)) return true;
  if (row.statusCartao === "pago") return true;
  if (row.statusPessoa === "pago") return true;
  if (row.dataPagamentoCartao) return true;
  if (row.dataPagamentoPessoa) return true;
  return false;
}

function normalizeParcelas(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeParcelaAtual(value: number, total: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.trunc(value), total));
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeDay(value: number | null | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(31, Math.trunc(parsed)));
}

function hasValidCardCycle(cardCycle: CardCycleSource): cardCycle is Pick<Cartao, "diaVencimento" | "melhorDiaCompra"> {
  if (!cardCycle) return false;
  const due = Number(cardCycle.diaVencimento);
  const best = Number(cardCycle.melhorDiaCompra);
  return Number.isFinite(due) && Number.isFinite(best);
}

function buildDateWithDay(year: number, monthIndex: number, day: number): Date {
  const maxDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  const clampedDay = Math.max(1, Math.min(maxDayOfMonth, day));
  return new Date(year, monthIndex, clampedDay, 12, 0, 0, 0);
}

function resolveMinimumLeadDays(cardCycle: CardCycleSource): number {
  if (!hasValidCardCycle(cardCycle)) return 0;
  const dueDay = normalizeDay(cardCycle.diaVencimento, 1);
  const bestPurchaseDay = normalizeDay(cardCycle.melhorDiaCompra, dueDay);
  const cycleGap = (dueDay - bestPurchaseDay + 31) % 31;
  return Math.max(1, cycleGap === 0 ? 1 : cycleGap);
}

function resolveFirstInstallmentDueDate(
  compra: CompraScheduleSource,
  cardCycle: CardCycleSource,
): Date {
  const total = normalizeParcelas(Number(compra.parcelas));
  const atual = normalizeParcelaAtual(Number(compra.parcelaAtual), total);
  const purchaseDate = parseIsoDate(compra.dataCompra) ?? new Date();
  const invoiceDueDate = parseIsoDate(compra.vencimentoFatura ?? null);

  if (invoiceDueDate) {
    return addMonths(invoiceDueDate, -(atual - 1));
  }

  if (!hasValidCardCycle(cardCycle)) {
    return purchaseDate;
  }

  const dueDay = normalizeDay(cardCycle.diaVencimento, purchaseDate.getDate());
  let candidate = buildDateWithDay(purchaseDate.getFullYear(), purchaseDate.getMonth(), dueDay);
  if (differenceInCalendarDays(candidate, purchaseDate) < 0) {
    candidate = addMonths(candidate, 1);
  }

  const minimumLeadDays = resolveMinimumLeadDays(cardCycle);
  if (differenceInCalendarDays(candidate, purchaseDate) < minimumLeadDays) {
    candidate = addMonths(candidate, 1);
  }

  return candidate;
}

/**
 * Materializa o cronograma de parcelas de uma compra parcelada.
 * Regras mantidas para retrocompatibilidade com o comportamento anterior do sistema.
 */
export function buildParcelasCompraRows(
  compra: CompraScheduleSource,
  options?: { cardCycle?: CardCycleSource },
): InsertParcelaCompra[] {
  const total = normalizeParcelas(Number(compra.parcelas));
  const atual = normalizeParcelaAtual(Number(compra.parcelaAtual), total);
  const valorParcela = parseMoney(compra.valorParcela) ?? 0;
  const firstDueDate = resolveFirstInstallmentDueDate(compra, options?.cardCycle ?? null);

  return Array.from({ length: total }, (_, index) => {
    const numero = index + 1;
    const isPaid = numero < atual;

    return {
      userId: compra.userId,
      compraCartaoId: compra.id,
      numero,
      valor: formatMoneyFixed(valorParcela) ?? "0.00",
      dataVencimento: format(addMonths(firstDueDate, index), "yyyy-MM-dd"),
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

  const cardCycle = await repository.getCartao(compra.cartaoId, compra.userId);
  const rows = buildParcelasCompraRows(compra, { cardCycle });
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

/**
 * Sincroniza parcelas materializadas após edição de compra.
 * Mantém IDs existentes sempre que possível para preservar trilha auditável.
 */
export async function syncMaterializedParcelasAfterCompraUpdate(
  repository: FinancialRepository,
  compra: CompraScheduleSource,
): Promise<void> {
  const existing = await repository.getParcelasCompra(compra.id, compra.userId);
  if (existing.length === 0) {
    await materializeParcelasCompraIfMissing(repository, compra);
    return;
  }

  const cardCycle = await repository.getCartao(compra.cartaoId, compra.userId);
  const expectedRows = buildParcelasCompraRows(compra, { cardCycle });
  const expectedCount = expectedRows.length;
  const existingByNumber = new Map(existing.map((row) => [row.numero, row]));

  const upperBound = Math.min(existing.length, expectedCount);
  for (let numero = 1; numero <= upperBound; numero += 1) {
    const current = existingByNumber.get(numero);
    const expected = expectedRows[numero - 1];
    if (!current || !expected) continue;

    await repository.updateParcelaCompra(current.id, compra.userId, {
      valor: expected.valor,
      dataVencimento: expected.dataVencimento,
    });
  }

  if (expectedCount > existing.length) {
    const toCreate = expectedRows.slice(existing.length).map((row) => ({
      ...row,
      statusCartao: row.statusCartao ?? "pendente",
    }));
    if (toCreate.length > 0) {
      await repository.createParcelasCompraBulk(toCreate);
    }
  }

  if (expectedCount < existing.length) {
    const extras = existing.filter((row) => row.numero > expectedCount);
    if (extras.length > 0) {
      // Runtime local (`server/`) may not expose saldo movimentacoes in its repository.
      // In that case, keep conservative deletion rules based only on parcela states.
      const repoWithSaldo = repository as FinancialRepository & {
        getPessoaSaldoMovimentacoes?: (
          userId: string,
        ) => Promise<Array<{ parcelaCompraId: string | null }>>;
      };
      const movimentacoes = repoWithSaldo.getPessoaSaldoMovimentacoes
        ? await repoWithSaldo.getPessoaSaldoMovimentacoes(compra.userId)
        : [];
      const movimentacoesByParcelaId = new Set<string>(
        movimentacoes
          .map((mov: { parcelaCompraId: string | null }) => mov.parcelaCompraId)
          .filter((value: string | null): value is string => Boolean(value)),
      );

      const removable = extras.filter((row) => !isRowProtectedForDeletion(row, movimentacoesByParcelaId));
      if (removable.length === extras.length) {
        for (const row of removable) {
          await repository.deleteParcelaCompra(row.id, compra.userId);
        }
      }
    }
  }
}
