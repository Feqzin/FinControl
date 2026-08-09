import type { InsertVacationPlan, Renda, VacationPlan } from "@shared/schema";
import { vacationPlansOverlap } from "@shared/vacation-planning";
import type { IStorage } from "../storage";
import type {
  VacationPlanCreateBodyInput,
  VacationPlansBatchCreateBodyInput,
} from "../validators/vacation-plans.validators";

type VacationPlanError = "INCOME_NOT_FOUND" | "INCOME_NOT_FIXED" | "INCOME_INACTIVE" | "OVERLAPPING_PLAN";
type CreateVacationPlanResult =
  | { created: VacationPlan }
  | { error: VacationPlanError };
type CreateVacationPlansResult =
  | { created: VacationPlan[] }
  | { error: VacationPlanError };

type VacationPlanCommonInput = {
  startDate: string;
  durationDays: number;
  vacationPayReceived: boolean;
  vacationPayDate: string | null;
  includedInPatrimony: boolean;
};

function toInsertPayload(
  userId: string,
  payload: VacationPlanCommonInput,
  rendaId: string,
  vacationPayAmount: number | null,
  grossSalaryAmount: number | null,
  incomeCompetencyOffsetMonths: -1 | 0,
): InsertVacationPlan {
  return {
    userId,
    rendaId,
    startDate: payload.startDate,
    durationDays: payload.durationDays,
    vacationPayReceived: payload.vacationPayReceived,
    vacationPayDate: payload.vacationPayDate,
    vacationPayAmount: vacationPayAmount == null ? null : vacationPayAmount.toFixed(2),
    grossSalaryAmount: grossSalaryAmount == null ? null : grossSalaryAmount.toFixed(2),
    incomeCompetencyOffsetMonths,
    includedInPatrimony: payload.includedInPatrimony,
  };
}

function distributeAmount(totalAmount: number | null, incomes: Renda[]): Array<number | null> {
  if (totalAmount == null) return incomes.map(() => null);
  const totalCents = Math.round(totalAmount * 100);
  const incomeWeights = incomes.map((income) => Math.max(0, Number(income.valor) || 0));
  const totalWeight = incomeWeights.reduce((sum, value) => sum + value, 0);
  const weights = totalWeight > 0 ? incomeWeights : incomes.map(() => 1);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  let remainingCents = totalCents;

  return weights.map((weight, index) => {
    const cents = index === weights.length - 1
      ? remainingCents
      : Math.min(remainingCents, Math.round(totalCents * (weight / weightSum)));
    remainingCents -= cents;
    return cents / 100;
  });
}

export class VacationPlansService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string): Promise<VacationPlan[]> {
    const rows = await this.storage.getVacationPlans(userId);
    return [...rows].sort((left, right) => right.startDate.localeCompare(left.startDate));
  }

  async create(userId: string, payload: VacationPlanCreateBodyInput): Promise<CreateVacationPlanResult> {
    const incomes = await this.storage.getRendas(userId);
    const income = incomes.find((item) => item.id === payload.rendaId);
    if (!income) return { error: "INCOME_NOT_FOUND" };
    if (income.tipo !== "fixo") return { error: "INCOME_NOT_FIXED" };
    if (!income.ativo) return { error: "INCOME_INACTIVE" };

    const existingPlans = await this.storage.getVacationPlans(userId);
    const overlaps = existingPlans.some((plan) => (
      plan.rendaId === payload.rendaId
      && vacationPlansOverlap(plan, payload)
    ));
    if (overlaps) return { error: "OVERLAPPING_PLAN" };

    return {
      created: await this.storage.createVacationPlan(
        toInsertPayload(
          userId,
          payload,
          payload.rendaId,
          payload.vacationPayAmount,
          payload.grossSalaryAmount,
          payload.incomeCompetencyOffsetMonths,
        ),
      ),
    };
  }

  async createMany(userId: string, payload: VacationPlansBatchCreateBodyInput): Promise<CreateVacationPlansResult> {
    const incomes = await this.storage.getRendas(userId);
    const incomeById = new Map(incomes.map((income) => [income.id, income] as const));
    const selectedIncomes: Renda[] = [];

    for (const rendaId of payload.rendaIds) {
      const income = incomeById.get(rendaId);
      if (!income) return { error: "INCOME_NOT_FOUND" };
      if (income.tipo !== "fixo") return { error: "INCOME_NOT_FIXED" };
      if (!income.ativo) return { error: "INCOME_INACTIVE" };
      selectedIncomes.push(income);
    }

    const selectedIds = new Set(payload.rendaIds);
    const existingPlans = await this.storage.getVacationPlans(userId);
    const overlaps = existingPlans.some((plan) => (
      selectedIds.has(plan.rendaId)
      && vacationPlansOverlap(plan, payload)
    ));
    if (overlaps) return { error: "OVERLAPPING_PLAN" };

    const allocatedVacationPayAmounts = distributeAmount(payload.vacationPayAmount, selectedIncomes);
    const allocatedGrossSalaryAmounts = distributeAmount(payload.grossSalaryAmount, selectedIncomes);
    const rows = selectedIncomes.map((income, index) => toInsertPayload(
      userId,
      payload,
      income.id,
      allocatedVacationPayAmounts[index] ?? null,
      allocatedGrossSalaryAmounts[index] ?? null,
      payload.competencyOffsetMonthsByIncomeId[income.id] ?? 0,
    ));

    return { created: await this.storage.createVacationPlans(rows) };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.storage.deleteVacationPlan(id, userId);
  }
}
