import type { VacationPlan } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export type CreateVacationPlanPayload = {
  rendaId: string;
  startDate: string;
  durationDays: number;
  vacationPayReceived: boolean;
  vacationPayDate: string | null;
  vacationPayAmount: number | null;
  grossSalaryAmount: number | null;
  incomeCompetencyOffsetMonths: -1 | 0;
  includedInPatrimony: boolean;
};

export type CreateVacationPlansPayload = Omit<CreateVacationPlanPayload, "rendaId" | "incomeCompetencyOffsetMonths"> & {
  rendaIds: string[];
  competencyOffsetMonthsByIncomeId: Record<string, -1 | 0>;
};

export async function fetchVacationPlans(): Promise<VacationPlan[]> {
  const response = await fetch("/api/vacation-plans", { credentials: "include" });
  if (!response.ok) {
    const message = (await response.text()) || response.statusText;
    throw new Error(`${response.status}: ${message}`);
  }
  return response.json();
}

export async function createVacationPlan(payload: CreateVacationPlanPayload): Promise<VacationPlan> {
  const response = await apiRequest("POST", "/api/vacation-plans", payload);
  return response.json();
}

export async function createVacationPlans(payload: CreateVacationPlansPayload): Promise<VacationPlan[]> {
  const response = await apiRequest("POST", "/api/vacation-plans/batch", payload);
  return response.json();
}

export async function deleteVacationPlan(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/vacation-plans/${id}`);
}
