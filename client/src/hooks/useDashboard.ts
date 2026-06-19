import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  Cartao,
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
import type { DashboardOverviewResponse, FinancialInsight, FinancialScore, FinancialSummary } from "@shared/financial";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Bell, CheckCircle, CreditCard, TrendingDown } from "lucide-react";
import { maskValue } from "@/context/values-visibility";
import { toMoneyNumber } from "@/lib/money";
import {
  calculateServicoRealMonthlyExpenseAmount,
  calculateServicoOutstandingChargeForCompetency,
  isServicoLinkedToCardCharge,
  resolveServicoNextChargeDate,
} from "@shared/servico-periodicidade";
import {
  calculateCardUsedLimit,
  getInvoiceCompetency,
  getNextOutstandingCardInvoiceSnapshot,
  groupParcelasCompraByCompraId,
  isParcelaComprometendoLimite,
} from "@/lib/card-limit-usage";
import {
  fetchCartaoFaturaPagamentos,
  type CartaoFaturaPagamentoApiModel,
} from "@/services/api/cartoes";
import { fetchDashboardOverview, fetchFinancialSummary } from "@/services/api/dashboard";
import { fetchServicoCobrancaPagamentos } from "@/services/api/servicos";
import { formatCurrencyBRL } from "@/utils/formatters";
import { resolveDashboardServicosMetrics } from "@/pages/dashboard/dashboard-servicos-metrics.utils";

export type DashboardAlert = {
  icon: any;
  color: string;
  bgColor: string;
  texto: string;
};

export interface VencimentoItem {
  id: string;
  tipo: "cartao" | "divida" | "servico";
  kind: "cartao_fatura" | "cartao_parcela" | "divida_pagar" | "divida_receber" | "servico";
  nome: string;
  subtitulo: string;
  valor: number;
  dataVenc: string;
  actionLabel: string;
  cartaoId?: string;
  monthReference?: string;
  compraCartaoId?: string;
  parcelaCompraId?: string;
  dividaId?: string;
  parcelaId?: string;
  servicoId?: string;
}

export interface PagarSemanaItem {
  id: string;
  title: string;
  dateStr: string;
  amount: number;
  type: "divida" | "cartao" | "servico";
}

type QueryState = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

type SectionStatus = {
  isLoading: boolean;
  isError: boolean;
  message: string | null;
};

const DASHBOARD_QUERY_TIMEOUT_MS = 12_000;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Erro inesperado ao carregar dados.";
};

const toSectionStatus = (query: QueryState): SectionStatus => ({
  isLoading: query.isLoading,
  isError: query.isError,
  message: query.isError ? getErrorMessage(query.error) : null,
});

const combineSectionStatus = (queries: QueryState[]): SectionStatus => {
  const firstError = queries.find((query) => query.isError);
  return {
    isLoading: queries.some((query) => query.isLoading),
    isError: Boolean(firstError),
    message: firstError ? getErrorMessage(firstError.error) : null,
  };
};

