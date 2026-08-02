import type { InsertVacationPlan, VacationPlan } from "@shared/schema";
import { vacationPlansOverlap } from "@shared/vacation-planning";
import type { IStorage } from "../storage";
import type { VacationPlanCreateBodyInput } from "../validators/vacation-plans.validators";

type CreateVacationPlanResult =
  | { created: VacationPlan }
  | { error: "INCOME_NOT_FOUND" | "INCOME_NOT_FIXED" | "INCOME_INACTIVE" | "OVERLAPPING_PLAN" };

function toInsertPayload(userId: string, payload: VacationPlanCreateBodyInput): InsertVacationPlan {
  return {
    userId,
    rendaId: payload.rendaId,
    startDate: payload.startDate,
    durationDays: payload.durationDays,
    vacationPayReceived: payload.vacationPayReceived,
    vacationPayDate: payload.vacationPayDate,
    vacationPayAmount: payload.vacationPayAmount == null ? null : payload.vacationPayAmount.toFixed(2),
    includedInPatrimony: payload.includedInPatrimony,
  };
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
      created: await this.storage.createVacationPlan(toInsertPayload(userId, payload)),
    };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.storage.deleteVacationPlan(id, userId);
  }
}
