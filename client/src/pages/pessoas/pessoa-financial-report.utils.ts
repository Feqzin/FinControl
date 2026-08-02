import { addMonths, format, parseISO } from "date-fns";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Parcela,
  ParcelaCompra,
  Pessoa,
  Servico,
  ServicoPagamento,
  ServicoPessoa,
} from "@shared/schema";
import type { PessoaSaldoMovimentacao } from "@/services/api/pessoas";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import { calculateCardUsedLimit, groupParcelasCompraByCompraId } from "@/lib/card-limit-usage";
import { toMoneyNumber } from "@/lib/money";

export type PessoaFinancialReportOptions = {
  includePersonalDebts: boolean;
  includeSharedServices: boolean;
  includeCardDebts: boolean;
};

export type PessoaFinancialReportSource = {
  pessoa: Pessoa;
  dividas: Divida[];
  parcelas: Parcela[];
  comprasCartao: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  cartoes: Cartao[];
  cartoesResumo: Array<{
    cartaoId: string;
    limiteComprometido: number;
  }>;
  servicoPessoas: ServicoPessoa[];
  servicoPagamentos: ServicoPagamento[];
  servicos: Servico[];
  saldoMovimentacoes: PessoaSaldoMovimentacao[];
  monthReference?: string;
};

export type PessoaFinancialReportDebtItem = {
  id: string;
  description: string;
  total: number;
  paid: number;
  pending: number;
  installmentProgress: string;
  paidMonthReferences: string[];
  dueDate: string | null;
  status: "pago" | "pendente" | "vencido";
};

export type PessoaFinancialReportCardItem = {
  id: string;
  cardId: string;
  cardName: string;
  description: string;
  total: number;
  paid: number;
  pending: number;
  paidInstallments: number;
  totalInstallments: number;
  paidMonthReferences: string[];
  progressPercent: number;
};

export type PessoaFinancialReportServiceItem = {
  id: string;
  name: string;
  monthlyShare: number;
  totalPaid: number;
  currentMonthPaid: number;
  currentMonthPending: number;
  paidMonthReferences: string[];
  partialMonthReferences: string[];
};

export type PessoaFinancialReportCardUsage = {
  cardId: string;
  cardName: string;
  limit: number;
  totalUsed: number;
  totalUsagePercent: number;
  personPending: number;
  personLimitPercent: number;
  personShareOfUsedPercent: number;
};

export type PessoaFinancialReport = {
  person: {
    id: string;
    name: string;
    phone: string | null;
  };
  generatedAt: string;
  monthReference: string;
  options: PessoaFinancialReportOptions;
  summary: {
    totalPaidTracked: number;
    totalPending: number;
    installmentTotal: number;
    installmentPaid: number;
    installmentPending: number;
    installmentProgressPercent: number;
    currentServicesPending: number;
  };
  personalDebts: PessoaFinancialReportDebtItem[];
  cardDebts: PessoaFinancialReportCardItem[];
  sharedServices: PessoaFinancialReportServiceItem[];
  cardUsage: PessoaFinancialReportCardUsage[];
  overallCardUsage: {
    limit: number;
    totalUsed: number;
    totalUsagePercent: number;
    personPending: number;
    personLimitPercent: number;
    personShareOfUsedPercent: number;
  } | null;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isPaid(value: string | null | undefined): boolean {
  return normalizeStatus(value) === "pago";
}

function isCanceled(value: string | null | undefined): boolean {
  return normalizeStatus(value) === "cancelado";
}

function resolveDebtStatus(pending: number, overdue: boolean): PessoaFinancialReportDebtItem["status"] {
  if (pending <= 0) return "pago";
  return overdue ? "vencido" : "pendente";
}

function getMonthReference(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 7);
  return null;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

function safePercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return round2((value / total) * 100);
}

function getMovementTotal(
  rows: PessoaSaldoMovimentacao[],
  predicate: (row: PessoaSaldoMovimentacao) => boolean,
): number {
  return sum(rows.filter((row) => row.tipo === "debito" && predicate(row)).map((row) => toMoneyNumber(row.valor)));
}

