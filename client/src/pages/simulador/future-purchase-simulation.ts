import { addMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type {
  Cartao,
  CartaoFaturaPagamento,
  CompraCartao,
  Divida,
  Parcela,
  ParcelaCompra,
  Patrimonio,
  Pessoa,
  Renda,
  Servico,
  ServicoCobrancaPagamento,
} from "@shared/schema";
import { resolveDueDateFromCompetencia } from "@shared/parcelas-compra-competency";
import { buildCompraReembolsoBreakdown, getReembolsoParcelaByNumero } from "@shared/compra-reembolso";
import type { FinancialCalendarEvent, FinancialCalendarEventSource } from "@/lib/financial-calendar";
import { buildFinancialCalendarEvents, getFinancialCalendarEventImpactAmount } from "@/lib/financial-calendar";
import { calculateCardLimitSummary, groupParcelasCompraByCompraId } from "@/lib/card-limit-usage";
import { divide, formatMoneyFixed, toMoneyNumber, toCents } from "@/lib/money";

export type FuturePurchaseSimulationStatus = "Pode comprar" | "Atenção" | "Não recomendado";

export type FuturePurchaseExtraReceivable = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  recorrente: boolean;
};

export type FuturePurchaseSimulationContext = {
  cartoes: Cartao[];
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  cartaoFaturaPagamentos?: CartaoFaturaPagamento[];
  dividas: Divida[];
  parcelas: Parcela[];
  servicos: Servico[];
  servicoCobrancaPagamentos?: ServicoCobrancaPagamento[];
  rendas: Renda[];
  patrimonios: Patrimonio[];
  pessoas: Pessoa[];
  referenceDate?: string;
};

export type FuturePurchaseSimulationInput = {
  nomeCompra: string;
  valorTotal: number;
  parcelas: number;
  cartaoId: string;
  mesPrimeiraParcela: string;
  reservaMinima: number;
  entradasExtras: FuturePurchaseExtraReceivable[];
  includeLiquidAssets?: boolean;
  includePersonalDebts?: boolean;
  includeCardCommitments?: boolean;
  includeExpectedReceivables?: boolean;
  includePersonalReceivables?: boolean;
  includeCardReceivables?: boolean;
  selectedReceivablePersonIds?: string[];
};

export type FuturePurchaseSimulationCalculationBasis = {
  includeLiquidAssets: boolean;
  liquidAssetsAvailable: number;
  liquidAssetsUsed: number;
  includePersonalDebts: boolean;
  personalDebtsConsidered: number;
  includeCardCommitments: boolean;
  cardCommitmentsConsidered: number;
  includeExpectedReceivables: boolean;
  expectedReceivablesConsidered: number;
  includePersonalReceivables: boolean;
  personalReceivablesConsidered: number;
  includeCardReceivables: boolean;
  cardReceivablesConsidered: number;
  selectedReceivablePersonIds: string[];
  selectedReceivablePeople: string[];
};

export type FuturePurchaseReceivablePersonOption = {
  id: string;
  nome: string;
  hasPersonalReceivables: boolean;
  hasCardReceivables: boolean;
};

export type FuturePurchaseSimulationBreakdownItem = {
  id: string;
  title: string;
  subtitle?: string;
  source: FinancialCalendarEventSource | "reembolso_cartao";
  amount: number;
  impactAmount: number;
  date: string;
  includedInInvoice: boolean;
};

export type FuturePurchaseSimulationHighlight = {
  label: string;
  amount: number;
  source: string;
  subtitle?: string;
};

export type FuturePurchaseSimulationMonth = {
  monthReference: string;
  label: string;
  startingBalance: number;
  actualIncome: number;
  simulatedExtraIncome: number;
  actualExpenses: number;
  actualNonCardExpenses: number;
  actualCardExpenses: number;
  simulatedInstallment: number;
  endingBalance: number;
  belowZero: boolean;
  belowReserve: boolean;
  actualIncomeBreakdown: FuturePurchaseSimulationBreakdownItem[];
  actualExpenseBreakdown: FuturePurchaseSimulationBreakdownItem[];
  extraIncomeEntries: FuturePurchaseExtraReceivable[];
  heaviestItems: FuturePurchaseSimulationHighlight[];
};

export type FuturePurchaseSimulationSuggestion = {
  kind: "fit" | "reserve" | "negative" | "extra_income" | "installments" | "card_limit" | "timing";
  text: string;
};

export type FuturePurchaseCardLimitAssessment = {
  applicable: boolean;
  fits: boolean;
  limitTotal: number;
  committedBeforePurchase: number;
  availableBeforePurchase: number;
  committedAfterPurchase: number;
  availableAfterPurchase: number;
  shortfall: number;
};

export type FuturePurchaseSimulationResult = {
  status: FuturePurchaseSimulationStatus;
  cashflowStatus: FuturePurchaseSimulationStatus;
  months: FuturePurchaseSimulationMonth[];
  worstMonth: FuturePurchaseSimulationMonth | null;
  lowestBalance: number;
  safePurchaseAmount: number;
  safePurchaseAmountLimitedBy: "fluxo_caixa" | "limite_cartao" | "ambos";
  recommendedInstallmentCount: number | null;
  extraAmountNeeded: number;
  cardLimitShortfall: number;
  monthsBelowReserveCount: number;
  monthsNegativeCount: number;
  installmentAmount: number;
  initialAvailableBalance: number;
  totalSimulatedExtraIncome: number;
  primaryReason: string | null;
  lateExtraIncomeWarning: string | null;
  cardLimitAssessment: FuturePurchaseCardLimitAssessment;
  calculationBasis: FuturePurchaseSimulationCalculationBasis;
  suggestions: FuturePurchaseSimulationSuggestion[];
};

type TemporaryReceivableEntry = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  monthReference: string;
  recorrente: boolean;
};

type StaticCashflowMonth = {
  monthReference: string;
  label: string;
  actualIncome: number;
  actualExpenses: number;
  actualCardExpenses: number;
  actualNonCardExpenses: number;
  actualIncomeBreakdown: FuturePurchaseSimulationBreakdownItem[];
  actualExpenseBreakdown: FuturePurchaseSimulationBreakdownItem[];
};

