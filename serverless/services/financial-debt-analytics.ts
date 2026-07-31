import type { Divida, Parcela } from "../../shared/schema.js";
import { parseMoney } from "../../utils/money.js";

type MoneyValue = string | number | null | undefined;

export type DebtAnalyticsInput = {
  dividas: Divida[];
  parcelas: Parcela[];
};

export type DebtObligation = {
  dividaId: string;
  tipo: Divida["tipo"];
  source: "divida" | "parcela";
  numero: number | null;
  valor: MoneyValue;
  status: string;
  dataVencimento: string | null;
  dataPagamento: string | null;
  expectativaRecebimento: boolean;
};

export type DebtPortfolioSummary = {
  totalContratado: number;
  totalPendente: number;
  totalPago: number;
  pendentePorTipo: {
    receber: number;
    pagar: number;
  };
  obrigacoes: {
    total: number;
    pagas: number;
    pendentes: number;
  };
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function normalizeStatus(status: string): string {
  return String(status || "").trim().toLowerCase();
}

function isPaidStatus(status: string): boolean {
  return normalizeStatus(status) === "pago";
}

function isCanceledStatus(status: string): boolean {
  return normalizeStatus(status) === "cancelado";
}

function isOutstandingStatus(status: string): boolean {
  return !isPaidStatus(status) && !isCanceledStatus(status);
}

function byDividaId(parcelas: Parcela[]): Map<string, Parcela[]> {
  const map = new Map<string, Parcela[]>();
  for (const parcela of parcelas) {
    const rows = map.get(parcela.dividaId) ?? [];
    rows.push(parcela);
    map.set(parcela.dividaId, rows);
  }

  map.forEach((rows) => {
    rows.sort((a, b) => a.numero - b.numero);
  });

  return map;
}

/**
 * Conceitos financeiros usados na camada analitica:
 * - divida agregada: contrato no nivel da entidade pai (metadados e total contratado).
 * - parcela mensal: obrigacao real do cronograma (vencimento e valor efetivo por periodo).
 * - saldo pendente: soma das obrigacoes ainda nao pagas.
 * - total contratado: valor total originalmente pactuado da divida.
 */
export function getDebtObligations(input: DebtAnalyticsInput): DebtObligation[] {
  const parcelasMap = byDividaId(input.parcelas);
  const obligations: DebtObligation[] = [];

  for (const divida of input.dividas) {
    const linkedParcelas = parcelasMap.get(divida.id) ?? [];
    if (linkedParcelas.length > 0) {
      for (const parcela of linkedParcelas) {
        obligations.push({
          dividaId: divida.id,
          tipo: divida.tipo,
          source: "parcela",
          numero: parcela.numero,
          valor: parcela.valor,
          status: parcela.status,
          dataVencimento: parcela.dataVencimento ?? null,
          dataPagamento: parcela.dataPagamento ?? null,
          expectativaRecebimento: divida.expectativaRecebimento !== false,
        });
      }
      continue;
    }

    obligations.push({
      dividaId: divida.id,
      tipo: divida.tipo,
      source: "divida",
      numero: null,
      valor: divida.valor,
      status: divida.status,
      dataVencimento: divida.dataVencimento ?? null,
      dataPagamento: divida.dataPagamento ?? null,
      expectativaRecebimento: divida.expectativaRecebimento !== false,
    });
  }

  return obligations;
}

export function getOutstandingDebtInstallments(input: DebtAnalyticsInput): DebtObligation[] {
  return getDebtObligations(input).filter((row) => isOutstandingStatus(row.status));
}

export function getMonthlyDebtObligations(input: DebtAnalyticsInput, monthReference: string): DebtObligation[] {
  return getOutstandingDebtInstallments(input)
    .filter((row) => row.tipo !== "receber" || row.expectativaRecebimento)
    .filter((row) => String(row.dataVencimento || "").startsWith(monthReference));
}

export function getMonthlyReceivedDebtObligations(input: DebtAnalyticsInput, monthReference: string): DebtObligation[] {
  return getDebtObligations(input)
    .filter((row) => row.tipo === "receber" && isPaidStatus(row.status))
    .filter((row) => String(row.dataPagamento || "").startsWith(monthReference));
}

export function getDebtPortfolioSummary(input: DebtAnalyticsInput): DebtPortfolioSummary {
  const parcelasMap = byDividaId(input.parcelas);
  const obligations = getDebtObligations(input);

  let totalContratado = 0;
  let totalPendente = 0;
  let totalPago = 0;
  let pendenteReceber = 0;
  let pendentePagar = 0;

  for (const divida of input.dividas) {
    const linkedParcelas = parcelasMap.get(divida.id) ?? [];
    const hasParcelas = linkedParcelas.length > 0;

    if (hasParcelas) {
      const fallbackContratado = linkedParcelas.reduce((sum, parcela) => sum + toMoneyNumber(parcela.valor), 0);
      totalContratado += toMoneyNumber(divida.valorTotal ?? fallbackContratado);
      continue;
    }

    totalContratado += toMoneyNumber(divida.valorTotal ?? divida.valor);
  }

  for (const obligation of obligations) {
    const valor = toMoneyNumber(obligation.valor);
    if (isPaidStatus(obligation.status)) {
      totalPago += valor;
      continue;
    }

    if (isCanceledStatus(obligation.status)) {
      continue;
    }

    totalPendente += valor;
    if (obligation.tipo === "receber") pendenteReceber += valor;
    else pendentePagar += valor;
  }

  const obligationsPagas = obligations.filter((row) => isPaidStatus(row.status)).length;
  const obligationsPendentes = obligations.filter((row) => isOutstandingStatus(row.status)).length;

  return {
    totalContratado,
    totalPendente,
    totalPago,
    pendentePorTipo: {
      receber: pendenteReceber,
      pagar: pendentePagar,
    },
    obrigacoes: {
      // Mantemos o contrato atual, mas total considera apenas obrigacoes ativas
      // (pagas + em aberto), sem contabilizar linhas canceladas.
      total: obligationsPagas + obligationsPendentes,
      pagas: obligationsPagas,
      pendentes: obligationsPendentes,
    },
  };
}