function buildPersonalDebts(
  source: PessoaFinancialReportSource,
  referenceDate: Date,
): PessoaFinancialReportDebtItem[] {
  const todayIso = format(referenceDate, "yyyy-MM-dd");
  const parcelasByDivida = new Map<string, Parcela[]>();
  for (const parcela of source.parcelas) {
    const rows = parcelasByDivida.get(parcela.dividaId) ?? [];
    rows.push(parcela);
    parcelasByDivida.set(parcela.dividaId, rows);
  }

  return source.dividas
    .filter((divida) => (
      divida.pessoaId === source.pessoa.id
      && divida.tipo === "receber"
      && !divida.deletedAt
      && !isCanceled(divida.status)
    ))
    .map((divida) => {
      const parcelas = (parcelasByDivida.get(divida.id) ?? []).sort((a, b) => a.numero - b.numero);
      const declaredTotal = toMoneyNumber(divida.valorTotal);
      const movementPaid = getMovementTotal(source.saldoMovimentacoes, (row) => (
        row.dividaId === divida.id && normalizeStatus(row.origem) === "abatimento_divida"
      ));

      if (parcelas.length > 0) {
        const activeParcelas = parcelas.filter((parcela) => !isCanceled(parcela.status));
        const scheduledTotal = sum(activeParcelas.map((parcela) => toMoneyNumber(parcela.valor)));
        const total = declaredTotal > 0 ? declaredTotal : scheduledTotal;
        const paidByInstallments = sum(activeParcelas
          .filter((parcela) => isPaid(parcela.status))
          .map((parcela) => toMoneyNumber(parcela.valor)));
        const paid = Math.min(total, round2(paidByInstallments + movementPaid));
        const pending = round2(Math.max(0, total - paid));
        const paidParcelas = activeParcelas.filter((parcela) => isPaid(parcela.status));
        const overdue = activeParcelas.some((parcela) => (
          !isPaid(parcela.status) && parcela.dataVencimento < todayIso
        ));

        return {
          id: divida.id,
          description: divida.descricao || "Dívida pessoal",
          total,
          paid,
          pending,
          installmentProgress: `${paidParcelas.length}/${activeParcelas.length}`,
          paidMonthReferences: uniqueSorted(paidParcelas.map((parcela) => getMonthReference(parcela.dataVencimento))),
          dueDate: activeParcelas.find((parcela) => !isPaid(parcela.status))?.dataVencimento ?? divida.dataVencimento,
          status: resolveDebtStatus(pending, overdue),
        };
      }

      const currentValue = toMoneyNumber(divida.valor);
      const total = declaredTotal > 0
        ? declaredTotal
        : isPaid(divida.status) && movementPaid > 0 && !divida.formaPagamento
          ? Math.max(currentValue, movementPaid)
          : round2(currentValue + movementPaid);
      const pending = isPaid(divida.status) ? 0 : currentValue;
      const paid = round2(Math.max(0, total - pending));
      const overdue = pending > 0 && Boolean(divida.dataVencimento && divida.dataVencimento < todayIso);

      return {
        id: divida.id,
        description: divida.descricao || "Dívida pessoal",
        total,
        paid,
        pending,
        installmentProgress: isPaid(divida.status) ? "1/1" : "0/1",
        paidMonthReferences: isPaid(divida.status)
          ? uniqueSorted([getMonthReference(divida.dataPagamento ?? divida.dataVencimento)])
          : [],
        dueDate: divida.dataVencimento,
        status: resolveDebtStatus(pending, overdue),
      };
    })
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
}

function resolveLegacyInstallmentMonth(compra: CompraCartao, installmentNumber: number): string | null {
  try {
    return format(addMonths(parseISO(compra.dataCompra), installmentNumber - 1), "yyyy-MM");
  } catch {
    return null;
  }
}