type BaseCashflowMonth = StaticCashflowMonth & {
  simulatedExtraIncome: number;
  extraIncomeEntries: TemporaryReceivableEntry[];
};

type PreparedCardLimitBase = {
  selectedCard: Cartao;
  limitTotal: number;
  committedBeforePurchase: number;
  availableBeforePurchase: number;
};

type PreparedFuturePurchaseProjectionBase = {
  currentMonthReference: string;
  normalizedInput: FuturePurchaseSimulationInput;
  liquidAssetsAvailable: number;
  initialAvailableBalance: number;
  monthReferences: string[];
  staticCashflowByMonthReference: Map<string, StaticCashflowMonth>;
  simulatedExtraIncomeEntriesByMonthReference: Map<string, TemporaryReceivableEntry[]>;
  cardLimitBase: PreparedCardLimitBase | null;
};

const CASHFLOW_SOURCES = new Set([
  "renda_prevista",
  "divida_receber",
  "divida_pagar",
  "servico",
  "fatura_cartao",
  "parcela_compra",
]);

const LIQUID_PATRIMONIO_TYPES = new Set(["conta_bancaria", "dinheiro", "poupanca"]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function isMonthReference(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function formatMonthLabel(monthReference: string): string {
  return format(parseISO(`${monthReference}-01`), "MMM 'de' yyyy", { locale: ptBR });
}

function normalizeMonthReference(value: string, fallback: string): string {
  return isMonthReference(value) ? value : fallback;
}

function getCurrentMonthReference(referenceDate?: string): string {
  if (typeof referenceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    return referenceDate.slice(0, 7);
  }
  return format(new Date(), "yyyy-MM");
}

function normalizeFuturePurchaseSimulationInput(
  input: FuturePurchaseSimulationInput,
  currentMonthReference: string,
): FuturePurchaseSimulationInput {
  return {
    ...input,
    nomeCompra: String(input.nomeCompra ?? "").trim(),
    valorTotal: Math.max(0, round2(Number(input.valorTotal) || 0)),
    parcelas: Math.max(1, Math.trunc(Number(input.parcelas) || 1)),
    cartaoId: String(input.cartaoId ?? ""),
    mesPrimeiraParcela: normalizeMonthReference(input.mesPrimeiraParcela, currentMonthReference),
    reservaMinima: Math.max(0, round2(Number(input.reservaMinima) || 0)),
    includeLiquidAssets: input.includeLiquidAssets !== false,
    includePersonalDebts: input.includePersonalDebts !== false,
    includeCardCommitments: input.includeCardCommitments !== false,
    includeExpectedReceivables: input.includeExpectedReceivables === true,
    includePersonalReceivables: input.includePersonalReceivables !== false,
    includeCardReceivables: input.includeCardReceivables !== false,
    selectedReceivablePersonIds: input.selectedReceivablePersonIds == null
      ? undefined
      : Array.from(new Set(input.selectedReceivablePersonIds.map((id) => String(id).trim()).filter(Boolean))),
    entradasExtras: (input.entradasExtras ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      descricao: String(entry.descricao ?? "").trim(),
      valor: Math.max(0, round2(Number(entry.valor) || 0)),
      data: String(entry.data ?? "").trim(),
      recorrente: Boolean(entry.recorrente),
    })),
  };
}

export function canBuildFuturePurchaseSimulationInput(
  input: Pick<FuturePurchaseSimulationInput, "valorTotal" | "parcelas" | "cartaoId" | "mesPrimeiraParcela">,
): boolean {
  return (
    Number(input.valorTotal) > 0
    && Math.max(1, Math.trunc(Number(input.parcelas) || 1)) >= 1
    && String(input.cartaoId ?? "").trim().length > 0
    && isMonthReference(String(input.mesPrimeiraParcela ?? ""))
  );
}

function listMonthReferences(startMonthReference: string, totalMonths: number): string[] {
  const start = parseISO(`${startMonthReference}-01`);
  return Array.from({ length: totalMonths }, (_, index) => format(addMonths(start, index), "yyyy-MM"));
}

function compareMonthReference(left: string, right: string): number {
  return left.localeCompare(right);
}

function getLiquidBalance(patrimonios: Patrimonio[]): number {
  return round2(
    patrimonios
      .filter((patrimonio) => LIQUID_PATRIMONIO_TYPES.has(String(patrimonio.tipo ?? "")))
      .reduce((sum, patrimonio) => sum + toMoneyNumber(patrimonio.valorAtual), 0),
  );
}

function resolveInstallmentAmount(totalAmount: number, installmentCount: number): number {
  const value = divide(formatMoneyFixed(totalAmount) ?? "0.00", installmentCount);
  return round2(toMoneyNumber(value));
}

function buildInstallmentSchedule(params: {
  totalAmount: number;
  installmentCount: number;
  firstInstallmentMonth: string;
}): Map<string, number> {
  const schedule = new Map<string, number>();
  const installmentCount = Math.max(1, Math.trunc(params.installmentCount));
  const totalCents = Math.max(0, toCents(params.totalAmount) ?? 0);
  const baseInstallmentCents = Math.floor(totalCents / installmentCount);
  const remainderCents = totalCents % installmentCount;
  const months = listMonthReferences(params.firstInstallmentMonth, installmentCount);

  months.forEach((monthReference, index) => {
    const installmentCents = baseInstallmentCents + (index < remainderCents ? 1 : 0);
    const current = schedule.get(monthReference) ?? 0;
    schedule.set(monthReference, round2(current + installmentCents / 100));
  });

  return schedule;
}

