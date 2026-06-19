import { addMonths, format, parseISO } from "date-fns";
import type {
  Cartao,
  CartaoFaturaPagamento,
  CompraCartao,
  Divida,
  Meta,
  Parcela,
  ParcelaCompra,
  Pessoa,
  Renda,
  Servico,
} from "@shared/schema";
import { buildCardInvoiceSnapshots } from "@shared/card-invoice-payments";
import { resolveDueDateFromCompetencia } from "@shared/parcelas-compra-competency";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import {
  calculateServicoEquivalentMonthlyAmount,
  calculateServicoRealMonthlyExpenseAmount,
  isServicoLinkedToCardCharge,
} from "@shared/servico-periodicidade";
import { toMoneyNumber } from "@/lib/money";
import {
  buildInvoiceTrackingInstallmentsForCard,
  groupParcelasCompraByCompraId,
  isParcelaComprometendoLimite,
} from "@/lib/card-limit-usage";

export type FinancialCalendarEventGroup =
  | "cartao"
  | "servico"
  | "divida"
  | "renda"
  | "meta";

export type FinancialCalendarEventDirection = "entrada" | "saida" | "info";

export type FinancialCalendarEventSource =
  | "fatura_cartao"
  | "parcela_compra"
  | "servico"
  | "divida_receber"
  | "divida_pagar"
  | "renda_prevista"
  | "meta_prazo";

export type FinancialCalendarEvent = {
  id: string;
  date: string;
  monthReference: string;
  group: FinancialCalendarEventGroup;
  direction: FinancialCalendarEventDirection;
  source: FinancialCalendarEventSource;
  title: string;
  subtitle?: string;
  amount?: number;
  statusLabel?: string;
  secondaryStatusLabel?: string;
  entityId?: string;
};

export type BuildFinancialCalendarEventsInput = {
  monthReference: string;
  cartoes: Cartao[];
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  cartaoFaturaPagamentos?: CartaoFaturaPagamento[];
  dividas: Divida[];
  parcelas: Parcela[];
  pessoas: Pessoa[];
  servicos: Servico[];
  rendas: Renda[];
  metas?: Meta[];
  referenceDate?: string;
};

type InstallmentStatus = "pendente" | "pago" | "vencido" | "cancelado";

const EVENT_SOURCE_ORDER: Record<FinancialCalendarEventSource, number> = {
  renda_prevista: 1,
  divida_receber: 2,
  meta_prazo: 3,
  servico: 4,
  divida_pagar: 5,
  fatura_cartao: 6,
  parcela_compra: 7,
};

function normalizeStatus(value: string | null | undefined): InstallmentStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pago") return "pago";
  if (normalized === "vencido") return "vencido";
  if (normalized === "cancelado") return "cancelado";
  return "pendente";
}

function isOpenStatus(value: string | null | undefined): boolean {
  const normalized = normalizeStatus(value);
  return normalized !== "pago" && normalized !== "cancelado";
}

function isMonthReference(value: string | null | undefined, monthReference: string): boolean {
  return typeof value === "string" && value.startsWith(monthReference);
}

function clampDayDate(monthReference: string, day: number | null | undefined, fallbackDay = 1): string | null {
  const numericDay = Number(day);
  const dueDay = Number.isFinite(numericDay) && numericDay >= 1 ? Math.trunc(numericDay) : fallbackDay;
  return resolveDueDateFromCompetencia({
    competencia: monthReference,
    diaVencimento: dueDay,
  });
}

function formatInstallmentCount(value: number | null | undefined): number {
  const numeric = Number(value ?? 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.trunc(numeric));
}