function buildCardDebts(source: PessoaFinancialReportSource): PessoaFinancialReportCardItem[] {
  const parcelasByCompra = groupParcelasCompraByCompraId(source.parcelasCompra);
  const cardsById = new Map(source.cartoes.map((cartao) => [cartao.id, cartao] as const));

  return source.comprasCartao
    .filter((compra) => compra.pessoaId === source.pessoa.id && !isCanceled(compra.statusPessoa))
    .map((compra) => {
      const breakdown = buildCompraReembolsoBreakdown(compra);
      const parcelas = (parcelasByCompra.get(compra.id) ?? []).sort((a, b) => a.numero - b.numero);
      let paid = 0;
      let activeTotal = 0;
      let paidInstallments = 0;
      const paidMonths: string[] = [];

      if (parcelas.length > 0) {
        for (const parcela of parcelas) {
          if (isCanceled(parcela.statusPessoa)) continue;
          const installmentValue = breakdown.reembolsoPorParcela[parcela.numero - 1] ?? 0;
          activeTotal += installmentValue;
          const movementPaid = getMovementTotal(source.saldoMovimentacoes, (row) => (
            row.parcelaCompraId === parcela.id
            && normalizeStatus(row.origem) === "abatimento_parcela_cartao"
          ));
          const paidValue = isPaid(parcela.statusPessoa)
            ? installmentValue
            : Math.min(installmentValue, movementPaid);
          const pendingValue = round2(Math.max(0, installmentValue - paidValue));
          paid += paidValue;
          if (pendingValue <= 0 && installmentValue > 0) {
            paidInstallments += 1;
            const month = getMonthReference(parcela.dataVencimento);
            if (month) paidMonths.push(month);
          }
        }
      } else {
        activeTotal = breakdown.reembolsoPessoa;
        for (let numero = 1; numero <= breakdown.totalParcelas; numero += 1) {
          const installmentValue = breakdown.reembolsoPorParcela[numero - 1] ?? 0;
          const installmentPaid = isPaid(compra.statusPessoa) || numero < breakdown.parcelaAtual;
          if (installmentPaid) {
            paid += installmentValue;
            paidInstallments += 1;
            const month = resolveLegacyInstallmentMonth(compra, numero);
            if (month) paidMonths.push(month);
          }
        }
      }

      const total = round2(activeTotal);
      const normalizedPaid = round2(Math.min(total, paid));
      const normalizedPending = round2(Math.max(0, total - normalizedPaid));

      return {
        id: compra.id,
        cardId: compra.cartaoId,
        cardName: cardsById.get(compra.cartaoId)?.nome ?? "Cartão não encontrado",
        description: compra.descricao,
        total,
        paid: normalizedPaid,
        pending: normalizedPending,
        paidInstallments,
        totalInstallments: breakdown.totalParcelas,
        paidMonthReferences: uniqueSorted(paidMonths),
        progressPercent: safePercent(normalizedPaid, total),
      };
    })
    .sort((a, b) => a.cardName.localeCompare(b.cardName) || a.description.localeCompare(b.description));
}

