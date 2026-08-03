import type {
  FuturePurchaseSimulation,
  InsertFuturePurchaseSimulation,
} from "@shared/schema";
import type { IStorage } from "../storage";
import type { FuturePurchaseSimulationUpsertBodyInput } from "../validators/future-purchase-simulations.validators";

type CreateFuturePurchaseSimulationResult =
  | { created: FuturePurchaseSimulation }
  | { error: "CARD_NOT_FOUND" };

type UpdateFuturePurchaseSimulationResult =
  | { updated: FuturePurchaseSimulation }
  | { error: "SIMULATION_NOT_FOUND" }
  | { error: "CARD_NOT_FOUND" };

function toDecimalString(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function toInsertPayload(
  userId: string,
  payload: FuturePurchaseSimulationUpsertBodyInput,
): InsertFuturePurchaseSimulation {
  return {
    userId,
    nome: payload.nome,
    purchaseName: payload.purchaseName,
    totalAmount: payload.totalAmount.toFixed(2),
    installmentCount: payload.installmentCount,
    cardId: payload.cardId,
    firstInstallmentMonth: payload.firstInstallmentMonth,
    minimumReserve: payload.minimumReserve.toFixed(2),
    includeLiquidAssets: payload.includeLiquidAssets,
    includePersonalDebts: payload.includePersonalDebts,
    includeCardCommitments: payload.includeCardCommitments,
    includeExpectedReceivables: payload.includeExpectedReceivables,
    includePersonalReceivables: payload.includePersonalReceivables,
    includeCardReceivables: payload.includeCardReceivables,
    includeVacationPlans: payload.includeVacationPlans,
    selectedReceivablePersonIds: payload.selectedReceivablePersonIds,
    extraIncomes: payload.extraIncomes,
    resultStatus: payload.resultStatus,
    worstMonth: payload.worstMonth,
    lowestBalance: toDecimalString(payload.lowestBalance),
    safePurchaseAmount: toDecimalString(payload.safePurchaseAmount),
    recommendedInstallments: payload.recommendedInstallments,
    monthlyTimelineSnapshot: payload.monthlyTimelineSnapshot,
  };
}

function sortRows(rows: FuturePurchaseSimulation[]): FuturePurchaseSimulation[] {
  return [...rows].sort((left, right) => (
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
    || String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""))
  ));
}

export class FuturePurchaseSimulationsService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string): Promise<FuturePurchaseSimulation[]> {
    return sortRows(await this.storage.getFuturePurchaseSimulations(userId));
  }

  async get(userId: string, id: string): Promise<FuturePurchaseSimulation | undefined> {
    return this.storage.getFuturePurchaseSimulation(id, userId);
  }

  async create(
    userId: string,
    payload: FuturePurchaseSimulationUpsertBodyInput,
  ): Promise<CreateFuturePurchaseSimulationResult> {
    if (payload.cardId) {
      const card = await this.storage.getCartao(payload.cardId, userId);
      if (!card) return { error: "CARD_NOT_FOUND" };
    }

    const created = await this.storage.createFuturePurchaseSimulation(
      toInsertPayload(userId, payload),
    );
    return { created };
  }

  async update(
    userId: string,
    id: string,
    payload: FuturePurchaseSimulationUpsertBodyInput,
  ): Promise<UpdateFuturePurchaseSimulationResult> {
    const existing = await this.storage.getFuturePurchaseSimulation(id, userId);
    if (!existing) return { error: "SIMULATION_NOT_FOUND" };

    if (payload.cardId) {
      const card = await this.storage.getCartao(payload.cardId, userId);
      if (!card) return { error: "CARD_NOT_FOUND" };
    }

    const { userId: _ignoredUserId, ...updatePayload } = toInsertPayload(userId, payload);
    const updated = await this.storage.updateFuturePurchaseSimulation(
      id,
      userId,
      updatePayload,
    );

    if (!updated) return { error: "SIMULATION_NOT_FOUND" };
    return { updated };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.storage.deleteFuturePurchaseSimulation(id, userId);
  }
}