function formatCurrentInstallment(value: number | null | undefined, totalInstallments: number): number {
  const numeric = Number(value ?? 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(totalInstallments, Math.max(1, Math.trunc(numeric)));
}

function safeLegacyInstallmentMonth(dataCompra: string | null | undefined, installmentNumber: number): string | null {
  if (!dataCompra) return null;
  try {
    return format(addMonths(parseISO(dataCompra), installmentNumber - 1), "yyyy-MM");
  } catch {
    return null;
  }
}

function buildPessoasMap(pessoas: Pessoa[]): Map<string, Pessoa> {
  return new Map(pessoas.map((pessoa) => [pessoa.id, pessoa]));
}

function buildParcelasMap(parcelas: Parcela[]): Map<string, Parcela[]> {
  const grouped = new Map<string, Parcela[]>();
  for (const parcela of parcelas) {
    const rows = grouped.get(parcela.dividaId) ?? [];
    rows.push(parcela);
    grouped.set(parcela.dividaId, rows);
  }

  grouped.forEach((rows) => {
    rows.sort((left, right) => left.numero - right.numero);
  });

  return grouped;
}

function buildCartoesMap(cartoes: Cartao[]): Map<string, Cartao> {
  return new Map(cartoes.map((cartao) => [cartao.id, cartao]));
}

function formatCardInstallmentStatusLabel(
  statusCartao: string | null | undefined,
  date: string | null | undefined,
  referenceDate: string,
): string {
  const normalized = normalizeStatus(statusCartao);
  if (normalized === "pago") return "Cartão pago";
  if (normalized === "cancelado") return "Cancelado";
  if (normalized === "vencido" || (date && date < referenceDate)) return "Cartão vencido";
  return "Cartão pendente";
}

function formatReembolsoStatusLabel(
  compra: CompraCartao,
  installmentNumber: number,
  statusPessoa: string | null | undefined,
  date: string | null | undefined,
  referenceDate: string,
): string | undefined {
  const breakdown = buildCompraReembolsoBreakdown(compra);
  if (!compra.pessoaId || breakdown.reembolsoPessoaCents <= 0) return undefined;

  const parcelaIndex = Math.max(0, installmentNumber - 1);
  if ((breakdown.reembolsoPorParcelaCents[parcelaIndex] ?? 0) <= 0) {
    return "Sem reembolso vinculado";
  }

  const normalized = normalizeStatus(statusPessoa);
  if (normalized === "pago") return "Reembolsado";
  if (normalized === "cancelado") return "Reembolso cancelado";
  if (normalized === "vencido" || (date && date < referenceDate)) return "Reembolso vencido";
  return "Ag. reembolso";
}

function buildDebtEvents(input: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const pessoasById = buildPessoasMap(input.pessoas);
  const parcelasByDividaId = buildParcelasMap(input.parcelas);
  const events: FinancialCalendarEvent[] = [];

  for (const divida of input.dividas) {
    const pessoa = pessoasById.get(divida.pessoaId);
    const baseTitle = divida.descricao?.trim() || pessoa?.nome || (divida.tipo === "receber" ? "Valor a receber" : "Pagamento");
    const linkedParcelas = parcelasByDividaId.get(divida.id) ?? [];

    if (linkedParcelas.length > 0) {
      for (const parcela of linkedParcelas) {
        if (!isOpenStatus(parcela.status) || !isMonthReference(parcela.dataVencimento, input.monthReference)) {
          continue;
        }

        events.push({
          id: `divida-${divida.id}-parcela-${parcela.id}`,
          date: parcela.dataVencimento,
          monthReference: input.monthReference,
          group: "divida",
          direction: divida.tipo === "receber" ? "entrada" : "saida",
          source: divida.tipo === "receber" ? "divida_receber" : "divida_pagar",
          title: baseTitle,
          subtitle: pessoa ? `${pessoa.nome} · Parcela ${parcela.numero}/${linkedParcelas.length}` : `Parcela ${parcela.numero}/${linkedParcelas.length}`,
          amount: toMoneyNumber(parcela.valor),
          statusLabel: parcela.dataVencimento < input.referenceDate! ? "Vencida" : "Pendente",
          entityId: divida.id,
        });
      }
      continue;
    }

    if (!isOpenStatus(divida.status) || !isMonthReference(divida.dataVencimento, input.monthReference)) {
      continue;
    }

    events.push({
      id: `divida-${divida.id}`,
      date: divida.dataVencimento!,
      monthReference: input.monthReference,
      group: "divida",
      direction: divida.tipo === "receber" ? "entrada" : "saida",
      source: divida.tipo === "receber" ? "divida_receber" : "divida_pagar",
      title: baseTitle,
      subtitle: pessoa?.nome,
      amount: toMoneyNumber(divida.valor),
      statusLabel: divida.dataVencimento! < input.referenceDate! ? "Vencida" : "Pendente",
      entityId: divida.id,
    });
  }

  return events;
}

function buildCardInvoiceEvents(input: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const parcelasByCompraId = groupParcelasCompraByCompraId(input.parcelasCompra);
  const events: FinancialCalendarEvent[] = [];

  for (const cartao of input.cartoes) {
    const snapshot = buildCardInvoiceSnapshots({
      installments: buildInvoiceTrackingInstallmentsForCard(
        cartao.id,
        input.compras,
        parcelasByCompraId,
      ),
      payments: (input.cartaoFaturaPagamentos ?? []).filter((payment) => payment.cartaoId === cartao.id),
      getDueDayForCard: () => cartao.diaVencimento,
      referenceDate: input.referenceDate,
    }).find((item) => item.monthReference === input.monthReference);

    if (!snapshot?.dueDate || snapshot.remainingAmount <= 0) continue;

    const statusLabel = snapshot.status === "vencida"
      ? "Fatura vencida"
      : snapshot.status === "vencida_parcialmente_paga"
        ? "Fatura vencida parcialmente paga"
        : snapshot.status === "parcialmente_paga"
          ? "Fatura parcialmente paga"
          : "Fatura aberta";

    events.push({
      id: `fatura-${cartao.id}-${snapshot.monthReference}`,
      date: snapshot.dueDate,
      monthReference: input.monthReference,
      group: "cartao",
      direction: "saida",
      source: "fatura_cartao",
      title: `Fatura ${cartao.nome}`,
      subtitle: `${snapshot.openInstallmentsCount} ${snapshot.openInstallmentsCount === 1 ? "lançamento em aberto" : "lançamentos em aberto"}`,
      amount: snapshot.remainingAmount,
      statusLabel,
      entityId: cartao.id,
    });
  }

  return events;
}

function buildCardInstallmentEvents(input: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const cartoesById = buildCartoesMap(input.cartoes);
  const parcelasByCompraId = groupParcelasCompraByCompraId(input.parcelasCompra);
  const events: FinancialCalendarEvent[] = [];

  for (const compra of input.compras) {
    const cartao = cartoesById.get(compra.cartaoId);
    const materializedInstallments = parcelasByCompraId.get(compra.id) ?? [];

    if (materializedInstallments.length > 0) {
      for (const parcela of materializedInstallments) {
        if (!isParcelaComprometendoLimite(parcela.statusCartao) || !isMonthReference(parcela.dataVencimento, input.monthReference)) {
          continue;
        }

        events.push({
          id: `compra-${compra.id}-parcela-${parcela.id}`,
          date: parcela.dataVencimento!,
          monthReference: input.monthReference,
          group: "cartao",
          direction: "saida",
          source: "parcela_compra",
          title: compra.descricao,
          subtitle: cartao ? `${cartao.nome} · Parcela ${parcela.numero}/${formatInstallmentCount(compra.parcelas)}` : `Parcela ${parcela.numero}/${formatInstallmentCount(compra.parcelas)}`,
          amount: toMoneyNumber(parcela.valor),
          statusLabel: formatCardInstallmentStatusLabel(parcela.statusCartao, parcela.dataVencimento, input.referenceDate!),
          secondaryStatusLabel: formatReembolsoStatusLabel(compra, parcela.numero, parcela.statusPessoa, parcela.dataVencimento, input.referenceDate!),
          entityId: compra.id,
        });
      }
      continue;
    }

    const totalInstallments = formatInstallmentCount(compra.parcelas);
    const currentInstallment = formatCurrentInstallment(compra.parcelaAtual, totalInstallments);

    for (let installmentNumber = currentInstallment; installmentNumber <= totalInstallments; installmentNumber += 1) {
      const installmentMonth = safeLegacyInstallmentMonth(compra.dataCompra, installmentNumber);
      if (installmentMonth !== input.monthReference) continue;

      const dueDate = resolveDueDateFromCompetencia({
        competencia: installmentMonth,
        diaVencimento: cartao?.diaVencimento,
        fallbackDataVencimento: compra.dataCompra,
      });
      if (!dueDate) continue;

      events.push({
        id: `compra-${compra.id}-legacy-${installmentNumber}`,
        date: dueDate,
        monthReference: input.monthReference,
        group: "cartao",
        direction: "saida",
        source: "parcela_compra",
        title: compra.descricao,
        subtitle: cartao ? `${cartao.nome} · Parcela ${installmentNumber}/${totalInstallments}` : `Parcela ${installmentNumber}/${totalInstallments}`,
        amount: toMoneyNumber(compra.valorParcela),
        statusLabel: formatCardInstallmentStatusLabel("pendente", dueDate, input.referenceDate!),
        secondaryStatusLabel: formatReembolsoStatusLabel(compra, installmentNumber, compra.statusPessoa, dueDate, input.referenceDate!),
        entityId: compra.id,
      });
    }
  }

  return events;
}

function buildServiceEvents(input: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const events: FinancialCalendarEvent[] = [];

  for (const servico of input.servicos) {
    if (servico.status !== "ativo") continue;

    const amount = calculateServicoRealMonthlyExpenseAmount(servico, input.monthReference);
    if (amount <= 0) continue;

    const hasFixedBillingDay = Number.isFinite(Number(servico.dataCobranca)) && Number(servico.dataCobranca) >= 1;
    const date = clampDayDate(input.monthReference, servico.dataCobranca, 1);
    if (!date) continue;

    const periodicidadeLabel = servico.periodicidadeCobranca === "anual"
      ? "Cobrança anual"
      : servico.periodicidadeCobranca === "mensal" || !servico.periodicidadeCobranca
        ? "Cobrança mensal"
        : `Cobrança ${servico.periodicidadeCobranca}`;

    const equivalentMonthlyAmount = calculateServicoEquivalentMonthlyAmount(servico);
    const planningHint = equivalentMonthlyAmount > 0 && equivalentMonthlyAmount !== amount
      ? servico.periodicidadeCobranca === "semanal"
        ? ` · média anualizada ${equivalentMonthlyAmount.toFixed(2).replace(".", ",")}/mês`
        : ` · equiv. ${equivalentMonthlyAmount.toFixed(2).replace(".", ",")}/mês`
      : "";

    events.push({
      id: `servico-${servico.id}-${input.monthReference}`,
      date,
      monthReference: input.monthReference,
      group: "servico",
      direction: "saida",
      source: "servico",
      title: servico.nome,
      subtitle: `${periodicidadeLabel}${hasFixedBillingDay ? "" : " · sem data fixa"}${planningHint}`,
      amount,
      statusLabel: isServicoLinkedToCardCharge(servico) ? "Vinculado ao cartão" : "Cobrança do mês",
      entityId: servico.id,
    });
  }

  return events;
}

function buildIncomeEvents(input: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const events: FinancialCalendarEvent[] = [];

  for (const renda of input.rendas) {
    if (!renda.ativo) continue;
    const date = clampDayDate(input.monthReference, renda.diaRecebimento, 1);
    if (!date) continue;

    events.push({
      id: `renda-${renda.id}-${input.monthReference}`,
      date,
      monthReference: input.monthReference,
      group: "renda",
      direction: "entrada",
      source: "renda_prevista",
      title: renda.descricao,
      subtitle: renda.tipo === "variavel" ? "Renda variável prevista" : "Renda fixa prevista",
      amount: toMoneyNumber(renda.valor),
      statusLabel: date < input.referenceDate! ? "Prevista" : "Entrada prevista",
      entityId: renda.id,
    });
  }

  return events;
}

function buildMetaEvents(input: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const metas = input.metas ?? [];
  const events: FinancialCalendarEvent[] = [];

  for (const meta of metas) {
    if (meta.status !== "ativa" || !isMonthReference(meta.prazo, input.monthReference)) continue;

    const remainingAmount = Math.max(0, toMoneyNumber(meta.valorAlvo) - toMoneyNumber(meta.valorAtual));
    events.push({
      id: `meta-${meta.id}`,
      date: meta.prazo,
      monthReference: input.monthReference,
      group: "meta",
      direction: "info",
      source: "meta_prazo",
      title: meta.nome,
      subtitle: meta.descricao?.trim() || "Prazo da meta",
      amount: remainingAmount > 0 ? remainingAmount : toMoneyNumber(meta.valorAlvo),
      statusLabel: remainingAmount > 0 ? "Prazo da meta" : "Meta concluída",
      entityId: meta.id,
    });
  }

  return events;
}

export function buildFinancialCalendarEvents(rawInput: BuildFinancialCalendarEventsInput): FinancialCalendarEvent[] {
  const input: BuildFinancialCalendarEventsInput = {
    ...rawInput,
    metas: rawInput.metas ?? [],
    referenceDate: rawInput.referenceDate ?? format(new Date(), "yyyy-MM-dd"),
  };

  const events = [
    ...buildIncomeEvents(input),
    ...buildDebtEvents(input),
    ...buildMetaEvents(input),
    ...buildServiceEvents(input),
    ...buildCardInvoiceEvents(input),
    ...buildCardInstallmentEvents(input),
  ];

  return events.sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) return dateOrder;

    const sourceOrder = EVENT_SOURCE_ORDER[left.source] - EVENT_SOURCE_ORDER[right.source];
    if (sourceOrder !== 0) return sourceOrder;

    if ((left.amount ?? 0) !== (right.amount ?? 0)) {
      return (right.amount ?? 0) - (left.amount ?? 0);
    }

    return left.title.localeCompare(right.title, "pt-BR");
  });
}

export function buildFinancialCalendarDayMap(events: FinancialCalendarEvent[]): Map<string, FinancialCalendarEvent[]> {
  const grouped = new Map<string, FinancialCalendarEvent[]>();

  for (const event of events) {
    const rows = grouped.get(event.date) ?? [];
    rows.push(event);
    grouped.set(event.date, rows);
  }

  return grouped;
}
