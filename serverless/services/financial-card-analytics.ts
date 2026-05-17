import { addMonths, format, parseISO } from "date-fns";
import type { Cartao, CompraCartao, ParcelaCompra, PessoaSaldoMovimentacao } from "../../shared/schema.js";
import { parseMoney } from "../../utils/money.js";

type MoneyValue = string | number | null | undefined;

export type CardAnalyticsInput = {
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  saldoMovimentacoes?: PessoaSaldoMovimentacao[];
};

export type CardInstallmentObligation = {
  compraId: string;
  parcelaCompraId: string | null;
  cartaoId: string;
  source: "compra" | "parcela_compra";
  numero: number;
  valor: MoneyValue;
  statusCartao: string;
  dataVencimento: string | null;
  dataPagamentoCartao: string | null;
};

export type CardPortfolioSummary = {
  totalContratado: number;
  totalPendente: number;
  totalPago: number;
  parcelas: {
    total: number;
    pagas: number;
    pendentes: number;
  };
  compras: {
    total: number;
    avista: number;
    parceladas: number;
  };
};

export type CardConsolidatedSummary = {
  cartaoId: string;
  faturaAtual: number;
  limiteComprometido: number;
  limiteDisponivel: number;
  saldoRestanteTotal: number;
  quantidadeParcelasPendentes: number;
};

