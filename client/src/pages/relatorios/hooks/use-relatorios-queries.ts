import { useQuery } from "@tanstack/react-query";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Patrimonio,
  Pessoa,
  Renda,
  Servico,
} from "@shared/schema";
import { useRelatoriosOverviewQuery } from "@/pages/relatorios/hooks/use-relatorios-overview-query";

type UseRelatoriosQueriesParams = {
  startDate?: string;
  endDate?: string;
  enableOverview?: boolean;
};

export function useRelatoriosQueries(params: UseRelatoriosQueriesParams = {}) {
  const shouldTryOverview = params.enableOverview ?? true;
  const overviewQuery = useRelatoriosOverviewQuery(
    { startDate: params.startDate, endDate: params.endDate },
    { enabled: shouldTryOverview },
  );

  const shouldUseLegacyFallback = !shouldTryOverview || overviewQuery.isError;

  const { data: rendasLegacy = [], isLoading: l1 } = useQuery<Renda[]>({
    queryKey: ["/api/rendas"],
    enabled: shouldUseLegacyFallback,
  });
  const { data: patrimoniosLegacy = [], isLoading: l2 } = useQuery<Patrimonio[]>({
    queryKey: ["/api/patrimonios"],
    enabled: shouldUseLegacyFallback,
  });
  const { data: comprasLegacy = [], isLoading: l3 } = useQuery<CompraCartao[]>({
    queryKey: ["/api/compras-cartao"],
    enabled: shouldUseLegacyFallback,
  });
  const { data: cartoesLegacy = [], isLoading: l4 } = useQuery<Cartao[]>({
    queryKey: ["/api/cartoes"],
    enabled: shouldUseLegacyFallback,
  });
  const { data: servicosLegacy = [], isLoading: l5 } = useQuery<Servico[]>({
    queryKey: ["/api/servicos"],
    enabled: shouldUseLegacyFallback,
  });
  const { data: dividasLegacy = [], isLoading: l6 } = useQuery<Divida[]>({
    queryKey: ["/api/dividas"],
    enabled: shouldUseLegacyFallback,
  });
  const { data: pessoasLegacy = [], isLoading: l7 } = useQuery<Pessoa[]>({
    queryKey: ["/api/pessoas"],
    enabled: shouldUseLegacyFallback,
  });

  const legacyLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;
  const hasOverviewData = shouldTryOverview && !!overviewQuery.data && !overviewQuery.isError;

  const rendas = hasOverviewData ? overviewQuery.data.sections.rendas : rendasLegacy;
  const patrimonios = hasOverviewData ? overviewQuery.data.sections.patrimonios : patrimoniosLegacy;
  const compras = hasOverviewData ? overviewQuery.data.sections.comprasCartao : comprasLegacy;
  const cartoes = hasOverviewData ? overviewQuery.data.sections.cartoes : cartoesLegacy;
  const servicos = hasOverviewData ? overviewQuery.data.sections.servicos : servicosLegacy;
  const dividas = hasOverviewData ? overviewQuery.data.sections.dividas : dividasLegacy;
  const pessoas = hasOverviewData ? overviewQuery.data.sections.pessoas : pessoasLegacy;

  const isLoading = shouldTryOverview
    ? (overviewQuery.isLoading || (overviewQuery.isError && legacyLoading))
    : legacyLoading;

  return {
    rendas,
    patrimonios,
    compras,
    cartoes,
    servicos,
    dividas,
    pessoas,
    isLoading,
    dataSource: hasOverviewData ? "overview" : "legacy",
    isCompatibilityMode: shouldUseLegacyFallback,
    overviewSummary: hasOverviewData ? overviewQuery.data.summary : null,
    overviewPeriod: hasOverviewData ? overviewQuery.data.period : null,
    overviewGeneratedAt: hasOverviewData ? overviewQuery.data.generatedAt : null,
    overviewError: overviewQuery.isError ? overviewQuery.error : null,
  };
}