function buildSharedServices(
  source: PessoaFinancialReportSource,
  monthReference: string,
): PessoaFinancialReportServiceItem[] {
  const servicesById = new Map(source.servicos.map((servico) => [servico.id, servico] as const));

  return source.servicoPessoas
    .filter((link) => link.pessoaId === source.pessoa.id)
    .map((link) => {
      const service = servicesById.get(link.servicoId);
      const monthlyShare = toMoneyNumber(link.valorDevido);
      const payments = source.servicoPagamentos.filter((payment) => payment.servicoPessoaId === link.id);
      const movementMonths = source.saldoMovimentacoes
        .filter((row) => (
          row.tipo === "debito"
          && row.servicoPessoaId === link.id
          && normalizeStatus(row.origem) === "abatimento_servico"
          && String(row.categoria ?? "").startsWith("servico_mes:")
        ))
        .map((row) => String(row.categoria).slice("servico_mes:".length));
      const monthReferences = uniqueSorted([
        ...payments.map((payment) => payment.mes),
        ...movementMonths,
      ]);
      const paidMonths: string[] = [];
      const partialMonths: string[] = [];
      let totalPaid = 0;
      let currentMonthPaid = 0;

      for (const month of monthReferences) {
        const payment = payments.find((item) => item.mes === month && isPaid(item.status));
        const movementPaid = getMovementTotal(source.saldoMovimentacoes, (row) => (
          row.servicoPessoaId === link.id
          && normalizeStatus(row.origem) === "abatimento_servico"
          && normalizeStatus(row.categoria) === `servico_mes:${month}`
        ));
        const paidValue = payment ? monthlyShare : Math.min(monthlyShare, movementPaid);
        totalPaid += paidValue;
        if (paidValue >= monthlyShare && monthlyShare > 0) paidMonths.push(month);
        else if (paidValue > 0) partialMonths.push(month);
        if (month === monthReference) currentMonthPaid = paidValue;
      }

      return {
        id: link.id,
        name: service?.nome ?? "Serviço não encontrado",
        monthlyShare,
        totalPaid: round2(totalPaid),
        currentMonthPaid: round2(currentMonthPaid),
        currentMonthPending: round2(Math.max(0, monthlyShare - currentMonthPaid)),
        paidMonthReferences: uniqueSorted(paidMonths),
        partialMonthReferences: uniqueSorted(partialMonths),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildCardUsage(
  source: PessoaFinancialReportSource,
  cardDebts: PessoaFinancialReportCardItem[],
): PessoaFinancialReportCardUsage[] {
  const involvedCardIds = new Set(cardDebts.map((item) => item.cardId));
  const resumoByCardId = new Map(source.cartoesResumo.map((item) => [item.cartaoId, item] as const));
  const parcelasByCompra = groupParcelasCompraByCompraId(source.parcelasCompra);

  return source.cartoes
    .filter((cartao) => involvedCardIds.has(cartao.id))
    .map((cartao) => {
      const limit = toMoneyNumber(cartao.limite);
      const backendUsed = resumoByCardId.get(cartao.id)?.limiteComprometido;
      const totalUsed = typeof backendUsed === "number" && Number.isFinite(backendUsed)
        ? backendUsed
        : calculateCardUsedLimit(cartao.id, source.comprasCartao, parcelasByCompra);
      const personPending = sum(cardDebts
        .filter((item) => item.cardId === cartao.id)
        .map((item) => item.pending));

      return {
        cardId: cartao.id,
        cardName: cartao.nome,
        limit,
        totalUsed: round2(totalUsed),
        totalUsagePercent: safePercent(totalUsed, limit),
        personPending,
        personLimitPercent: safePercent(personPending, limit),
        personShareOfUsedPercent: safePercent(personPending, totalUsed),
      };
    })
    .sort((a, b) => b.personPending - a.personPending || a.cardName.localeCompare(b.cardName));
}

export function buildPessoaFinancialReport(
  source: PessoaFinancialReportSource,
  options: PessoaFinancialReportOptions,
  now = new Date(),
): PessoaFinancialReport {
  const monthReference = source.monthReference ?? format(now, "yyyy-MM");
  const personalDebts = options.includePersonalDebts ? buildPersonalDebts(source, now) : [];
  const cardDebts = options.includeCardDebts ? buildCardDebts(source) : [];
  const sharedServices = options.includeSharedServices ? buildSharedServices(source, monthReference) : [];
  const cardUsage = options.includeCardDebts ? buildCardUsage(source, cardDebts) : [];

  const personalTotal = sum(personalDebts.map((item) => item.total));
  const personalPaid = sum(personalDebts.map((item) => item.paid));
  const personalPending = sum(personalDebts.map((item) => item.pending));
  const cardsTotal = sum(cardDebts.map((item) => item.total));
  const cardsPaid = sum(cardDebts.map((item) => item.paid));
  const cardsPending = sum(cardDebts.map((item) => item.pending));
  const servicesPaid = sum(sharedServices.map((item) => item.totalPaid));
  const servicesPending = sum(sharedServices.map((item) => item.currentMonthPending));
  const installmentTotal = round2(personalTotal + cardsTotal);
  const installmentPaid = round2(personalPaid + cardsPaid);
  const installmentPending = round2(personalPending + cardsPending);

  const overallCardUsage = cardUsage.length > 0
    ? (() => {
      const limit = sum(cardUsage.map((item) => item.limit));
      const totalUsed = sum(cardUsage.map((item) => item.totalUsed));
      const personPending = sum(cardUsage.map((item) => item.personPending));
      return {
        limit,
        totalUsed,
        totalUsagePercent: safePercent(totalUsed, limit),
        personPending,
        personLimitPercent: safePercent(personPending, limit),
        personShareOfUsedPercent: safePercent(personPending, totalUsed),
      };
    })()
    : null;

  return {
    person: {
      id: source.pessoa.id,
      name: source.pessoa.nome,
      phone: source.pessoa.telefone,
    },
    generatedAt: now.toISOString(),
    monthReference,
    options,
    summary: {
      totalPaidTracked: round2(personalPaid + cardsPaid + servicesPaid),
      totalPending: round2(personalPending + cardsPending + servicesPending),
      installmentTotal,
      installmentPaid,
      installmentPending,
      installmentProgressPercent: safePercent(installmentPaid, installmentTotal),
      currentServicesPending: servicesPending,
    },
    personalDebts,
    cardDebts,
    sharedServices,
    cardUsage,
    overallCardUsage,
  };
}