export function includeTemporaryReceivables(
  monthReference: string,
  receivables: FuturePurchaseExtraReceivable[],
): TemporaryReceivableEntry[] {
  return receivables.flatMap((receivable) => {
    const amount = Number(receivable.valor);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const date = String(receivable.data ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

    const startMonthReference = date.slice(0, 7);
    const shouldInclude = receivable.recorrente
      ? compareMonthReference(monthReference, startMonthReference) >= 0
      : monthReference === startMonthReference;

    if (!shouldInclude) return [];

    const day = Number(date.slice(8, 10)) || 1;
    const resolvedDate = resolveDueDateFromCompetencia({
      competencia: monthReference,
      diaVencimento: day,
      fallbackDataVencimento: date,
    });

    if (!resolvedDate) return [];

    return [{
      id: `${receivable.id}-${monthReference}`,
      descricao: receivable.descricao.trim() || "Entrada extra",
      valor: round2(amount),
      data: resolvedDate,
      monthReference,
      recorrente: receivable.recorrente,
    }];
  });
}

function resolveProjectionMonthReferences(
  currentMonthReference: string,
  firstInstallmentMonth: string,
  installmentCount: number,
): string[] {
  const startDate = parseISO(`${currentMonthReference}-01`);
  const firstInstallmentDate = parseISO(`${firstInstallmentMonth}-01`);
  const monthOffsetUntilFirstInstallment = Math.max(
    0,
    (firstInstallmentDate.getFullYear() - startDate.getFullYear()) * 12 + (firstInstallmentDate.getMonth() - startDate.getMonth()),
  );
  const totalMonths = Math.max(installmentCount, monthOffsetUntilFirstInstallment + installmentCount);

  return listMonthReferences(currentMonthReference, totalMonths);
}

function toBreakdownItem(event: FinancialCalendarEvent): FuturePurchaseSimulationBreakdownItem {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    source: event.source,
    amount: round2(event.amount ?? 0),
    impactAmount: round2(getFinancialCalendarEventImpactAmount(event)),
    date: event.date,
    includedInInvoice: event.includedInInvoice === true,
  };
}

function isOutstandingReceivableStatus(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized !== "pago" && normalized !== "cancelado";
}

function resolveReceivableTargetMonth(dueDate: string, projectionStartMonth: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const dueMonth = dueDate.slice(0, 7);
  return dueMonth < projectionStartMonth ? projectionStartMonth : dueMonth;
}

function isSelectedReceivablePerson(
  input: FuturePurchaseSimulationInput,
  pessoaId: string | null | undefined,
): pessoaId is string {
  if (!pessoaId) return false;
  if (input.selectedReceivablePersonIds == null) return true;
  return input.selectedReceivablePersonIds.includes(pessoaId);
}

function buildPersonalReceivableBreakdownForMonth(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
  monthReference: string,
  projectionStartMonth: string,
): FuturePurchaseSimulationBreakdownItem[] {
  if (input.includeExpectedReceivables !== true || input.includePersonalReceivables === false) return [];

  const pessoasById = new Map(context.pessoas.map((pessoa) => [pessoa.id, pessoa]));
  const parcelasByDividaId = new Map<string, Parcela[]>();
  context.parcelas.forEach((parcela) => {
    const current = parcelasByDividaId.get(parcela.dividaId) ?? [];
    current.push(parcela);
    parcelasByDividaId.set(parcela.dividaId, current);
  });

  const items: FuturePurchaseSimulationBreakdownItem[] = [];

  context.dividas.forEach((divida) => {
    if (
      divida.tipo !== "receber"
      || divida.deletedAt
      || divida.expectativaRecebimento === false
      || !isSelectedReceivablePerson(input, divida.pessoaId)
    ) {
      return;
    }

    const pessoa = pessoasById.get(divida.pessoaId);
    const linkedInstallments = parcelasByDividaId.get(divida.id) ?? [];
    const title = divida.descricao?.trim() || `Valor a receber de ${pessoa?.nome ?? "pessoa"}`;

    if (linkedInstallments.length > 0) {
      linkedInstallments.forEach((parcela) => {
        if (!isOutstandingReceivableStatus(parcela.status)) return;
        const targetMonth = resolveReceivableTargetMonth(parcela.dataVencimento, projectionStartMonth);
        if (targetMonth !== monthReference) return;

        items.push({
          id: `divida-${divida.id}-parcela-${parcela.id}`,
          title,
          subtitle: `${pessoa?.nome ?? "Pessoa"} · Parcela ${parcela.numero}/${linkedInstallments.length}`,
          source: "divida_receber",
          amount: round2(toMoneyNumber(parcela.valor)),
          impactAmount: round2(toMoneyNumber(parcela.valor)),
          date: parcela.dataVencimento,
          includedInInvoice: false,
        });
      });
      return;
    }

    if (!isOutstandingReceivableStatus(divida.status) || !divida.dataVencimento) return;
    const targetMonth = resolveReceivableTargetMonth(divida.dataVencimento, projectionStartMonth);
    if (targetMonth !== monthReference) return;

    items.push({
      id: `divida-${divida.id}`,
      title,
      subtitle: pessoa?.nome,
      source: "divida_receber",
      amount: round2(toMoneyNumber(divida.valor)),
      impactAmount: round2(toMoneyNumber(divida.valor)),
      date: divida.dataVencimento,
      includedInInvoice: false,
    });
  });

  return items;
}

function resolveLegacyInstallmentMonth(dataCompra: string, installmentNumber: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCompra)) return null;
  return format(addMonths(parseISO(`${dataCompra.slice(0, 7)}-01`), Math.max(0, installmentNumber - 1)), "yyyy-MM");
}

