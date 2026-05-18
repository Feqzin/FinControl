import type { FinancialSummary } from "@shared/financial";

export type DashboardServicosMetrics = {
  totalLegacy: number;
  equivalenteMensalTotal: number;
  cobrancaRealCompetenciaTotal: number;
  vinculadosCartaoEquivalenteMensalTotal: number;
  vinculadosCartaoCobrancaRealTotal: number;
  naoVinculadosCartaoEquivalenteMensalTotal: number;
  naoVinculadosCartaoCobrancaRealTotal: number;
  hasDetailedMetrics: boolean;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toNonNegativeMoney = (value: unknown, fallback = 0): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return round2(Math.max(0, fallback));
  }
  return round2(Math.max(0, value));
};

export function resolveDashboardServicosMetrics(
  summary: Partial<FinancialSummary> | null | undefined,
): DashboardServicosMetrics {
  const totalLegacy = toNonNegativeMoney(summary?.totalServicos, 0);

  const hasDetailedMetrics = [
    summary?.servicosEquivalenteMensalTotal,
    summary?.servicosCobrancaRealCompetenciaTotal,
    summary?.servicosVinculadosCartaoEquivalenteMensalTotal,
    summary?.servicosVinculadosCartaoCobrancaRealTotal,
    summary?.servicosNaoVinculadosCartaoEquivalenteMensalTotal,
    summary?.servicosNaoVinculadosCartaoCobrancaRealTotal,
  ].some((value) => typeof value === "number" && Number.isFinite(value));

  const equivalenteMensalTotal = toNonNegativeMoney(
    summary?.servicosEquivalenteMensalTotal,
    totalLegacy,
  );
  const cobrancaRealCompetenciaTotal = toNonNegativeMoney(
    summary?.servicosCobrancaRealCompetenciaTotal,
    totalLegacy,
  );
  const vinculadosCartaoEquivalenteMensalTotal = toNonNegativeMoney(
    summary?.servicosVinculadosCartaoEquivalenteMensalTotal,
    0,
  );
  const vinculadosCartaoCobrancaRealTotal = toNonNegativeMoney(
    summary?.servicosVinculadosCartaoCobrancaRealTotal,
    0,
  );

  const derivedNaoVinculadosEquivalente = Math.max(
    0,
    equivalenteMensalTotal - vinculadosCartaoEquivalenteMensalTotal,
  );
  const derivedNaoVinculadosCobranca = Math.max(
    0,
    cobrancaRealCompetenciaTotal - vinculadosCartaoCobrancaRealTotal,
  );

  const naoVinculadosCartaoEquivalenteMensalTotal = toNonNegativeMoney(
    summary?.servicosNaoVinculadosCartaoEquivalenteMensalTotal,
    derivedNaoVinculadosEquivalente,
  );
  const naoVinculadosCartaoCobrancaRealTotal = toNonNegativeMoney(
    summary?.servicosNaoVinculadosCartaoCobrancaRealTotal,
    derivedNaoVinculadosCobranca,
  );

  return {
    totalLegacy,
    equivalenteMensalTotal,
    cobrancaRealCompetenciaTotal,
    vinculadosCartaoEquivalenteMensalTotal,
    vinculadosCartaoCobrancaRealTotal,
    naoVinculadosCartaoEquivalenteMensalTotal,
    naoVinculadosCartaoCobrancaRealTotal,
    hasDetailedMetrics,
  };
}