export type CardConsolidatedSummaryInput = CardAnalyticsInput & {
  cartoes: Pick<Cartao, "id" | "limite">[];
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function safeMonthDate(baseDate: string | null | undefined, offset: number): string | null {
  if (!baseDate) return null;
  try {
    return format(addMonths(parseISO(baseDate), offset), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

function normalizeInstallmentCount(value: number | null | undefined): number {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeCurrentInstallment(
  parcelaAtual: number | null | undefined,
  totalParcelas: number,
): number {
  // Semantica unica: parcelaAtual = primeira parcela em aberto (1..N).
  const parsed = Number(parcelaAtual ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(totalParcelas, Math.max(1, Math.trunc(parsed)));
}

function byCompraId(parcelasCompra: ParcelaCompra[]): Map<string, ParcelaCompra[]> {
  const grouped = new Map<string, ParcelaCompra[]>();
  for (const parcela of parcelasCompra) {
    const rows = grouped.get(parcela.compraCartaoId) ?? [];
    rows.push(parcela);
    grouped.set(parcela.compraCartaoId, rows);
  }
  grouped.forEach((rows) => rows.sort((a, b) => a.numero - b.numero));
  return grouped;
}

function buildParcelaSaldoAbatidoMap(rows: PessoaSaldoMovimentacao[] | undefined): Map<string, number> {
  const grouped = new Map<string, number>();
  if (!rows || rows.length === 0) return grouped;

  for (const row of rows) {
    // Fonte auditavel de abatimento parcial em parcela de cartao via saldo da pessoa.
    if (row.tipo !== "debito") continue;
    if (String(row.origem ?? "").trim().toLowerCase() !== "abatimento_parcela_cartao") continue;
    if (!row.parcelaCompraId) continue;
    const current = grouped.get(row.parcelaCompraId) ?? 0;
    grouped.set(row.parcelaCompraId, round2(current + toMoneyNumber(row.valor)));
  }

  return grouped;
}

function getOutstandingAmount(
  obligation: CardInstallmentObligation,
  _parcelaSaldoAbatidoMap: Map<string, number>,
): number {
  if (!isOutstandingStatus(obligation.statusCartao)) return 0;

  const valorOriginal = toMoneyNumber(obligation.valor);
  return round2(Math.max(0, valorOriginal));
}

function buildFallbackInstallments(compra: CompraCartao): CardInstallmentObligation[] {
  const totalParcelas = normalizeInstallmentCount(compra.parcelas);
  const parcelaAtual = normalizeCurrentInstallment(compra.parcelaAtual, totalParcelas);

  return Array.from({ length: totalParcelas }, (_, index) => {
    const numero = index + 1;
    // Retrocompatibilidade para compras legadas sem parcelas_compra:
    // 1..(parcelaAtual-1) pago, parcelaAtual..N pendente.
    const isPaid = numero < parcelaAtual;
    return {
      compraId: compra.id,
      parcelaCompraId: null,
      cartaoId: compra.cartaoId,
      source: "compra" as const,
      numero,
      valor: compra.valorParcela,
      statusCartao: isPaid ? "pago" : "pendente",
      dataVencimento: safeMonthDate(compra.dataCompra, index),
      dataPagamentoCartao: null,
    };
  });
}

/**
 * Conceitos usados na camada analitica de cartao:
 * - valor total da compra: contratado no nivel da compra pai (compras_cartao.valorTotal).
 * - parcela mensal: obrigacao real por competencia (parcelas_compra).
 * - parcelas pagas/futuras: derivadas do status e data de vencimento de parcelas_compra.
 * - saldo restante: soma das parcelas em aberto (nao pagas e nao canceladas).
 *
 * Compatibilidade:
 * - quando nao ha parcelas_compra para uma compra legada, o fallback usa compras_cartao
 *   para estimar parcelas por mes, preservando comportamento historico.
 */
export function getCardObligations(input: CardAnalyticsInput): CardInstallmentObligation[] {
  const grouped = byCompraId(input.parcelasCompra);
  const obligations: CardInstallmentObligation[] = [];

  for (const compra of input.compras) {
    const rows = grouped.get(compra.id) ?? [];
    if (rows.length > 0) {
      for (const row of rows) {
        obligations.push({
          compraId: compra.id,
          parcelaCompraId: row.id,
          cartaoId: compra.cartaoId,
          source: "parcela_compra",
          numero: row.numero,
          valor: row.valor,
          statusCartao: row.statusCartao,
          dataVencimento: row.dataVencimento ?? safeMonthDate(compra.dataCompra, row.numero - 1),
          dataPagamentoCartao: row.dataPagamentoCartao ?? null,
        });
      }
      continue;
    }

    obligations.push(...buildFallbackInstallments(compra));
  }

  return obligations;
}

export function getOutstandingCardInstallments(input: CardAnalyticsInput): CardInstallmentObligation[] {
  const obligations = getCardObligations(input);
  const parcelaSaldoAbatidoMap = buildParcelaSaldoAbatidoMap(input.saldoMovimentacoes);
  return obligations
    .filter((row) => getOutstandingAmount(row, parcelaSaldoAbatidoMap) > 0)
    .map((row) => ({ ...row, valor: getOutstandingAmount(row, parcelaSaldoAbatidoMap) }));
}

export function getMonthlyCardObligations(input: CardAnalyticsInput, monthReference: string): CardInstallmentObligation[] {
  const parcelaSaldoAbatidoMap = buildParcelaSaldoAbatidoMap(input.saldoMovimentacoes);
  return getCardObligations(input)
    .filter((row) => String(row.dataVencimento || "").startsWith(monthReference))
    .filter((row) => getOutstandingAmount(row, parcelaSaldoAbatidoMap) > 0)
    .map((row) => ({ ...row, valor: getOutstandingAmount(row, parcelaSaldoAbatidoMap) }));
}

export function getCardPortfolioSummary(input: CardAnalyticsInput): CardPortfolioSummary {
  const obligations = getCardObligations(input);
  const parcelaSaldoAbatidoMap = buildParcelaSaldoAbatidoMap(input.saldoMovimentacoes);
  const totalContratado = input.compras
    .reduce((sum, compra) => sum + toMoneyNumber(compra.valorTotal), 0);

  let totalPago = 0;
  let totalPendente = 0;
  for (const obligation of obligations) {
    if (isCanceledStatus(obligation.statusCartao)) {
      continue;
    }

    const value = toMoneyNumber(obligation.valor);
    const outstanding = getOutstandingAmount(obligation, parcelaSaldoAbatidoMap);
    const paid = round2(Math.max(0, value - outstanding));

    totalPago += paid;
    totalPendente += outstanding;
  }

  const pagas = obligations.filter((row) => isPaidStatus(row.statusCartao)).length;
  const pendentes = obligations.filter((row) => getOutstandingAmount(row, parcelaSaldoAbatidoMap) > 0).length;
  const comprasParceladas = input.compras.filter((compra) => normalizeInstallmentCount(compra.parcelas) > 1).length;

  return {
    totalContratado,
    totalPendente,
    totalPago,
    parcelas: {
      total: pagas + pendentes,
      pagas,
      pendentes,
    },
    compras: {
      total: input.compras.length,
      avista: input.compras.length - comprasParceladas,
      parceladas: comprasParceladas,
    },
  };
}

/**
 * Resumo consolidado por cartao para consumo direto do frontend.
 *
 * Definicoes:
 * - faturaAtual: soma das parcelas em aberto cuja competencia (dataVencimento)
 *   pertence ao mes atual.
 * - limiteComprometido/saldoRestanteTotal: soma de todas as parcelas em aberto
 *   (nao pagas e nao canceladas).
 * - quantidadeParcelasPendentes: total de parcelas em aberto do cartao.
 */
export function getCardConsolidatedSummaries(input: CardConsolidatedSummaryInput): CardConsolidatedSummary[] {
  const obligations = getCardObligations(input);
  const parcelaSaldoAbatidoMap = buildParcelaSaldoAbatidoMap(input.saldoMovimentacoes);
  const currentMonthReference = format(new Date(), "yyyy-MM");
  const byCard = new Map<string, CardInstallmentObligation[]>();

  for (const obligation of obligations) {
    const rows = byCard.get(obligation.cartaoId) ?? [];
    rows.push(obligation);
    byCard.set(obligation.cartaoId, rows);
  }

  return input.cartoes.map((cartao) => {
    const rows = byCard.get(cartao.id) ?? [];
    const pendingRows = rows.filter((row) => getOutstandingAmount(row, parcelaSaldoAbatidoMap) > 0);
    const faturaAtual = pendingRows
      .filter((row) => String(row.dataVencimento || "").startsWith(currentMonthReference))
      .reduce((sum, row) => sum + getOutstandingAmount(row, parcelaSaldoAbatidoMap), 0);
    const limiteComprometido = pendingRows
      .reduce((sum, row) => sum + getOutstandingAmount(row, parcelaSaldoAbatidoMap), 0);
    const saldoRestanteTotal = limiteComprometido;
    const limiteDisponivel = toMoneyNumber(cartao.limite) - limiteComprometido;

    return {
      cartaoId: cartao.id,
      faturaAtual: round2(faturaAtual),
      limiteComprometido: round2(limiteComprometido),
      limiteDisponivel: round2(limiteDisponivel),
      saldoRestanteTotal: round2(saldoRestanteTotal),
      quantidadeParcelasPendentes: pendingRows.length,
    };
  });
}