function buildCardReceivableBreakdownForMonth(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
  monthReference: string,
  projectionStartMonth: string,
): FuturePurchaseSimulationBreakdownItem[] {
  if (input.includeExpectedReceivables !== true || input.includeCardReceivables === false) return [];

  const pessoasById = new Map(context.pessoas.map((pessoa) => [pessoa.id, pessoa]));
  const cartoesById = new Map(context.cartoes.map((cartao) => [cartao.id, cartao]));
  const parcelasByCompraId = groupParcelasCompraByCompraId(context.parcelasCompra);
  const items: FuturePurchaseSimulationBreakdownItem[] = [];

  context.compras.forEach((compra) => {
    if (!isSelectedReceivablePerson(input, compra.pessoaId)) return;

    const breakdown = buildCompraReembolsoBreakdown(compra);
    if (breakdown.reembolsoPessoaCents <= 0) return;

    const pessoa = pessoasById.get(compra.pessoaId);
    const cartao = cartoesById.get(compra.cartaoId);
    const installments = parcelasByCompraId.get(compra.id) ?? [];
    const buildItem = (params: {
      id: string;
      installmentNumber: number;
      dueDate: string;
      statusPessoa: string | null | undefined;
    }) => {
      if (!isOutstandingReceivableStatus(params.statusPessoa)) return;
      const targetMonth = resolveReceivableTargetMonth(params.dueDate, projectionStartMonth);
      if (targetMonth !== monthReference) return;
      const amount = getReembolsoParcelaByNumero(compra, params.installmentNumber);
      if (amount <= 0) return;

      items.push({
        id: params.id,
        title: `Reembolso: ${compra.descricao}`,
        subtitle: `${pessoa?.nome ?? "Pessoa"}${cartao ? ` · ${cartao.nome}` : ""} · Parcela ${params.installmentNumber}/${breakdown.totalParcelas}`,
        source: "reembolso_cartao",
        amount: round2(amount),
        impactAmount: round2(amount),
        date: params.dueDate,
        includedInInvoice: false,
      });
    };

    if (installments.length > 0) {
      installments.forEach((parcela) => {
        const installmentMonth = parcela.dataVencimento?.slice(0, 7)
          || resolveLegacyInstallmentMonth(compra.dataCompra, parcela.numero);
        if (!installmentMonth) return;
        const dueDate = parcela.dataVencimento || resolveDueDateFromCompetencia({
          competencia: installmentMonth,
          diaVencimento: cartao?.diaVencimento,
          fallbackDataVencimento: compra.dataCompra,
        });
        if (!dueDate) return;
        buildItem({
          id: `reembolso-${compra.id}-parcela-${parcela.id}`,
          installmentNumber: parcela.numero,
          dueDate,
          statusPessoa: parcela.statusPessoa,
        });
      });
      return;
    }

    if (!isOutstandingReceivableStatus(compra.statusPessoa)) return;
    for (let installmentNumber = breakdown.parcelaAtual; installmentNumber <= breakdown.totalParcelas; installmentNumber += 1) {
      const installmentMonth = resolveLegacyInstallmentMonth(compra.dataCompra, installmentNumber);
      if (!installmentMonth) continue;
      const dueDate = resolveDueDateFromCompetencia({
        competencia: installmentMonth,
        diaVencimento: cartao?.diaVencimento,
        fallbackDataVencimento: compra.dataCompra,
      });
      if (!dueDate) continue;
      buildItem({
        id: `reembolso-${compra.id}-legacy-${installmentNumber}`,
        installmentNumber,
        dueDate,
        statusPessoa: compra.statusPessoa,
      });
    }
  });

  return items;
}

export function listFuturePurchaseReceivablePersonOptions(
  context: FuturePurchaseSimulationContext,
): FuturePurchaseReceivablePersonOption[] {
  const parcelasByDividaId = new Map<string, Parcela[]>();
  context.parcelas.forEach((parcela) => {
    const current = parcelasByDividaId.get(parcela.dividaId) ?? [];
    current.push(parcela);
    parcelasByDividaId.set(parcela.dividaId, current);
  });
  const parcelasByCompraId = groupParcelasCompraByCompraId(context.parcelasCompra);

  return context.pessoas
    .filter((pessoa) => !pessoa.deletedAt)
    .map((pessoa) => {
      const hasPersonalReceivables = context.dividas.some((divida) => {
        if (
          divida.pessoaId !== pessoa.id
          || divida.tipo !== "receber"
          || divida.deletedAt
          || divida.expectativaRecebimento === false
        ) {
          return false;
        }
        const installments = parcelasByDividaId.get(divida.id) ?? [];
        return installments.length > 0
          ? installments.some((parcela) => isOutstandingReceivableStatus(parcela.status))
          : isOutstandingReceivableStatus(divida.status);
      });
      const hasCardReceivables = context.compras.some((compra) => {
        if (compra.pessoaId !== pessoa.id || buildCompraReembolsoBreakdown(compra).reembolsoPessoaCents <= 0) {
          return false;
        }
        const installments = parcelasByCompraId.get(compra.id) ?? [];
        return installments.length > 0
          ? installments.some((parcela) => isOutstandingReceivableStatus(parcela.statusPessoa))
          : isOutstandingReceivableStatus(compra.statusPessoa);
      });

      return {
        id: pessoa.id,
        nome: pessoa.nome,
        hasPersonalReceivables,
        hasCardReceivables,
      };
    })
    .filter((pessoa) => pessoa.hasPersonalReceivables || pessoa.hasCardReceivables)
    .sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR", { sensitivity: "base" }));
}

function buildStaticCashflowByMonthReference(
  context: FuturePurchaseSimulationContext,
  monthReferences: string[],
  input: FuturePurchaseSimulationInput,
): Map<string, StaticCashflowMonth> {
  const projectionStartMonth = monthReferences[0] ?? getCurrentMonthReference(context.referenceDate);
  return new Map(monthReferences.map((monthReference) => {
    const events = buildFinancialCalendarEvents({
      monthReference,
      cartoes: context.cartoes,
      compras: context.compras,
      parcelasCompra: context.parcelasCompra,
      cartaoFaturaPagamentos: context.cartaoFaturaPagamentos,
      dividas: context.dividas,
      parcelas: context.parcelas,
      pessoas: context.pessoas,
      servicos: context.servicos,
      servicoCobrancaPagamentos: context.servicoCobrancaPagamentos,
      rendas: context.rendas,
      metas: [],
      referenceDate: context.referenceDate,
    }).filter((event) => {
      if (!CASHFLOW_SOURCES.has(event.source)) return false;
      if (event.source === "divida_receber") return false;
      if (event.source === "divida_pagar") return input.includePersonalDebts !== false;
      if (event.source === "fatura_cartao" || event.source === "parcela_compra") {
        return input.includeCardCommitments !== false;
      }
      return true;
    });

    const actualIncomeBreakdown = events
      .filter((event) => event.direction === "entrada" && getFinancialCalendarEventImpactAmount(event) > 0)
      .map(toBreakdownItem)
      .concat(
        buildPersonalReceivableBreakdownForMonth(context, input, monthReference, projectionStartMonth),
        buildCardReceivableBreakdownForMonth(context, input, monthReference, projectionStartMonth),
      );
    const actualExpenseBreakdown = events
      .filter((event) => event.direction === "saida" && getFinancialCalendarEventImpactAmount(event) > 0)
      .map(toBreakdownItem);

    const actualIncome = round2(
      actualIncomeBreakdown.reduce((sum, item) => sum + item.impactAmount, 0),
    );
    const actualExpenses = round2(
      actualExpenseBreakdown.reduce((sum, item) => sum + item.impactAmount, 0),
    );
    const actualCardExpenses = round2(
      actualExpenseBreakdown
        .filter((item) => item.source === "fatura_cartao" || item.source === "parcela_compra")
        .reduce((sum, item) => sum + item.impactAmount, 0),
    );
    const actualNonCardExpenses = round2(Math.max(0, actualExpenses - actualCardExpenses));

    return [monthReference, {
      monthReference,
      label: formatMonthLabel(monthReference),
      actualIncome,
      actualExpenses,
      actualCardExpenses,
      actualNonCardExpenses,
      actualIncomeBreakdown,
      actualExpenseBreakdown,
    }];
  }));
}

