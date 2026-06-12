import type { Servico } from "@shared/schema";
import type { ReportsOverviewSummary } from "@shared/reports";
import {
  calculateServicoEquivalentMonthlyAmount,
  calculateServicoMonthlyFinancialImpactAmount,
  calculateServicoRealMonthlyExpenseAmount,
  calculateServicoRealChargeForCompetency,
  getServicoBillingDisplayInfo,
  isServicoLinkedToCardCharge,
} from "@shared/servico-periodicidade";
import { addMonths, format, isAfter, parseISO, startOfMonth } from "date-fns";

type ServicoDetailedMetric = {
  id: string;
  nome: string;
  categoria: string;
  periodicidadeLabel: string;
  valorCobranca: number;
  equivalenteMensal: number;
  vinculadoCartao: boolean;
  formaPagamento: string;
};

export type RelatoriosServicosMetrics = {
  monthlyAverageTotal: number;
  realChargeInPeriodTotal: number;
  linkedCardMonthlyAverageTotal: number;
  linkedCardRealChargeInPeriodTotal: number;
  nonLinkedCardMonthlyAverageTotal: number;
  nonLinkedCardRealChargeInPeriodTotal: number;
  hasDetailedSummaryMetrics: boolean;
  legacyMonthlyTotal: number;
  detailedServices: ServicoDetailedMetric[];
};

type BuildRelatoriosServicosMetricsInput = {
  activeServicos: Servico[];
  overviewSummary: ReportsOverviewSummary | null;
  startDateIso: string;
  endDateIso: string;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toMoney = (value: unknown, fallback = 0): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return round2(Math.max(0, fallback));
  return round2(Math.max(0, value));
};

function listCompetenciesInPeriod(startDateIso: string, endDateIso: string): string[] {
  try {
    const start = startOfMonth(parseISO(startDateIso));
    const end = startOfMonth(parseISO(endDateIso));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || isAfter(start, end)) return [];

    const competencies: string[] = [];
    let cursor = start;
    while (!isAfter(cursor, end)) {
      competencies.push(format(cursor, "yyyy-MM"));
      cursor = addMonths(cursor, 1);
    }
    return competencies;
  } catch {
    return [];
  }
}

export function buildRelatoriosServicosMetrics({
  activeServicos,
  overviewSummary,
  startDateIso,
  endDateIso,
}: BuildRelatoriosServicosMetricsInput): RelatoriosServicosMetrics {
  const competencies = listCompetenciesInPeriod(startDateIso, endDateIso);
  const hasDetailedSummaryMetrics = [
    overviewSummary?.servicosEquivalenteMensalTotal,
    overviewSummary?.servicosCobrancaRealCompetenciaTotal,
    overviewSummary?.servicosCobrancaRealPeriodoTotal,
    overviewSummary?.servicosVinculadosCartaoEquivalenteMensalTotal,
    overviewSummary?.servicosVinculadosCartaoCobrancaRealTotal,
    overviewSummary?.servicosVinculadosCartaoCobrancaRealPeriodoTotal,
    overviewSummary?.servicosNaoVinculadosCartaoEquivalenteMensalTotal,
    overviewSummary?.servicosNaoVinculadosCartaoCobrancaRealTotal,
    overviewSummary?.servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal,
  ].some((value) => typeof value === "number" && Number.isFinite(value));

  const detailedServices = activeServicos.map((servico) => {
    const billing = getServicoBillingDisplayInfo(servico);
    return {
      id: servico.id,
      nome: servico.nome,
      categoria: servico.categoria,
      periodicidadeLabel: billing.periodicidadeLabel,
      valorCobranca: billing.valorCobranca,
      equivalenteMensal: billing.equivalenteMensal,
      vinculadoCartao: isServicoLinkedToCardCharge(servico),
      formaPagamento: servico.formaPagamento,
    };
  });

  const computedMonthlyAverageTotal = round2(
    detailedServices.reduce((sum, service) => sum + service.equivalenteMensal, 0),
  );
  const computedLinkedMonthlyAverageTotal = round2(
    detailedServices.filter((service) => service.vinculadoCartao).reduce((sum, service) => sum + service.equivalenteMensal, 0),
  );
  const computedNonLinkedMonthlyAverageTotal = round2(
    Math.max(0, computedMonthlyAverageTotal - computedLinkedMonthlyAverageTotal),
  );

  const computedRealChargeInPeriodTotal = round2(
    activeServicos.reduce((sum, servico) => {
      const charge = competencies.reduce((acc, competency) => acc + calculateServicoRealChargeForCompetency(servico, competency), 0);
      return sum + charge;
    }, 0),
  );
  const computedLinkedRealChargeInPeriodTotal = round2(
    activeServicos
      .filter((servico) => isServicoLinkedToCardCharge(servico))
      .reduce((sum, servico) => {
        const charge = competencies.reduce((acc, competency) => acc + calculateServicoRealChargeForCompetency(servico, competency), 0);
        return sum + charge;
      }, 0),
  );
  const computedNonLinkedRealChargeInPeriodTotal = round2(
    activeServicos.reduce((sum, servico) => {
      const charge = competencies.reduce(
        (acc, competency) => acc + calculateServicoRealMonthlyExpenseAmount(servico, competency),
        0,
      );
      return sum + charge;
    }, 0),
  );

  const monthlyAverageTotal = toMoney(
    overviewSummary?.servicosEquivalenteMensalTotal,
    overviewSummary?.servicosAtivosTotal ?? computedMonthlyAverageTotal,
  );

  const realChargeInPeriodTotal = toMoney(
    overviewSummary?.servicosCobrancaRealPeriodoTotal,
    computedRealChargeInPeriodTotal,
  );

  const linkedCardMonthlyAverageTotal = toMoney(
    overviewSummary?.servicosVinculadosCartaoEquivalenteMensalTotal,
    computedLinkedMonthlyAverageTotal,
  );

  const linkedCardRealChargeInPeriodTotal = toMoney(
    overviewSummary?.servicosVinculadosCartaoCobrancaRealPeriodoTotal,
    computedLinkedRealChargeInPeriodTotal,
  );

  const nonLinkedCardMonthlyAverageTotal = toMoney(
    overviewSummary?.servicosNaoVinculadosCartaoEquivalenteMensalTotal,
    Math.max(0, monthlyAverageTotal - linkedCardMonthlyAverageTotal),
  );

  const nonLinkedCardRealChargeInPeriodTotal = toMoney(
    overviewSummary?.servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal,
    Math.max(0, realChargeInPeriodTotal - linkedCardRealChargeInPeriodTotal),
  );

  const legacyMonthlyTotal = toMoney(
    overviewSummary?.servicosNaoVinculadosCartaoEquivalenteMensalTotal ?? overviewSummary?.servicosAtivosTotal,
    activeServicos.reduce((sum, servico) => sum + calculateServicoMonthlyFinancialImpactAmount(servico), 0),
  );

  return {
    monthlyAverageTotal,
    realChargeInPeriodTotal,
    linkedCardMonthlyAverageTotal,
    linkedCardRealChargeInPeriodTotal,
    nonLinkedCardMonthlyAverageTotal,
    nonLinkedCardRealChargeInPeriodTotal,
    hasDetailedSummaryMetrics,
    legacyMonthlyTotal,
    detailedServices,
  };
}
