export type VacationProjectionIncome = {
  id: string;
  descricao?: string | null;
  valor: string | number;
  diaRecebimento?: number | null;
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
  grossSalaryAmount?: string | number | null;
  incomeCompetencyOffsetMonths?: number | null;
  includedInPatrimony: boolean;
};

export type VacationPlanEstimate = {
  dailyIncome: number;
  suspendedIncome: number;
  grossSalaryAmount: number;
  vacationBaseAmount: number;
  constitutionalThird: number;
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
  paymentDate: string | null;
  competencyDate: string | null;
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

function addUtcMonths(value: string, amount: number): string {
  const parsed = parseUtcDate(value);
  if (!parsed) return value;
  const targetMonth = new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth() + amount,
    1,
  ));
  const lastDay = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonth.setUTCDate(Math.min(parsed.getUTCDate(), lastDay));
  return formatUtcDate(targetMonth);
}

function resolveMonthlyPaymentDate(
  monthReference: string,
  income: VacationProjectionIncome,
): string | null {
  const monthBounds = getMonthBounds(monthReference);
  if (!monthBounds) return null;
  const requestedDay = Number(income.diaRecebimento);
  const day = Number.isInteger(requestedDay) && requestedDay >= 1
    ? Math.min(requestedDay, monthBounds.end.getUTCDate())
    : 1;
  return `${monthReference}-${String(day).padStart(2, "0")}`;
}

function getPlanEndDate(plan: Pick<VacationProjectionPlan, "startDate" | "durationDays">): string {
  return addUtcDays(plan.startDate, Math.max(1, Math.trunc(plan.durationDays || 1)) - 1);
}

function isDateInsideVacationPlan(date: string, plan: VacationProjectionPlan): boolean {
  const parsedDate = parseUtcDate(date);
  const planStart = parseUtcDate(plan.startDate);
  const planEnd = parseUtcDate(getPlanEndDate(plan));
  if (!parsedDate || !planStart || !planEnd) return false;
  return parsedDate.getTime() >= planStart.getTime() && parsedDate.getTime() <= planEnd.getTime();
}

function getIncomeCompetencyDate(
  paymentDate: string,
  plan: VacationProjectionPlan,
): string {
  const offset = Math.trunc(toFiniteNumber(plan.incomeCompetencyOffsetMonths) ?? 0);
  return addUtcMonths(paymentDate, offset);
}

function listSuspendedPaymentDates(
  plan: VacationProjectionPlan,
  income: VacationProjectionIncome,
): string[] {
  const offset = Math.trunc(toFiniteNumber(plan.incomeCompetencyOffsetMonths) ?? 0);
  const paymentWindowStart = addUtcMonths(plan.startDate, -offset);
  const paymentWindowEnd = addUtcMonths(getPlanEndDate(plan), -offset);
  const monthReferences = listMonthReferences(
    paymentWindowStart.slice(0, 7),
    paymentWindowEnd.slice(0, 7),
  );

  return monthReferences.flatMap((monthReference) => {
    const paymentDate = resolveMonthlyPaymentDate(monthReference, income);
    if (!paymentDate) return [];
    return isDateInsideVacationPlan(getIncomeCompetencyDate(paymentDate, plan), plan)
      ? [paymentDate]
      : [];
  });
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
  const grossSalaryAmount = Math.max(
    0,
    toFiniteNumber(plan.grossSalaryAmount) ?? monthlyIncome,
  );
  const durationDays = Math.max(1, Math.trunc(plan.durationDays || 1));
  const dailyIncome = grossSalaryAmount / 30;
  const vacationBaseAmount = roundMoney(dailyIncome * durationDays);
  const constitutionalThird = roundMoney(vacationBaseAmount / 3);
  const estimatedVacationPay = roundMoney(vacationBaseAmount + constitutionalThird);
  const suspendedIncome = roundMoney(
    listSuspendedPaymentDates(plan, income).length * monthlyIncome,
  );
  const informedPay = toFiniteNumber(plan.vacationPayAmount);

  return {
    dailyIncome: roundMoney(dailyIncome),
    suspendedIncome,
    grossSalaryAmount: roundMoney(grossSalaryAmount),
    vacationBaseAmount,
    constitutionalThird,
    estimatedVacationPay,
    projectedVacationPay: roundMoney(Math.max(0, informedPay ?? estimatedVacationPay)),
    vacationPayDate: parseUtcDate(plan.vacationPayDate ?? "")
      ? String(plan.vacationPayDate)
      : addUtcDays(plan.startDate, -2),
    endDate: getPlanEndDate(plan),
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
      const paymentDate = resolveMonthlyPaymentDate(params.monthReference, income);
      const competencyDate = paymentDate ? getIncomeCompetencyDate(paymentDate, plan) : null;
      const suspendedIncome = paymentDate && competencyDate && isDateInsideVacationPlan(competencyDate, plan)
        ? roundMoney(monthlyIncome)
        : 0;
      const vacationPayIncome = estimate.vacationPayDate.slice(0, 7) === params.monthReference
        && !(plan.vacationPayReceived && plan.includedInPatrimony)
        ? estimate.projectedVacationPay
        : 0;

      if (affectedDays === 0 && suspendedIncome === 0 && vacationPayIncome === 0) continue;
      planImpacts.push({
        planId: plan.id ?? null,
        rendaId: plan.rendaId,
        affectedDays,
        suspendedIncome,
        vacationPayIncome,
        paymentDate: suspendedIncome > 0 ? paymentDate : null,
        competencyDate: suspendedIncome > 0 ? competencyDate : null,
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
  return buildVacationPlansProjectionMonths([plan], [income]);
}

export function buildVacationPlansProjectionMonths(
  plans: VacationProjectionPlan[],
  incomes: VacationProjectionIncome[],
): VacationProjectionMonth[] {
  if (plans.length === 0 || incomes.length === 0) return [];
  const incomeById = new Map(incomes.map((income) => [income.id, income] as const));
  const estimates = plans.flatMap((plan) => {
    const income = incomeById.get(plan.rendaId);
    if (!income) return [];
    return [{ plan, income, estimate: calculateVacationPlanEstimate(plan, income) }];
  });
  if (estimates.length === 0) return [];

  const relevantReferences = estimates.flatMap(({ plan, income, estimate }) => [
    plan.startDate.slice(0, 7),
    estimate.endDate.slice(0, 7),
    estimate.vacationPayDate.slice(0, 7),
    ...listSuspendedPaymentDates(plan, income).map((date) => date.slice(0, 7)),
  ]).sort();
  const firstReference = relevantReferences[0];
  const lastImpactReference = relevantReferences.at(-1) ?? firstReference;
  const recoveryReference = addUtcMonths(`${lastImpactReference}-01`, 1).slice(0, 7);
  const uniqueIncomes = new Map(estimates.map(({ income }) => [income.id, income] as const));
  const normalIncome = roundMoney(Array.from(uniqueIncomes.values()).reduce(
    (sum, income) => sum + Math.max(0, toFiniteNumber(income.valor) ?? 0),
    0,
  ));

  return listMonthReferences(firstReference, recoveryReference).map((monthReference) => {
    const impact = calculateVacationMonthImpact({
      monthReference,
      plans,
      incomes,
    });
    return {
      ...impact,
      normalIncome,
      projectedIncome: roundMoney(normalIncome + impact.netAdjustment),
    };
  });
}