function buildSimulatedExtraIncomeEntriesByMonthReference(
  monthReferences: string[],
  receivables: FuturePurchaseExtraReceivable[],
): Map<string, TemporaryReceivableEntry[]> {
  return new Map(
    monthReferences.map((monthReference) => [
      monthReference,
      includeTemporaryReceivables(monthReference, receivables),
    ]),
  );
}

function buildCardLimitBase(
  context: FuturePurchaseSimulationContext,
  currentMonthReference: string,
  cartaoId: string,
): PreparedCardLimitBase | null {
  const selectedCard = context.cartoes.find((card) => card.id === cartaoId);
  if (!selectedCard) return null;

  const groupedInstallments = groupParcelasCompraByCompraId(context.parcelasCompra);
  const summary = calculateCardLimitSummary(
    selectedCard.id,
    context.compras,
    groupedInstallments,
    currentMonthReference,
    selectedCard.limite,
    context.cartaoFaturaPagamentos,
    {
      servicos: context.servicos,
      servicoCobrancaPagamentos: context.servicoCobrancaPagamentos,
    },
  );

  return {
    selectedCard,
    limitTotal: round2(toMoneyNumber(selectedCard.limite)),
    committedBeforePurchase: round2(summary.limiteComprometido),
    availableBeforePurchase: round2(summary.limiteDisponivel),
  };
}

function prepareFuturePurchaseProjectionBase(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
  maxInstallmentCount = Math.max(1, Math.trunc(Number(input.parcelas) || 1)),
): PreparedFuturePurchaseProjectionBase {
  const currentMonthReference = getCurrentMonthReference(context.referenceDate);
  const normalizedInput = normalizeFuturePurchaseSimulationInput(input, currentMonthReference);
  const monthReferences = resolveProjectionMonthReferences(
    currentMonthReference,
    normalizedInput.mesPrimeiraParcela,
    Math.max(normalizedInput.parcelas, maxInstallmentCount),
  );
  const liquidAssetsAvailable = getLiquidBalance(context.patrimonios);

  return {
    currentMonthReference,
    normalizedInput,
    liquidAssetsAvailable,
    initialAvailableBalance: normalizedInput.includeLiquidAssets === false ? 0 : liquidAssetsAvailable,
    monthReferences,
    staticCashflowByMonthReference: buildStaticCashflowByMonthReference(context, monthReferences, normalizedInput),
    simulatedExtraIncomeEntriesByMonthReference: buildSimulatedExtraIncomeEntriesByMonthReference(
      monthReferences,
      normalizedInput.entradasExtras,
    ),
    cardLimitBase: buildCardLimitBase(context, currentMonthReference, normalizedInput.cartaoId),
  };
}

function buildBaseCashflowMonthsFromPreparedBase(
  preparedBase: PreparedFuturePurchaseProjectionBase,
  input: FuturePurchaseSimulationInput,
): BaseCashflowMonth[] {
  const monthReferences = resolveProjectionMonthReferences(
    preparedBase.currentMonthReference,
    input.mesPrimeiraParcela,
    input.parcelas,
  );

  return monthReferences.map((monthReference) => {
    const staticCashflow = preparedBase.staticCashflowByMonthReference.get(monthReference);
    const extraIncomeEntries = preparedBase.simulatedExtraIncomeEntriesByMonthReference.get(monthReference) ?? [];

    return {
      monthReference,
      label: staticCashflow?.label ?? formatMonthLabel(monthReference),
      actualIncome: staticCashflow?.actualIncome ?? 0,
      actualExpenses: staticCashflow?.actualExpenses ?? 0,
      actualCardExpenses: staticCashflow?.actualCardExpenses ?? 0,
      actualNonCardExpenses: staticCashflow?.actualNonCardExpenses ?? 0,
      actualIncomeBreakdown: staticCashflow?.actualIncomeBreakdown ?? [],
      actualExpenseBreakdown: staticCashflow?.actualExpenseBreakdown ?? [],
      simulatedExtraIncome: round2(extraIncomeEntries.reduce((sum, receivable) => sum + receivable.valor, 0)),
      extraIncomeEntries,
    };
  });
}

function buildHeaviestItems(
  actualExpenseBreakdown: FuturePurchaseSimulationBreakdownItem[],
  simulatedInstallment: number,
): FuturePurchaseSimulationHighlight[] {
  const items: FuturePurchaseSimulationHighlight[] = actualExpenseBreakdown.map((item) => ({
    label: item.title,
    amount: item.impactAmount,
    source: item.source,
    subtitle: item.subtitle,
  }));

  if (simulatedInstallment > 0) {
    items.push({
      label: "Parcela simulada",
      amount: simulatedInstallment,
      source: "parcela_simulada",
      subtitle: "Compra futura em análise",
    });
  }

  return items
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 3);
}