async function fetchDashboardJson<T>(url: string, label: string): Promise<T> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), DASHBOARD_QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = (await response.text()) || response.statusText;
      throw new Error(`${response.status}: ${text}`);
    }

    const durationMs = Date.now() - startedAt;
    if (durationMs >= 3_000) {
      console.warn(`[dashboard] query lenta: ${label} (${durationMs}ms)`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Tempo limite ao carregar ${label}. Tente novamente.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const ALL_DASH_CARDS = [
  { id: "receber", title: "A receber" },
  { id: "pagar", title: "A pagar" },
  { id: "servicos", title: "Gastos fixos" },
  { id: "saldo", title: "Saldo do mês" },
  { id: "renda", title: "Renda mensal" },
  { id: "patrimonio", title: "Patrimônio total" },
];

export function useDashboard({ selectedMonth, visible }: { selectedMonth: string; visible: boolean }) {
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = format(d, "MMMM 'de' yyyy", { locale: ptBR });
      opts.push({ value: format(d, "yyyy-MM"), label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  }, []);

  const dashboardOverviewQuery = useQuery<DashboardOverviewResponse>({
    queryKey: ["/api/dashboard/overview", selectedMonth],
    queryFn: () => fetchDashboardOverview(selectedMonth),
  });

  const shouldUseLegacyFallback = dashboardOverviewQuery.isError;
  const shouldEnableLegacyQueries = shouldUseLegacyFallback;

  const dividasQuery = useQuery<Divida[]>({
    queryKey: ["/api/dividas"],
    queryFn: () => fetchDashboardJson<Divida[]>("/api/dividas", "dívidas"),
    enabled: shouldEnableLegacyQueries,
  });
  const servicosQuery = useQuery<Servico[]>({
    queryKey: ["/api/servicos"],
    queryFn: () => fetchDashboardJson<Servico[]>("/api/servicos", "serviços"),
    enabled: shouldEnableLegacyQueries,
  });
  const pessoasQuery = useQuery<Pessoa[]>({
    queryKey: ["/api/pessoas"],
    queryFn: () => fetchDashboardJson<Pessoa[]>("/api/pessoas", "pessoas"),
    enabled: shouldEnableLegacyQueries,
  });
  const cartoesQuery = useQuery<Cartao[]>({
    queryKey: ["/api/cartoes"],
    queryFn: () => fetchDashboardJson<Cartao[]>("/api/cartoes", "cartões"),
    enabled: shouldEnableLegacyQueries,
  });
  const comprasQuery = useQuery<CompraCartao[]>({
    queryKey: ["/api/compras-cartao"],
    queryFn: () => fetchDashboardJson<CompraCartao[]>("/api/compras-cartao", "compras de cartão"),
    enabled: shouldEnableLegacyQueries,
  });
  const parcelasQuery = useQuery<Parcela[]>({
    queryKey: ["/api/parcelas"],
    queryFn: () => fetchDashboardJson<Parcela[]>("/api/parcelas", "parcelas"),
    enabled: shouldEnableLegacyQueries,
  });
  const parcelasCompraQuery = useQuery<ParcelaCompra[]>({
    queryKey: ["/api/parcelas-compra"],
    queryFn: () => fetchDashboardJson<ParcelaCompra[]>("/api/parcelas-compra", "parcelas de compra"),
    enabled: shouldEnableLegacyQueries,
  });
  const cartaoFaturaPagamentosQuery = useQuery<CartaoFaturaPagamentoApiModel[]>({
    queryKey: ["/api/cartoes/fatura-pagamentos"],
    queryFn: fetchCartaoFaturaPagamentos,
    enabled: shouldEnableLegacyQueries,
  });
  const servicoCobrancaPagamentosQuery = useQuery<ServicoCobrancaPagamento[]>({
    queryKey: ["/api/servicos/cobranca-pagamentos"],
    queryFn: fetchServicoCobrancaPagamentos,
    enabled: shouldEnableLegacyQueries,
  });
  const rendasQuery = useQuery<Renda[]>({
    queryKey: ["/api/rendas"],
    queryFn: () => fetchDashboardJson<Renda[]>("/api/rendas", "rendas"),
    enabled: shouldEnableLegacyQueries,
  });
  const patrimoniosQuery = useQuery<Patrimonio[]>({
    queryKey: ["/api/patrimonios"],
    queryFn: () => fetchDashboardJson<Patrimonio[]>("/api/patrimonios", "patrimônio"),
    enabled: shouldEnableLegacyQueries,
  });
  const financialScoreQuery = useQuery<FinancialScore>({
    queryKey: ["/api/financial/score"],
    queryFn: () => fetchDashboardJson<FinancialScore>("/api/financial/score", "score financeiro"),
    enabled: shouldEnableLegacyQueries,
  });
  const financialInsightsQuery = useQuery<FinancialInsight[]>({
    queryKey: ["/api/financial/insights"],
    queryFn: () => fetchDashboardJson<FinancialInsight[]>("/api/financial/insights", "insights financeiros"),
    enabled: shouldEnableLegacyQueries,
  });
  const financialSummaryQuery = useQuery<FinancialSummary>({
    queryKey: ["/api/financial/summary", selectedMonth],
    queryFn: () => fetchFinancialSummary(selectedMonth),
    enabled: shouldEnableLegacyQueries,
  });

  const dashboardOverview = dashboardOverviewQuery.data;

  const dividas = shouldUseLegacyFallback ? (dividasQuery.data ?? []) : (dashboardOverview?.dividas ?? []);
  const servicos = shouldUseLegacyFallback ? (servicosQuery.data ?? []) : (dashboardOverview?.servicos ?? []);
  const pessoas = shouldUseLegacyFallback ? (pessoasQuery.data ?? []) : (dashboardOverview?.pessoas ?? []);
  const cartoes = shouldUseLegacyFallback ? (cartoesQuery.data ?? []) : (dashboardOverview?.cartoes ?? []);
  const compras = shouldUseLegacyFallback ? (comprasQuery.data ?? []) : (dashboardOverview?.compras ?? []);
  const parcelas = shouldUseLegacyFallback ? (parcelasQuery.data ?? []) : (dashboardOverview?.parcelas ?? []);
  const parcelasCompra = shouldUseLegacyFallback ? (parcelasCompraQuery.data ?? []) : (dashboardOverview?.parcelasCompra ?? []);
  const cartaoFaturaPagamentos: CartaoFaturaPagamentoApiModel[] = shouldUseLegacyFallback
    ? (cartaoFaturaPagamentosQuery.data ?? [])
    : ((dashboardOverview?.cartaoFaturaPagamentos ?? []) as unknown as CartaoFaturaPagamentoApiModel[]);
  const servicoCobrancaPagamentos = shouldUseLegacyFallback
    ? (servicoCobrancaPagamentosQuery.data ?? [])
    : (dashboardOverview?.servicoCobrancaPagamentos ?? []);
  const rendas = shouldUseLegacyFallback ? (rendasQuery.data ?? []) : (dashboardOverview?.rendas ?? []);
  const patrimonios = shouldUseLegacyFallback ? (patrimoniosQuery.data ?? []) : (dashboardOverview?.patrimonios ?? []);
  const financialScore = shouldUseLegacyFallback ? financialScoreQuery.data : dashboardOverview?.financialScore;
  const financialInsights = shouldUseLegacyFallback ? (financialInsightsQuery.data ?? []) : (dashboardOverview?.financialInsights ?? []);
  const financialSummary = shouldUseLegacyFallback ? financialSummaryQuery.data : dashboardOverview?.financialSummary;

  const legacyIsLoading =
    dividasQuery.isLoading
    || servicosQuery.isLoading
    || parcelasQuery.isLoading
    || pessoasQuery.isLoading
    || financialScoreQuery.isLoading
    || financialInsightsQuery.isLoading
    || financialSummaryQuery.isLoading;

  const isLoading = shouldUseLegacyFallback ? legacyIsLoading : dashboardOverviewQuery.isLoading;

  const overviewSectionStatus = toSectionStatus({
    isLoading: dashboardOverviewQuery.isLoading,
    isError: dashboardOverviewQuery.isError,
    error: dashboardOverviewQuery.error,
  });

  const legacySectionStatus = {
    saldo: toSectionStatus({
      isLoading: financialSummaryQuery.isLoading,
      isError: financialSummaryQuery.isError,
      error: financialSummaryQuery.error,
    }),
    entradasSaidas: toSectionStatus({
      isLoading: financialSummaryQuery.isLoading,
      isError: financialSummaryQuery.isError,
      error: financialSummaryQuery.error,
    }),
    cardsResumo: combineSectionStatus([
      { isLoading: financialSummaryQuery.isLoading, isError: financialSummaryQuery.isError, error: financialSummaryQuery.error },
      { isLoading: dividasQuery.isLoading, isError: dividasQuery.isError, error: dividasQuery.error },
      { isLoading: servicosQuery.isLoading, isError: servicosQuery.isError, error: servicosQuery.error },
      { isLoading: rendasQuery.isLoading, isError: rendasQuery.isError, error: rendasQuery.error },
      { isLoading: patrimoniosQuery.isLoading, isError: patrimoniosQuery.isError, error: patrimoniosQuery.error },
    ]),
    score: toSectionStatus({
      isLoading: financialScoreQuery.isLoading,
      isError: financialScoreQuery.isError,
      error: financialScoreQuery.error,
    }),
    scoreDetalhado: combineSectionStatus([
      { isLoading: financialScoreQuery.isLoading, isError: financialScoreQuery.isError, error: financialScoreQuery.error },
      { isLoading: pessoasQuery.isLoading, isError: pessoasQuery.isError, error: pessoasQuery.error },
      { isLoading: dividasQuery.isLoading, isError: dividasQuery.isError, error: dividasQuery.error },
    ]),
    insights: toSectionStatus({
      isLoading: financialInsightsQuery.isLoading,
      isError: financialInsightsQuery.isError,
      error: financialInsightsQuery.error,
    }),
    alertas: combineSectionStatus([
      { isLoading: dividasQuery.isLoading, isError: dividasQuery.isError, error: dividasQuery.error },
      { isLoading: servicosQuery.isLoading, isError: servicosQuery.isError, error: servicosQuery.error },
      { isLoading: cartoesQuery.isLoading, isError: cartoesQuery.isError, error: cartoesQuery.error },
      { isLoading: comprasQuery.isLoading, isError: comprasQuery.isError, error: comprasQuery.error },
      { isLoading: parcelasQuery.isLoading, isError: parcelasQuery.isError, error: parcelasQuery.error },
      { isLoading: parcelasCompraQuery.isLoading, isError: parcelasCompraQuery.isError, error: parcelasCompraQuery.error },
      { isLoading: cartaoFaturaPagamentosQuery.isLoading, isError: cartaoFaturaPagamentosQuery.isError, error: cartaoFaturaPagamentosQuery.error },
      { isLoading: servicoCobrancaPagamentosQuery.isLoading, isError: servicoCobrancaPagamentosQuery.isError, error: servicoCobrancaPagamentosQuery.error },
      { isLoading: financialSummaryQuery.isLoading, isError: financialSummaryQuery.isError, error: financialSummaryQuery.error },
    ]),
    proximosVencimentos: combineSectionStatus([
      { isLoading: dividasQuery.isLoading, isError: dividasQuery.isError, error: dividasQuery.error },
      { isLoading: servicosQuery.isLoading, isError: servicosQuery.isError, error: servicosQuery.error },
      { isLoading: pessoasQuery.isLoading, isError: pessoasQuery.isError, error: pessoasQuery.error },
      { isLoading: cartoesQuery.isLoading, isError: cartoesQuery.isError, error: cartoesQuery.error },
      { isLoading: comprasQuery.isLoading, isError: comprasQuery.isError, error: comprasQuery.error },
      { isLoading: parcelasQuery.isLoading, isError: parcelasQuery.isError, error: parcelasQuery.error },
      { isLoading: parcelasCompraQuery.isLoading, isError: parcelasCompraQuery.isError, error: parcelasCompraQuery.error },
      { isLoading: cartaoFaturaPagamentosQuery.isLoading, isError: cartaoFaturaPagamentosQuery.isError, error: cartaoFaturaPagamentosQuery.error },
      { isLoading: servicoCobrancaPagamentosQuery.isLoading, isError: servicoCobrancaPagamentosQuery.isError, error: servicoCobrancaPagamentosQuery.error },
    ]),
    pagarSemana: combineSectionStatus([
      { isLoading: dividasQuery.isLoading, isError: dividasQuery.isError, error: dividasQuery.error },
      { isLoading: servicosQuery.isLoading, isError: servicosQuery.isError, error: servicosQuery.error },
      { isLoading: cartoesQuery.isLoading, isError: cartoesQuery.isError, error: cartoesQuery.error },
      { isLoading: comprasQuery.isLoading, isError: comprasQuery.isError, error: comprasQuery.error },
      { isLoading: pessoasQuery.isLoading, isError: pessoasQuery.isError, error: pessoasQuery.error },
      { isLoading: parcelasQuery.isLoading, isError: parcelasQuery.isError, error: parcelasQuery.error },
      { isLoading: parcelasCompraQuery.isLoading, isError: parcelasCompraQuery.isError, error: parcelasCompraQuery.error },
      { isLoading: cartaoFaturaPagamentosQuery.isLoading, isError: cartaoFaturaPagamentosQuery.isError, error: cartaoFaturaPagamentosQuery.error },
      { isLoading: servicoCobrancaPagamentosQuery.isLoading, isError: servicoCobrancaPagamentosQuery.isError, error: servicoCobrancaPagamentosQuery.error },
    ]),
  } as const;

  const sectionStatus = shouldUseLegacyFallback
    ? legacySectionStatus
    : ({
      saldo: overviewSectionStatus,
      entradasSaidas: overviewSectionStatus,
      cardsResumo: overviewSectionStatus,
      score: overviewSectionStatus,
      scoreDetalhado: overviewSectionStatus,
      insights: overviewSectionStatus,
      alertas: overviewSectionStatus,
      proximosVencimentos: overviewSectionStatus,
      pagarSemana: overviewSectionStatus,
    } as const);

  const servicosMetrics = useMemo(
    () => resolveDashboardServicosMetrics(financialSummary),
    [financialSummary],
  );

  const totalRenda = financialSummary?.totalRenda ?? 0;
  const totalPatrimonio = patrimonios.reduce((s, p) => s + toMoneyNumber(p.valorAtual), 0);
  const totalServicos = servicosMetrics.realMonthlyTotal;
  const servicosEquivalenteMensalTotal = servicosMetrics.equivalenteMensalTotal;
  const servicosCobrancaRealCompetenciaTotal = servicosMetrics.cobrancaRealCompetenciaTotal;
  const servicosVinculadosCartaoEquivalenteMensalTotal = servicosMetrics.vinculadosCartaoEquivalenteMensalTotal;
  const servicosVinculadosCartaoCobrancaRealTotal = servicosMetrics.vinculadosCartaoCobrancaRealTotal;
  const servicosNaoVinculadosCartaoEquivalenteMensalTotal = servicosMetrics.naoVinculadosCartaoEquivalenteMensalTotal;
  const servicosNaoVinculadosCartaoCobrancaRealTotal = servicosMetrics.naoVinculadosCartaoCobrancaRealTotal;
  const totalReceber = financialSummary?.totalReceberMes ?? 0;
  const totalPagar = financialSummary?.totalPagarMes ?? 0;
  const totalCartoesMes = financialSummary?.totalCartoesMes ?? 0;
  const ReceberMes = totalReceber;
  const totalPagarMes = totalPagar;
  const totalEntradas = financialSummary?.totalEntradas ?? 0;
  const totalSaidas = totalPagarMes + totalServicos + totalCartoesMes;
  const saldoPrevisto = totalEntradas - totalSaidas;

  const saldoColor =
    saldoPrevisto > 0 ? "text-emerald-600"
    : saldoPrevisto === 0 ? "text-blue-600"
    : "text-red-600";

  const saldoIconBg =
    saldoPrevisto > 0 ? "bg-emerald-500/10 text-emerald-600"
    : saldoPrevisto === 0 ? "bg-blue-500/10 text-blue-600"
    : "bg-red-500/10 text-red-600";

  const todayDate = new Date();
  const today = format(todayDate, "yyyy-MM-dd");
  const todayReferenceDate = parseISO(today);
  const todayMonthReference = format(todayDate, "yyyy-MM");
  const in5Days = format(new Date(todayDate.getTime() + 5 * 86400000), "yyyy-MM-dd");
  const in7Days = format(addDays(todayDate, 7), "yyyy-MM-dd");

  const vencendo5Dias = dividas.filter(
    (d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento && d.dataVencimento >= today && d.dataVencimento <= in5Days,
  );
  const vencidos = dividas.filter(
    (d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento && d.dataVencimento < today,
  );

  const isValidBillingDay = (value: number | null | undefined): value is number =>
    typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= 31;

  const getNextDueDate = (diaDoMes: number | null | undefined): string | null => {
    if (!isValidBillingDay(diaDoMes)) {
      return null;
    }
    const billingDay = diaDoMes;
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), billingDay);
    const thisMonthStr = format(thisMonth, "yyyy-MM-dd");
    if (thisMonthStr >= today) return thisMonthStr;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);
    return format(nextMonth, "yyyy-MM-dd");
  };

  const formatInvoiceMonthLabel = (monthReference: string): string => {
    try {
      const label = format(parseISO(`${monthReference}-01`), "MMMM 'de' yyyy", { locale: ptBR });
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch {
      return monthReference;
    }
  };

  const pessoasById = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa] as const)),
    [pessoas],
  );
  const cartoesById = useMemo(
    () => new Map(cartoes.map((cartao) => [cartao.id, cartao] as const)),
    [cartoes],
  );
  const parcelasByDividaId = useMemo(() => {
    const grouped = new Map<string, Parcela[]>();
    for (const parcela of parcelas) {
      const rows = grouped.get(parcela.dividaId) ?? [];
      rows.push(parcela);
      grouped.set(parcela.dividaId, rows);
    }
    return grouped;
  }, [parcelas]);
  const parcelasCompraByCompraId = useMemo(
    () => groupParcelasCompraByCompraId(parcelasCompra),
    [parcelasCompra],
  );

  const proximosVencimentos: VencimentoItem[] = useMemo(() => {
    const items: VencimentoItem[] = [];
    const buildUrgencyLabel = (dateValue: string, options?: { todayLabel?: string; futureVerb?: string; pastVerb?: string }) => {
      const daysUntil = differenceInDays(parseISO(dateValue), new Date());
      if (daysUntil === 0) return options?.todayLabel ?? "Vence hoje";
      if (daysUntil < 0) return `${options?.pastVerb ?? "Venceu"} há ${Math.abs(daysUntil)}d`;
      return `${options?.futureVerb ?? "Vence em"} ${daysUntil} dia${daysUntil === 1 ? "" : "s"}`;
    };

    cartoes.forEach((c) => {
      const proximaFatura = getNextOutstandingCardInvoiceSnapshot(
        c.id,
        compras,
        parcelasCompraByCompraId,
        c.diaVencimento,
        cartaoFaturaPagamentos,
      );
      if (!proximaFatura || proximaFatura.total <= 0) return;
      const dataVenc = proximaFatura.dueDate ?? getNextDueDate(c.diaVencimento);
      if (!dataVenc) return;
      const invoiceMonthLabel = formatInvoiceMonthLabel(proximaFatura.monthReference);
      const futureInvoiceLabel = proximaFatura.monthReference !== todayMonthReference ? " · Próxima fatura" : "";
      items.push({
        id: `cartao-${c.id}-${proximaFatura.monthReference}`,
        tipo: "cartao",
        kind: "cartao_fatura",
        nome: `Fatura ${c.nome} · ${invoiceMonthLabel}`,
        subtitulo: `${buildUrgencyLabel(dataVenc)}${futureInvoiceLabel}`,
        valor: proximaFatura.total,
        dataVenc,
        actionLabel: "Pagar fatura",
        cartaoId: c.id,
        monthReference: proximaFatura.monthReference,
      });
    });

    compras.forEach((compra) => {
      const cartao = cartoesById.get(compra.cartaoId);
      const parcelasDaCompra = parcelasCompraByCompraId.get(compra.id) ?? [];
      parcelasDaCompra
        .filter((parcela) =>
          isParcelaComprometendoLimite(parcela.statusCartao)
          && Boolean(parcela.dataVencimento)
          && (parcela.dataVencimento! <= in7Days || parcela.dataVencimento! < today),
        )
        .forEach((parcela) => {
          const invoiceMonth = getInvoiceCompetency(parcela.dataVencimento);
          const urgencyLabel = buildUrgencyLabel(parcela.dataVencimento!, {
            todayLabel: "Parcela vence hoje",
            futureVerb: "Parcela vence em",
            pastVerb: "Parcela venceu",
          });

          items.push({
            id: `cartao-parcela-${parcela.id}`,
            tipo: "cartao",
            kind: "cartao_parcela",
            nome: compra.descricao,
            subtitulo: `${cartao?.nome ?? "Cartão"} · Parcela ${parcela.numero}/${compra.parcelas} · já incluída na fatura · ${urgencyLabel}`,
            valor: toMoneyNumber(parcela.valor),
            dataVenc: parcela.dataVencimento!,
            actionLabel: "Marcar parcela paga",
            cartaoId: compra.cartaoId,
            compraCartaoId: compra.id,
            parcelaCompraId: parcela.id,
            monthReference: invoiceMonth ?? undefined,
          });
        });
    });

    dividas.forEach((d) => {
      const pessoa = pessoasById.get(d.pessoaId);
      const nome = d.descricao || pessoa?.nome || (d.tipo === "receber" ? "Recebimento" : "Pagamento");
      const parcelasDaDivida = (parcelasByDividaId.get(d.id) ?? []).filter(
        (parcela) => parcela.status === "pendente" && Boolean(parcela.dataVencimento),
      );

      if (parcelasDaDivida.length > 0) {
        parcelasDaDivida.forEach((parcela) => {
          const urgencyLabel = buildUrgencyLabel(parcela.dataVencimento!);
          items.push({
            id: `divida-${d.id}-parcela-${parcela.id}`,
            tipo: "divida",
            kind: d.tipo === "receber" ? "divida_receber" : "divida_pagar",
            nome,
            subtitulo: `${urgencyLabel} · Parcela ${parcela.numero}${pessoa ? ` · ${pessoa.nome}` : ""}`,
            valor: toMoneyNumber(parcela.valor),
            dataVenc: parcela.dataVencimento!,
            actionLabel: d.tipo === "receber" ? "Marcar recebido" : "Marcar pago",
            dividaId: d.id,
            parcelaId: parcela.id,
          });
        });
        return;
      }

      if (d.status !== "pendente" || !d.dataVencimento) return;
      const urgLabel = buildUrgencyLabel(d.dataVencimento);
      items.push({
        id: `divida-${d.id}`,
        tipo: "divida",
        kind: d.tipo === "receber" ? "divida_receber" : "divida_pagar",
        nome,
        subtitulo: pessoa ? `${urgLabel} · ${pessoa.nome}` : urgLabel,
        valor: toMoneyNumber(d.valor),
        dataVenc: d.dataVencimento,
        actionLabel: d.tipo === "receber" ? "Marcar recebido" : "Marcar pago",
        dividaId: d.id,
      });
    });

    servicos
      .filter((s) => s.status === "ativo" && !isServicoLinkedToCardCharge(s))
      .forEach((s) => {
        const dataVenc = resolveServicoNextChargeDate(s, todayReferenceDate);
        if (!dataVenc) return;
        const competencia = dataVenc.slice(0, 7);
        const valor = calculateServicoOutstandingChargeForCompetency(s, competencia, servicoCobrancaPagamentos);
        if (valor <= 0) return;
        const subtitulo = buildUrgencyLabel(dataVenc, {
          todayLabel: "Cobrado hoje",
          futureVerb: "Cobra em",
          pastVerb: "Cobrado",
        });
        items.push({
          id: `servico-${s.id}-${competencia}`,
          tipo: "servico",
          kind: "servico",
          nome: s.nome,
          subtitulo,
          valor,
          dataVenc,
          actionLabel: "Marcar pago",
          servicoId: s.id,
          monthReference: competencia,
        });
      });

    return items.sort((a, b) => a.dataVenc.localeCompare(b.dataVenc));
  }, [
    cartaoFaturaPagamentos,
    cartoes,
    cartoesById,
    compras,
    dividas,
    in7Days,
    parcelasByDividaId,
    parcelasCompraByCompraId,
    pessoasById,
    servicoCobrancaPagamentos,
    servicos,
    today,
    todayMonthReference,
    todayReferenceDate,
  ]);

  const getCardUsedLimit = (cartaoId: string) =>
    calculateCardUsedLimit(cartaoId, compras, parcelasCompraByCompraId, cartaoFaturaPagamentos);

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "Desconhecido";

  const pagarSemana: PagarSemanaItem[] = useMemo(() => {
    const items: PagarSemanaItem[] = [];

    dividas.forEach((d) => {
      if (d.tipo !== "pagar") return;
      const parcelasDaDivida = (parcelasByDividaId.get(d.id) ?? []).filter(
        (parcela) => parcela.status === "pendente" && Boolean(parcela.dataVencimento),
      );
      if (parcelasDaDivida.length > 0) {
        parcelasDaDivida
          .filter((parcela) => parcela.dataVencimento! <= in7Days)
          .forEach((parcela) => {
            items.push({
              id: `div-parcela-${parcela.id}`,
              title: d.descricao || pessoasById.get(d.pessoaId)?.nome || "Pagamento",
              dateStr: parcela.dataVencimento!,
              amount: toMoneyNumber(parcela.valor),
              type: "divida",
            });
          });
        return;
      }

      if (d.status === "pendente" && d.dataVencimento && d.dataVencimento <= in7Days) {
        items.push({
          id: `div-${d.id}`,
          title: d.descricao || pessoasById.get(d.pessoaId)?.nome || "Pagamento",
          dateStr: d.dataVencimento,
          amount: toMoneyNumber(d.valor),
          type: "divida",
        });
      }
    });

    cartoes.forEach((c) => {
      const proximaFatura = getNextOutstandingCardInvoiceSnapshot(
        c.id,
        compras,
        parcelasCompraByCompraId,
        c.diaVencimento,
        cartaoFaturaPagamentos,
      );
      if (!proximaFatura?.dueDate || proximaFatura.total <= 0) return;
      if (proximaFatura.dueDate >= today && proximaFatura.dueDate <= in7Days) {
        items.push({
          id: `cat-${c.id}-${proximaFatura.monthReference}`,
          title: `Fatura ${c.nome} · ${formatInvoiceMonthLabel(proximaFatura.monthReference)}`,
          dateStr: proximaFatura.dueDate,
          amount: proximaFatura.total,
          type: "cartao",
        });
      }
    });

    servicos.filter((s) => s.status === "ativo" && !isServicoLinkedToCardCharge(s)).forEach((s) => {
      const dueDate = resolveServicoNextChargeDate(s, todayReferenceDate);
      if (!dueDate) return;
      const amount = calculateServicoOutstandingChargeForCompetency(s, dueDate.slice(0, 7), servicoCobrancaPagamentos);
      if (amount <= 0) return;
      if (dueDate >= today && dueDate <= in7Days) {
        items.push({ id: `svc-${s.id}-${dueDate.slice(0, 7)}`, title: s.nome, dateStr: dueDate, amount, type: "servico" });
      }
    });

    return items.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [
    cartaoFaturaPagamentos,
    cartoes,
    compras,
    dividas,
    in7Days,
    parcelasByDividaId,
    parcelasCompraByCompraId,
    pessoasById,
    servicoCobrancaPagamentos,
    servicos,
    today,
    todayReferenceDate,
  ]);

  const alertCartoes = cartoes.filter((c) => {
    const usado = getCardUsedLimit(c.id);
    return (usado / toMoneyNumber(c.limite, 1)) >= 0.8;
  });

  const mask = (v: string) => maskValue(v, visible);

  const aReceberTooltip = useMemo(() => {
    const items = dividas
      .filter((d) => d.tipo === "receber" && d.status === "pendente")
      .sort((a, b) => toMoneyNumber(b.valor) - toMoneyNumber(a.valor))
      .slice(0, 5);
    if (items.length === 0) return ["Nenhum valor a receber pendente."];
    return [
      "Principais valores a receber:",
      ...items.map((d) => `• ${getPessoaNome(d.pessoaId)} — ${mask(formatCurrencyBRL(toMoneyNumber(d.valor)))}`),
      "---",
      `Total: ${mask(formatCurrencyBRL(totalReceber))}`,
    ];
  }, [dividas, totalReceber, visible]);

  const aPagarTooltip = useMemo(() => {
    const items = dividas
      .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento)
      .sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""))
      .slice(0, 5);
    if (items.length === 0) return ["Nenhum vencimento pendente."];
    return [
      "Próximos vencimentos:",
      ...items.map((d) => `• ${(d.descricao || getPessoaNome(d.pessoaId)).slice(0, 25)} — ${mask(formatCurrencyBRL(toMoneyNumber(d.valor)))} (${d.dataVencimento ? format(parseISO(d.dataVencimento), "dd/MM") : "S/D"})`),
      "---",
      `Total: ${mask(formatCurrencyBRL(totalPagar))}`,
    ];
  }, [dividas, totalPagar, visible]);

  const gastosFixosTooltip = useMemo(() => {
    const items = servicos.filter((s) => s.status === "ativo");
    if (items.length === 0) return ["Nenhum serviço ativo."];
    const impactingItems = items
      .map((servico) => ({
        nome: servico.nome,
        valor: calculateServicoRealMonthlyExpenseAmount(servico, selectedMonth),
      }))
      .filter((item) => item.valor > 0);
    const hasLinkedCardServices = items.some((servico) => isServicoLinkedToCardCharge(servico));

    if (impactingItems.length === 0) {
      return [
        "Nenhum serviço sem cartão cobra neste mês.",
        ...(hasLinkedCardServices ? ["Serviços vinculados ao cartão já entram na fatura."] : []),
      ];
    }

    return [
      "Cobranças reais de serviços neste mês:",
      ...impactingItems.map((item) => `• ${item.nome} — ${mask(formatCurrencyBRL(item.valor))}`),
      ...(hasLinkedCardServices
        ? ["Serviços vinculados ao cartão já entram na fatura."]
        : []),
    ];
  }, [
    selectedMonth,
    servicos,
    visible,
  ]);

  const saldoMesTooltip = useMemo(
    () => [
      "ENTRADAS",
      `• Renda mensal: ${mask(formatCurrencyBRL(totalRenda))}`,
      ...(ReceberMes > 0 ? [`• A receber (mês): ${mask(formatCurrencyBRL(ReceberMes))}`] : []),
      `Total entradas: ${mask(formatCurrencyBRL(totalEntradas))}`,
      "---",
      "SAÍDAS",
      `• Cartões: ${mask(formatCurrencyBRL(totalCartoesMes))}`,
      `• A pagar (mês): ${mask(formatCurrencyBRL(totalPagarMes))}`,
      `• Serviços (real do mês): ${mask(formatCurrencyBRL(totalServicos))}`,
      `Total saídas: ${mask(formatCurrencyBRL(totalSaidas))}`,
      "---",
      `Saldo = ${mask(formatCurrencyBRL(totalEntradas))} - ${mask(formatCurrencyBRL(totalSaidas))} = ${mask(formatCurrencyBRL(saldoPrevisto))}`,
    ],
    [ReceberMes, saldoPrevisto, totalCartoesMes, totalEntradas, totalPagarMes, totalRenda, totalSaidas, totalServicos, visible],
  );

  const rendaMensalTooltip = useMemo(() => {
    const items = rendas.filter((r) => r.ativo);
    if (items.length === 0) return ["Nenhuma renda cadastrada.", "Acesse /renda para adicionar."];
    return [
      "Fontes de renda ativas:",
      ...items.map((r) => `• ${r.descricao} — ${mask(formatCurrencyBRL(toMoneyNumber(r.valor)))} (${r.tipo === "fixo" ? "Fixo" : "Variável"})`),
      "---",
      `Total: ${mask(formatCurrencyBRL(totalRenda))}`,
    ];
  }, [rendas, totalRenda, visible]);

  const patrimonioTooltip = useMemo(() => {
    if (patrimonios.length === 0) return ["Nenhum patrimônio cadastrado."];
    const grouped = patrimonios.reduce((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] || 0) + toMoneyNumber(p.valorAtual);
      return acc;
    }, {} as Record<string, number>);

    const tipoLabels: Record<string, string> = {
      conta_bancaria: "Conta Bancária",
      dinheiro: "Dinheiro",
      poupanca: "Poupança",
      investimento: "Investimento",
      outros: "Outros",
    };

    return [
      "Distribuição por tipo:",
      ...Object.entries(grouped).map(([tipo, total]) => `• ${tipoLabels[tipo] || tipo}: ${mask(formatCurrencyBRL(total))}`),
      "---",
      `Total: ${mask(formatCurrencyBRL(totalPatrimonio))}`,
    ];
  }, [patrimonios, totalPatrimonio, visible]);

  const alertas: DashboardAlert[] = [];
  if (vencidos.length > 0) {
    alertas.push({
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-500/5 border-red-500/20",
      texto: `Você tem ${vencidos.length} dívida(s) vencida(s) que precisam de atenção`,
    });
  }
  if (vencendo5Dias.length > 0) {
    alertas.push({
      icon: Bell,
      color: "text-amber-600",
      bgColor: "bg-amber-500/5 border-amber-500/20",
      texto: `${vencendo5Dias.length} conta(s) vencem nos proximos 5 dias`,
    });
  }
  if (saldoPrevisto < 0) {
    alertas.push({
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-500/5 border-red-500/20",
      texto: `Saldo do mês negativo: ${maskValue(formatCurrencyBRL(saldoPrevisto), visible)}`,
    });
  }
  for (const c of alertCartoes) {
    const usado = getCardUsedLimit(c.id);
    const pct = Math.round((usado / toMoneyNumber(c.limite, 1)) * 100);
    alertas.push({
      icon: CreditCard,
      color: "text-amber-600",
      bgColor: "bg-amber-500/5 border-amber-500/20",
      texto: `Cartao ${c.nome} esta usando ${pct}% do limite`,
    });
  }
  if (alertas.length === 0) {
    alertas.push({
      icon: CheckCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/5 border-emerald-500/20",
      texto: "Tudo em ordem! Nenhum alerta no momento.",
    });
  }

  const score: FinancialScore = financialScore ?? {
    valor: 0,
    classificacao: "Risco",
    tendencia: "estavel",
    fatores: [],
  };
  const insights = financialInsights;

  const scoreBarColor =
    score.valor >= 80 ? "bg-emerald-500"
    : score.valor >= 60 ? "bg-primary"
    : score.valor >= 40 ? "bg-amber-500"
    : "bg-red-500";

  const scoreLabelColor =
    score.valor >= 80 ? "text-emerald-600"
    : score.valor >= 60 ? "text-primary"
    : score.valor >= 40 ? "text-amber-600"
    : "text-red-600";

  return {
    isLoading,
    monthOptions,
    dividas,
    servicos,
    pessoas,
    cartoes,
    compras,
    parcelas,
    parcelasCompra,
    cartaoFaturaPagamentos,
    servicoCobrancaPagamentos,
    rendas,
    patrimonios,
    totalRenda,
    totalPatrimonio,
    totalServicos,
    servicosEquivalenteMensalTotal,
    servicosCobrancaRealCompetenciaTotal,
    servicosVinculadosCartaoEquivalenteMensalTotal,
    servicosVinculadosCartaoCobrancaRealTotal,
    servicosNaoVinculadosCartaoEquivalenteMensalTotal,
    servicosNaoVinculadosCartaoCobrancaRealTotal,
    totalReceber,
    totalPagar,
    totalCartoesMes,
    ReceberMes,
    totalPagarMes,
    totalEntradas,
    totalSaidas,
    saldoPrevisto,
    saldoColor,
    saldoIconBg,
    today,
    in7Days,
    proximosVencimentos,
    pagarSemana,
    aReceberTooltip,
    aPagarTooltip,
    gastosFixosTooltip,
    saldoMesTooltip,
    rendaMensalTooltip,
    patrimonioTooltip,
    alertas,
    score,
    insights,
    scoreBarColor,
    scoreLabelColor,
    allDashCards: ALL_DASH_CARDS,
    sectionStatus,
  };
}




