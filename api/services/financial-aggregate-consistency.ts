import { format } from "date-fns";
import type {
  CompraCartao,
  Divida,
  InsertCompraCartao,
  InsertDivida,
  Parcela,
  ParcelaCompra,
} from "@shared/schema";
import type { FinancialRepository } from "../repositories/financial.repository.js";
import { formatMoneyFixed, parseMoney } from "../../utils/money.js";

export const DOMAIN_STATUS = {
  pendente: "pendente",
  parcial: "parcial",
  pago: "pago",
  vencido: "vencido",
  cancelado: "cancelado",
} as const;

export type DomainStatus = (typeof DOMAIN_STATUS)[keyof typeof DOMAIN_STATUS];

export type DebtAggregateRecomputeResult = {
  dividaId: string;
  sourceOfTruth: "parent" | "parcelas";
  derivedStatus: DomainStatus;
  persistedStatus: "pendente" | "pago";
  updated: boolean;
};

export type CardPurchaseAggregateRecomputeResult = {
  compraCartaoId: string;
  sourceOfTruth: "parent" | "parcelas_compra";
  derivedCardStatus: DomainStatus;
  derivedPessoaStatus: DomainStatus | null;
  persistedPessoaStatus: string | null;
  updated: boolean;
};

function moneyToNumber(value: string | number | null | undefined): number {
  return parseMoney(value) ?? 0;
}

function sumMoney(values: Array<string | number | null | undefined>): string {
  const total = values.reduce<number>((sum, value) => sum + moneyToNumber(value), 0);
  return formatMoneyFixed(total) ?? "0.00";
}

function normalizeStatus(value: string | null | undefined): DomainStatus {
  switch (value) {
    case DOMAIN_STATUS.pago:
      return DOMAIN_STATUS.pago;
    case DOMAIN_STATUS.cancelado:
      return DOMAIN_STATUS.cancelado;
    case DOMAIN_STATUS.parcial:
      return DOMAIN_STATUS.parcial;
    case DOMAIN_STATUS.vencido:
      return DOMAIN_STATUS.vencido;
    default:
      return DOMAIN_STATUS.pendente;
  }
}

function isPaid(value: string | null | undefined): boolean {
  return normalizeStatus(value) === DOMAIN_STATUS.pago;
}

function isCanceled(value: string | null | undefined): boolean {
  return normalizeStatus(value) === DOMAIN_STATUS.cancelado;
}

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) return null;
  return [...filtered].sort().at(-1) ?? null;
}

function latestPaymentMethod(parcelas: Parcela[]): string | null {
  const paid = parcelas
    .filter((parcela) => isPaid(parcela.status))
    .sort((a, b) => {
      const byDate = String(a.dataPagamento || "").localeCompare(String(b.dataPagamento || ""));
      if (byDate !== 0) return byDate;
      return a.numero - b.numero;
    });

  const last = paid.at(-1);
  return last?.formaPagamento ?? null;
}

function deriveDebtStatus(parcelas: Parcela[], referenceDate: string): DomainStatus {
  if (parcelas.length === 0) return DOMAIN_STATUS.pendente;

  const paid = parcelas.filter((row) => isPaid(row.status));
  const canceled = parcelas.filter((row) => isCanceled(row.status));
  const activePending = parcelas.filter((row) => !isPaid(row.status) && !isCanceled(row.status));
  const hasOverduePending = activePending.some(
    (row) => row.dataVencimento != null && row.dataVencimento < referenceDate,
  );

  if (paid.length === parcelas.length) return DOMAIN_STATUS.pago;
  if (canceled.length === parcelas.length) return DOMAIN_STATUS.cancelado;
  if (paid.length > 0 && activePending.length > 0) return DOMAIN_STATUS.parcial;
  if (activePending.length > 0 && hasOverduePending) return DOMAIN_STATUS.vencido;
  return DOMAIN_STATUS.pendente;
}

function debtStatusToPersisted(value: DomainStatus): "pendente" | "pago" {
  return value === DOMAIN_STATUS.pago ? "pago" : "pendente";
}

function derivePessoaStatus(rows: ParcelaCompra[]): DomainStatus | null {
  const statuses = rows
    .map((row) => row.statusPessoa)
    .filter((status): status is string => status != null && status !== "")
    .map(normalizeStatus);

  if (statuses.length === 0) return null;
  if (statuses.every((status) => status === DOMAIN_STATUS.pago)) return DOMAIN_STATUS.pago;
  if (statuses.every((status) => status === DOMAIN_STATUS.cancelado)) return DOMAIN_STATUS.cancelado;
  if (statuses.some((status) => status === DOMAIN_STATUS.pago)) return DOMAIN_STATUS.parcial;
  if (statuses.some((status) => status === DOMAIN_STATUS.vencido)) return DOMAIN_STATUS.vencido;
  return DOMAIN_STATUS.pendente;
}

function pessoaStatusToPersisted(value: DomainStatus | null): string | null {
  if (value == null) return null;
  if (value === DOMAIN_STATUS.pago) return DOMAIN_STATUS.pago;
  if (value === DOMAIN_STATUS.cancelado) return DOMAIN_STATUS.cancelado;
  return DOMAIN_STATUS.pendente;
}

function hasPatchChanges<T extends Record<string, unknown>>(patch: T, current: Record<string, unknown>): boolean {
  return Object.entries(patch).some(([key, value]) => current[key] !== value);
}