function applyInstallmentsToBaseMonths(
  baseMonths: BaseCashflowMonth[],
  initialAvailableBalance: number,
  installmentSchedule: Map<string, number>,
  minimumReserve: number,
): FuturePurchaseSimulationMonth[] {
  let rollingBalance = round2(initialAvailableBalance);

  return baseMonths.map((month) => {
    const startingBalance = rollingBalance;
    const simulatedInstallment = round2(installmentSchedule.get(month.monthReference) ?? 0);
    const endingBalance = round2(
      startingBalance + month.actualIncome + month.simulatedExtraIncome - month.actualExpenses - simulatedInstallment,
    );

    rollingBalance = endingBalance;

    return {
      monthReference: month.monthReference,
      label: month.label,
      startingBalance,
      actualIncome: month.actualIncome,
      simulatedExtraIncome: month.simulatedExtraIncome,
      actualExpenses: month.actualExpenses,
      actualNonCardExpenses: month.actualNonCardExpenses,
      actualCardExpenses: month.actualCardExpenses,
      simulatedInstallment,
      endingBalance,
      belowZero: endingBalance < 0,
      belowReserve: endingBalance < minimumReserve,
      actualIncomeBreakdown: month.actualIncomeBreakdown,
      actualExpenseBreakdown: month.actualExpenseBreakdown,
      extraIncomeEntries: month.extraIncomeEntries.map((entry) => ({
        id: entry.id,
        descricao: entry.descricao,
        valor: entry.valor,
        data: entry.data,
        recorrente: entry.recorrente,
      })),
      heaviestItems: buildHeaviestItems(month.actualExpenseBreakdown, simulatedInstallment),
    };
  });
}

function getCashflowStatus(
  months: FuturePurchaseSimulationMonth[],
  minimumReserve: number,
): FuturePurchaseSimulationStatus {
  if (months.some((month) => month.endingBalance < 0)) {
    return "Não recomendado";
  }

  if (minimumReserve > 0 && months.some((month) => month.endingBalance < minimumReserve)) {
    return "Atenção";
  }

  return "Pode comprar";
}

function getLowestBalance(months: FuturePurchaseSimulationMonth[]): number {
  if (months.length === 0) return 0;
  return months.reduce((lowest, month) => Math.min(lowest, month.endingBalance), months[0].endingBalance);
}

function findWorstMonth(months: FuturePurchaseSimulationMonth[]): FuturePurchaseSimulationMonth | null {
  if (months.length === 0) return null;
  return months.reduce((worst, month) => (month.endingBalance < worst.endingBalance ? month : worst), months[0]);
}

function evaluateCardLimitForAmount(
  preparedBase: PreparedFuturePurchaseProjectionBase,
  totalAmount: number,
): FuturePurchaseCardLimitAssessment {
  const base = preparedBase.cardLimitBase;
  if (!base) {
    return {
      applicable: false,
      fits: true,
      limitTotal: 0,
      committedBeforePurchase: 0,
      availableBeforePurchase: 0,
      committedAfterPurchase: 0,
      availableAfterPurchase: 0,
      shortfall: 0,
    };
  }

  const committedAfterPurchase = round2(base.committedBeforePurchase + Math.max(0, totalAmount));
  const availableAfterPurchase = round2(base.limitTotal - committedAfterPurchase);
  const shortfall = round2(Math.max(0, -availableAfterPurchase));

  return {
    applicable: true,
    fits: availableAfterPurchase >= 0,
    limitTotal: base.limitTotal,
    committedBeforePurchase: base.committedBeforePurchase,
    availableBeforePurchase: base.availableBeforePurchase,
    committedAfterPurchase,
    availableAfterPurchase,
    shortfall,
  };
}

function projectFuturePurchaseCashflowFromPreparedBase(
  preparedBase: PreparedFuturePurchaseProjectionBase,
  inputOverrides: Partial<FuturePurchaseSimulationInput> = {},
): FuturePurchaseSimulationMonth[] {
  const normalizedInput = normalizeFuturePurchaseSimulationInput(
    {
      ...preparedBase.normalizedInput,
      ...inputOverrides,
    },
    preparedBase.currentMonthReference,
  );
  const baseMonths = buildBaseCashflowMonthsFromPreparedBase(preparedBase, normalizedInput);
  const installmentSchedule = buildInstallmentSchedule({
    totalAmount: normalizedInput.valorTotal,
    installmentCount: normalizedInput.parcelas,
    firstInstallmentMonth: normalizedInput.mesPrimeiraParcela,
  });

  return applyInstallmentsToBaseMonths(
    baseMonths,
    preparedBase.initialAvailableBalance,
    installmentSchedule,
    normalizedInput.reservaMinima,
  );
}

export function projectFuturePurchaseCashflow(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): FuturePurchaseSimulationMonth[] {
  const preparedBase = prepareFuturePurchaseProjectionBase(context, input);
  return projectFuturePurchaseCashflowFromPreparedBase(preparedBase);
}

