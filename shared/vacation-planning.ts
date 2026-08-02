export type VacationProjectionIncome = {
  id: string;
  descricao?: string | null;
  valor: string | number;
  ativo?: boolean | null;
};

export type VacationProjectionPlan = {
  id?: string;
  rendaId: string;
  startDate: string;
  durationDays: number;
  vacationPayReceived: boolean;
  vacationPayDate?: string | null;
  vacationPayAmount?: string | number | null;
  includedInPatrimony: boolean;
};

export type VacationPlanEstimate = {
  dailyIncome: number;
  suspendedIncome: number;
  estimatedVacationPay: number;
  projectedVacationPay: number;
  vacationPayDate: string;
  endDate: string;
};

export type VacationMonthPlanImpact = {
  planId: string | null;
  rendaId: string;
  affectedDays: number;
  suspendedIncome: number;
  vacationPayIncome: number;
};

export type VacationMonthImpact = {
  monthReference: string;
  affectedDays: number;
  suspendedIncome: number;
  vacationPayIncome: number;
  netAdjustment: number;
  plans: VacationMonthPlanImpact[];
};

export type VacationProjectionMonth = VacationMonthImpact & {
  normalIncome: number;
  projectedIncome: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DAY_MS = 86_400_000;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUtcDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: string, amount: number): string {
  const parsed = parseUtcDate(value);
  if (!parsed) return value;
  return formatUtcDate(new Date(parsed.getTime() + amount * DAY_MS));
}

function getMonthBounds(monthReference: string): { start: Date; end: Date } | null {
  if (!MONTH_PATTERN.test(monthReference)) return null;
  const [year, month] = monthReference.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
  };
}

function getInclusiveOverlapDays(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): number {
  const start = Math.max(leftStart.getTime(), rightStart.getTime());
  const end = Math.min(leftEnd.getTime(), rightEnd.getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

function listMonthReferences(startReference: string, endReference: string): string[] {
  if (!MONTH_PATTERN.test(startReference) || !MONTH_PATTERN.test(endReference)) return [];
  const [startYear, startMonth] = startReference.split("-").map(Number);
  const [endYear, endMonth] = endReference.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1));
  const references: string[] = [];

  while (cursor.getTime() <= end.getTime() && references.length < 24) {
    references.push(formatUtcDate(cursor).slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return references;
}

export function calculateVacationPlanEstimate(
  plan: VacationProjectionPlan,
  income: VacationProjectionIncome,
): VacationPlanEstimate {
  const monthlyIncome = Math.max(0, toFiniteNumber(income.valor) ?? 0);
  const durationDays = Math.max(1, Math.trunc(plan.durationDays || 1));
  const dailyIncome = monthlyIncome / 30;
  const suspendedIncome = roundMoney(dailyIncome * durationDays);
  const estimatedVacationPay = roundMoney(suspendedIncome * (4 / 3));
  const informedPay = toFiniteNumber(plan.vacationPayAmount);

  return {
    dailyIncome: roundMoney(dailyIncome),
    suspendedIncome,
    estimatedVacationPay,
    projectedVacationPay: roundMoney(Math.max(0, informedPay ?? estimatedVacationPay)),
    vacationPayDate: parseUtcDate(plan.vacationPayDate ?? "")
      ? String(plan.vacationPayDate)
      : addUtcDays(plan.startDate, -2),
    endDate: addUtcDays(plan.startDate, durationDays - 1),
  };
}

export function vacationPlansOverlap(
  left: Pick<VacationProjectionPlan, "startDate" | "durationDays">,
  right: Pick<VacationProjectionPlan, "startDate" | "durationDays">,
): boolean {
  const leftStart = parseUtcDate(left.startDate);
  const rightStart = parseUtcDate(right.startDate);
  if (!leftStart || !rightStart) return false;
  const leftEnd = parseUtcDate(addUtcDays(left.startDate, Math.max(1, left.durationDays) - 1));
  const rightEnd = parseUtcDate(addUtcDays(right.startDate, Math.max(1, right.durationDays) - 1));
  if (!leftEnd || !rightEnd) return false;
  return leftStart.getTime() <= rightEnd.getTime() && rightStart.getTime() <= leftEnd.getTime();
}

export function calculateVacationMonthImpact(params: {
  monthReference: string;
  plans: VacationProjectionPlan[];
  incomes: VacationProjectionIncome[];
}): VacationMonthImpact {
  const monthBounds = getMonthBounds(params.monthReference);
  const incomeById = new Map(params.incomes.map((income) => [income.id, income] as const));
  const planImpacts: VacationMonthPlanImpact[] = [];

  if (monthBounds) {
    for (const plan of params.plans) {
      const income = incomeById.get(plan.rendaId);
      const planStart = parseUtcDate(plan.startDate);
      if (!income || income.ativo === false || !planStart) continue;
      const estimate = calculateVacationPlanEstimate(plan, income);
      const planEnd = parseUtcDate(estimate.endDate);
      if (!planEnd) continue;

      const affectedDays = getInclusiveOverlapDays(
        planStart,
        planEnd,
        monthBounds.start,
        monthBounds.end,
      );
      const monthlyIncome = Math.max(0, toFiniteNumber(income.valor) ?? 0);
      const suspendedIncome = roundMoney(Math.min(monthlyIncome, (monthlyIncome / 30) * affectedDays));
      const vacationPayIncome = estimate.vacationPayDate.slice(0, 7) === params.monthReference
        && !(plan.vacationPayReceived && plan.includedInPatrimony)
        ? estimate.projectedVacationPay
        : 0;

      if (affectedDays === 0 && vacationPayIncome === 0) continue;
      planImpacts.push({
        planId: plan.id ?? null,
        rendaId: plan.rendaId,
        affectedDays,
        suspendedIncome,
        vacationPayIncome,
      });
    }
  }

  const affectedDays = planImpacts.reduce((sum, plan) => sum + plan.affectedDays, 0);
  const suspendedIncome = roundMoney(planImpacts.reduce((sum, plan) => sum + plan.suspendedIncome, 0));
  const vacationPayIncome = roundMoney(planImpacts.reduce((sum, plan) => sum + plan.vacationPayIncome, 0));

  return {
    monthReference: params.monthReference,
    affectedDays,
    suspendedIncome,
    vacationPayIncome,
    netAdjustment: roundMoney(vacationPayIncome - suspendedIncome),
    plans: planImpacts,
  };
}

export function buildVacationPlanProjectionMonths(
  plan: VacationProjectionPlan,
  income: VacationProjectionIncome,
): VacationProjectionMonth[] {
  const estimate = calculateVacationPlanEstimate(plan, income);
  const firstReference = [plan.startDate.slice(0, 7), estimate.vacationPayDate.slice(0, 7)].sort()[0];
  const lastReference = [estimate.endDate.slice(0, 7), estimate.vacationPayDate.slice(0, 7)].sort().at(-1) ?? firstReference;
  const normalIncome = roundMoney(Math.max(0, toFiniteNumber(income.valor) ?? 0));

  return listMonthReferences(firstReference, lastReference).map((monthReference) => {
    const impact = calculateVacationMonthImpact({
      monthReference,
      plans: [plan],
      incomes: [income],
    });
    return {
      ...impact,
      normalIncome,
      projectedIncome: roundMoney(normalIncome + impact.netAdjustment),
    };
  });
}