/**
 * Fonte da verdade:
 * - divida com parcelas: pai derivado das parcelas (filho -> pai)
 * - divida sem parcelas: pai e fonte da verdade (pai -> visoes analiticas)
 */
export async function recomputeDebtAggregate(
  repository: FinancialRepository,
  dividaId: string,
  userId: string,
): Promise<DebtAggregateRecomputeResult> {
  const divida = await repository.getDivida(dividaId, userId);
  if (!divida) {
    return {
      dividaId,
      sourceOfTruth: "parent",
      derivedStatus: DOMAIN_STATUS.pendente,
      persistedStatus: DOMAIN_STATUS.pendente,
      updated: false,
    };
  }

  const parcelas = await repository.getParcelasByDivida(dividaId, userId);
  if (parcelas.length === 0) {
    const derivedStatus = normalizeStatus(divida.status);
    return {
      dividaId,
      sourceOfTruth: "parent",
      derivedStatus,
      persistedStatus: debtStatusToPersisted(derivedStatus),
      updated: false,
    };
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const sorted = [...parcelas].sort((a, b) => a.numero - b.numero);
  const pending = sorted.filter((row) => !isPaid(row.status) && !isCanceled(row.status));
  const nextPending = pending[0];
  const lastParcela = sorted.at(-1);
  const derivedStatus = deriveDebtStatus(sorted, today);
  const persistedStatus = debtStatusToPersisted(derivedStatus);

  const valorTotal = sumMoney(sorted.map((row) => row.valor));
  const valorReferencia = formatMoneyFixed(nextPending?.valor ?? sorted[0]?.valor ?? divida.valor) ?? "0.00";
  const dataVencimento = nextPending?.dataVencimento ?? lastParcela?.dataVencimento ?? divida.dataVencimento ?? null;
  const dataPagamento = persistedStatus === DOMAIN_STATUS.pago
    ? maxIsoDate(sorted.map((row) => row.dataPagamento))
    : null;
  const formaPagamento = persistedStatus === DOMAIN_STATUS.pago
    ? latestPaymentMethod(sorted)
    : null;

  const patch: Partial<InsertDivida> = {
    totalParcelas: sorted.length,
    valorTotal,
    valor: valorReferencia,
    dataVencimento,
    status: persistedStatus,
    dataPagamento,
    formaPagamento,
  };

  const updated = hasPatchChanges(patch as Record<string, unknown>, divida as unknown as Record<string, unknown>);
  if (updated) {
    await repository.updateDivida(dividaId, userId, patch);
  }

  return {
    dividaId,
    sourceOfTruth: "parcelas",
    derivedStatus,
    persistedStatus,
    updated,
  };
}

/**
 * Fonte da verdade:
 * - compra com parcelas_compra: pai derivado das parcelas de compra (filho -> pai)
 * - compra sem parcelas_compra: pai permanece fonte (cronograma deve vir de fluxo explicito de sync/backfill)
 */
export async function recomputeCardPurchaseAggregate(
  repository: FinancialRepository,
  compraCartaoId: string,
  userId: string,
): Promise<CardPurchaseAggregateRecomputeResult> {
  const compra = await repository.getCompraCartao(compraCartaoId, userId);
  if (!compra) {
    return {
      compraCartaoId,
      sourceOfTruth: "parent",
      derivedCardStatus: DOMAIN_STATUS.pendente,
      derivedPessoaStatus: null,
      persistedPessoaStatus: null,
      updated: false,
    };
  }

  const rows = await repository.getParcelasCompra(compraCartaoId, userId);
  if (rows.length === 0) {
    return {
      compraCartaoId,
      sourceOfTruth: "parent",
      derivedCardStatus: DOMAIN_STATUS.pendente,
      derivedPessoaStatus: normalizeStatus(compra.statusPessoa),
      persistedPessoaStatus: compra.statusPessoa ?? null,
      updated: false,
    };
  }

  const sorted = [...rows].sort((a, b) => a.numero - b.numero);
  const activePending = sorted.filter((row) => !isPaid(row.statusCartao) && !isCanceled(row.statusCartao));
  const derivedCardStatus = activePending.length === 0 ? DOMAIN_STATUS.pago : DOMAIN_STATUS.pendente;
  const derivedPessoaStatus = compra.pessoaId ? derivePessoaStatus(sorted) : null;
  const persistedPessoaStatus = compra.pessoaId ? pessoaStatusToPersisted(derivedPessoaStatus) : null;

  const parcelaAtual = activePending[0]?.numero ?? sorted.length;
  const patch: Partial<InsertCompraCartao> = {
    parcelas: sorted.length,
    parcelaAtual: Math.max(1, Math.min(parcelaAtual, Math.max(sorted.length, 1))),
    valorTotal: sumMoney(sorted.map((row) => row.valor)),
    valorParcela: formatMoneyFixed(activePending[0]?.valor ?? sorted[0]?.valor ?? compra.valorParcela) ?? "0.00",
    statusPessoa: persistedPessoaStatus,
    dataPagamentoPessoa: persistedPessoaStatus === DOMAIN_STATUS.pago
      ? maxIsoDate(sorted.map((row) => row.dataPagamentoPessoa))
      : null,
  };

  const updated = hasPatchChanges(patch as Record<string, unknown>, compra as unknown as Record<string, unknown>);
  if (updated) {
    await repository.updateCompraCartao(compraCartaoId, userId, patch);
  }

  return {
    compraCartaoId,
    sourceOfTruth: "parcelas_compra",
    derivedCardStatus,
    derivedPessoaStatus,
    persistedPessoaStatus,
    updated,
  };
}