function calculateSafePurchaseAmountFromPreparedBase(
  preparedBase: PreparedFuturePurchaseProjectionBase,
): {
  amount: number;
  limitedBy: "fluxo_caixa" | "limite_cartao" | "ambos";
} {
  const { normalizedInput } = preparedBase;
  const baselineThreshold = Math.max(0, normalizedInput.reservaMinima);
  const baselineMonths = projectFuturePurchaseCashflowFromPreparedBase(preparedBase, {
    valorTotal: 0,
  });

  const baseCardAssessment = evaluateCardLimitForAmount(preparedBase, 0);
  const baselineCashflowBroken = baselineMonths.some((month) => month.endingBalance < baselineThreshold);
  const baselineLimitBroken = baseCardAssessment.applicable && baseCardAssessment.availableBeforePurchase < 0;

  if (baselineCashflowBroken || baselineLimitBroken) {
    return {
      amount: 0,
      limitedBy: baselineCashflowBroken && baselineLimitBroken ? "ambos" : baselineLimitBroken ? "limite_cartao" : "fluxo_caixa",
    };
  }

  const fitsCashflow = (candidateAmount: number): boolean => {
    const candidateMonths = projectFuturePurchaseCashflowFromPreparedBase(preparedBase, {
      valorTotal: candidateAmount,
    });

    return candidateMonths.every((month) => month.endingBalance >= baselineThreshold);
  };

  let low = 0;
  let high = Math.max(toCents(normalizedInput.valorTotal) ?? 0, 10_000);

  while (fitsCashflow(high / 100) && high < 100_000_000) {
    low = high;
    high *= 2;
  }

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (fitsCashflow(mid / 100)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const cashflowSafeAmount = round2(low / 100);
  const cardLimitSafeAmount = preparedBase.cardLimitBase
    ? round2(Math.max(0, preparedBase.cardLimitBase.availableBeforePurchase))
    : cashflowSafeAmount;
  const amount = round2(Math.min(cashflowSafeAmount, cardLimitSafeAmount));

  let limitedBy: "fluxo_caixa" | "limite_cartao" | "ambos" = "fluxo_caixa";
  if (preparedBase.cardLimitBase) {
    const cashflowLimited = amount === cashflowSafeAmount;
    const limitLimited = amount === cardLimitSafeAmount;
    limitedBy = cashflowLimited && limitLimited
      ? "ambos"
      : limitLimited
        ? "limite_cartao"
        : "fluxo_caixa";
  }

  return {
    amount,
    limitedBy,
  };
}

export function calculateSafePurchaseAmount(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): number {
  const preparedBase = prepareFuturePurchaseProjectionBase(context, input);
  return calculateSafePurchaseAmountFromPreparedBase(preparedBase).amount;
}

function calculateRecommendedInstallmentCountFromPreparedBase(
  preparedBase: PreparedFuturePurchaseProjectionBase,
): number | null {
  const { normalizedInput } = preparedBase;
  const currentLimitAssessment = evaluateCardLimitForAmount(preparedBase, normalizedInput.valorTotal);
  if (currentLimitAssessment.applicable && !currentLimitAssessment.fits) {
    return null;
  }

  const maxInstallments = Math.max(24, normalizedInput.parcelas);
  const evaluated = Array.from({ length: maxInstallments }, (_, index) => {
    const installmentCount = index + 1;
    const months = projectFuturePurchaseCashflowFromPreparedBase(preparedBase, {
      parcelas: installmentCount,
    });

    return {
      installmentCount,
      status: getCashflowStatus(months, normalizedInput.reservaMinima),
    };
  });

  const safeOption = evaluated.find((option) => option.status === "Pode comprar");
  if (safeOption) return safeOption.installmentCount;

  const attentionOption = evaluated.find((option) => option.status === "Atenção");
  if (attentionOption) return attentionOption.installmentCount;

  return null;
}

function buildLateExtraIncomeWarning(
  receivables: FuturePurchaseExtraReceivable[],
  worstMonth: FuturePurchaseSimulationMonth | null,
): string | null {
  if (!worstMonth) return null;

  const futureEntry = receivables
    .map((receivable) => String(receivable.data ?? "").trim().slice(0, 7))
    .filter((monthReference) => isMonthReference(monthReference) && compareMonthReference(monthReference, worstMonth.monthReference) > 0)
    .sort(compareMonthReference)[0];

  if (!futureEntry) return null;

  const monthLabel = formatMonthLabel(futureEntry);
  if (worstMonth.belowZero) {
    return `Esta entrada ajuda a partir de ${monthLabel}, mas não evita saldo negativo antes disso.`;
  }

  return `Esta entrada ajuda a partir de ${monthLabel}, mas não evita a pressão sobre a reserva antes disso.`;
}

function buildPrimaryReason(params: {
  status: FuturePurchaseSimulationStatus;
  worstMonth: FuturePurchaseSimulationMonth | null;
  reserveFloor: number;
  cardLimitAssessment: FuturePurchaseCardLimitAssessment;
}): string | null {
  if (params.status === "Pode comprar") return null;

  if (params.cardLimitAssessment.applicable && !params.cardLimitAssessment.fits) {
    return `A compra não cabe no limite do cartão. Faltariam ${formatCurrency(params.cardLimitAssessment.shortfall)} de limite.`;
  }

  if (params.worstMonth?.belowZero) {
    return `${params.worstMonth.label} fica negativo em ${formatCurrency(Math.abs(params.worstMonth.endingBalance))}.`;
  }

  if (params.reserveFloor > 0 && params.worstMonth) {
    return `A reserva mínima de ${formatCurrency(params.reserveFloor)} fica comprometida em ${params.worstMonth.label}.`;
  }

  return null;
}

function buildSuggestions(params: {
  status: FuturePurchaseSimulationStatus;
  monthsBelowReserveCount: number;
  monthsNegativeCount: number;
  extraAmountNeeded: number;
  recommendedInstallmentCount: number | null;
  selectedInstallmentCount: number;
  lateExtraIncomeWarning: string | null;
  cardLimitAssessment: FuturePurchaseCardLimitAssessment;
}): FuturePurchaseSimulationSuggestion[] {
  const suggestions: FuturePurchaseSimulationSuggestion[] = [];

  if (!params.cardLimitAssessment.fits) {
    suggestions.push({
      kind: "card_limit",
      text: `A compra não cabe no limite do cartão. Após a compra, faltariam ${formatCurrency(params.cardLimitAssessment.shortfall)} para zerar o estouro.`,
    });
  }

  if (params.lateExtraIncomeWarning) {
    suggestions.push({
      kind: "timing",
      text: params.lateExtraIncomeWarning,
    });
  }

  if (params.status === "Pode comprar") {
    suggestions.push({
      kind: "fit",
      text: "Essa compra cabe no seu fluxo previsto sem consumir a reserva mínima.",
    });
  }

  if (params.monthsBelowReserveCount > 0) {
    suggestions.push({
      kind: "reserve",
      text: `Você ficaria abaixo da reserva em ${params.monthsBelowReserveCount} ${params.monthsBelowReserveCount === 1 ? "mês" : "meses"}.`,
    });
  }

  if (params.monthsNegativeCount > 0) {
    suggestions.push({
      kind: "negative",
      text: `O cenário entra no vermelho em ${params.monthsNegativeCount} ${params.monthsNegativeCount === 1 ? "mês" : "meses"}.`,
    });
  }

  if (params.cardLimitAssessment.fits && params.extraAmountNeeded > 0) {
    suggestions.push({
      kind: "extra_income",
      text: `Você precisaria receber mais ${formatCurrency(params.extraAmountNeeded)} para manter todo o período no piso desejado.`,
    });
  }

  if (
    params.recommendedInstallmentCount != null
    && params.recommendedInstallmentCount !== params.selectedInstallmentCount
    && params.recommendedInstallmentCount > params.selectedInstallmentCount
  ) {
    suggestions.push({
      kind: "installments",
      text: `Parcelar em ${params.recommendedInstallmentCount}x é mais seguro para este cenário.`,
    });
  } else if (
    params.recommendedInstallmentCount == null
    && params.cardLimitAssessment.fits
    && params.status !== "Pode comprar"
  ) {
    suggestions.push({
      kind: "installments",
      text: "Nenhuma opção de parcelamento fica segura com a reserva informada.",
    });
  }

  return suggestions;
}

export function buildFuturePurchaseSimulation(
  context: FuturePurchaseSimulationContext,
  input: FuturePurchaseSimulationInput,
): FuturePurchaseSimulationResult {
  const preparedBase = prepareFuturePurchaseProjectionBase(
    context,
    input,
    Math.max(24, Math.max(1, Math.trunc(Number(input.parcelas) || 1))),
  );
  const { normalizedInput } = preparedBase;
  const months = projectFuturePurchaseCashflowFromPreparedBase(preparedBase);
  const cashflowStatus = getCashflowStatus(months, normalizedInput.reservaMinima);
  const worstMonth = findWorstMonth(months);
  const lowestBalance = round2(getLowestBalance(months));
  const monthsBelowReserveCount = months.filter((month) => month.endingBalance < normalizedInput.reservaMinima).length;
  const monthsNegativeCount = months.filter((month) => month.endingBalance < 0).length;
  const reserveFloor = Math.max(0, normalizedInput.reservaMinima);
  const extraAmountNeeded = round2(Math.max(0, reserveFloor - lowestBalance));
  const safePurchaseAmountData = calculateSafePurchaseAmountFromPreparedBase(preparedBase);
  const cardLimitAssessment = evaluateCardLimitForAmount(preparedBase, normalizedInput.valorTotal);
  const recommendedInstallmentCount = calculateRecommendedInstallmentCountFromPreparedBase(preparedBase);
  const installmentAmount = resolveInstallmentAmount(normalizedInput.valorTotal, normalizedInput.parcelas);
  const initialAvailableBalance = preparedBase.initialAvailableBalance;
  const totalSimulatedExtraIncome = round2(
    months.reduce((sum, month) => sum + month.simulatedExtraIncome, 0),
  );
  const lateExtraIncomeWarning = buildLateExtraIncomeWarning(
    normalizedInput.entradasExtras,
    worstMonth,
  );
  const status: FuturePurchaseSimulationStatus = cardLimitAssessment.applicable && !cardLimitAssessment.fits
    ? "Não recomendado"
    : cashflowStatus;
  const primaryReason = buildPrimaryReason({
    status,
    worstMonth,
    reserveFloor,
    cardLimitAssessment,
  });
  const suggestions = buildSuggestions({
    status,
    monthsBelowReserveCount,
    monthsNegativeCount,
    extraAmountNeeded,
    recommendedInstallmentCount,
    selectedInstallmentCount: normalizedInput.parcelas,
    lateExtraIncomeWarning,
    cardLimitAssessment,
  });
  const personalDebtsConsidered = round2(months.reduce((total, month) => (
    total + month.actualExpenseBreakdown
      .filter((item) => item.source === "divida_pagar")
      .reduce((sum, item) => sum + item.impactAmount, 0)
  ), 0));
  const personalReceivablesConsidered = round2(months.reduce((total, month) => (
    total + month.actualIncomeBreakdown
      .filter((item) => item.source === "divida_receber")
      .reduce((sum, item) => sum + item.impactAmount, 0)
  ), 0));
  const cardReceivablesConsidered = round2(months.reduce((total, month) => (
    total + month.actualIncomeBreakdown
      .filter((item) => item.source === "reembolso_cartao")
      .reduce((sum, item) => sum + item.impactAmount, 0)
  ), 0));
  const expectedReceivablesConsidered = round2(personalReceivablesConsidered + cardReceivablesConsidered);
  const cardCommitmentsConsidered = round2(
    months.reduce((total, month) => total + month.actualCardExpenses, 0),
  );

  return {
    status,
    cashflowStatus,
    months,
    worstMonth,
    lowestBalance,
    safePurchaseAmount: safePurchaseAmountData.amount,
    safePurchaseAmountLimitedBy: safePurchaseAmountData.limitedBy,
    recommendedInstallmentCount,
    extraAmountNeeded,
    cardLimitShortfall: cardLimitAssessment.shortfall,
    monthsBelowReserveCount,
    monthsNegativeCount,
    installmentAmount,
    initialAvailableBalance,
    totalSimulatedExtraIncome,
    primaryReason,
    lateExtraIncomeWarning,
    cardLimitAssessment,
    calculationBasis: {
      includeLiquidAssets: normalizedInput.includeLiquidAssets !== false,
      liquidAssetsAvailable: preparedBase.liquidAssetsAvailable,
      liquidAssetsUsed: initialAvailableBalance,
      includePersonalDebts: normalizedInput.includePersonalDebts !== false,
      personalDebtsConsidered,
      includeCardCommitments: normalizedInput.includeCardCommitments !== false,
      cardCommitmentsConsidered,
      includeExpectedReceivables: normalizedInput.includeExpectedReceivables === true,
      expectedReceivablesConsidered,
      includePersonalReceivables: normalizedInput.includePersonalReceivables !== false,
      personalReceivablesConsidered,
      includeCardReceivables: normalizedInput.includeCardReceivables !== false,
      cardReceivablesConsidered,
      selectedReceivablePersonIds: normalizedInput.selectedReceivablePersonIds
        ?? listFuturePurchaseReceivablePersonOptions(context).map((pessoa) => pessoa.id),
      selectedReceivablePeople: context.pessoas
        .filter((pessoa) => (
          normalizedInput.selectedReceivablePersonIds == null
          || normalizedInput.selectedReceivablePersonIds.includes(pessoa.id)
        ))
        .map((pessoa) => pessoa.nome)
        .sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" })),
    },
    suggestions,
  };
}
