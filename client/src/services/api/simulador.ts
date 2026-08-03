import type {
  FuturePurchaseSimulation,
  FuturePurchaseSimulationStoredExtraIncome,
  FuturePurchaseSimulationStoredTimelineSnapshot,
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export type FuturePurchaseSimulationPayload = {
  nome: string;
  purchaseName: string | null;
  totalAmount: number;
  installmentCount: number;
  cardId: string | null;
  firstInstallmentMonth: string;
  minimumReserve: number;
  includeLiquidAssets: boolean;
  includePersonalDebts: boolean;
  includeCardCommitments: boolean;
  includeExpectedReceivables: boolean;
  includePersonalReceivables: boolean;
  includeCardReceivables: boolean;
  selectedReceivablePersonIds: string[];
  extraIncomes: FuturePurchaseSimulationStoredExtraIncome[];
  resultStatus: "Pode comprar" | "Atenção" | "Não recomendado" | null;
  worstMonth: string | null;
  lowestBalance: number | null;
  safePurchaseAmount: number | null;
  recommendedInstallments: number | null;
  monthlyTimelineSnapshot: FuturePurchaseSimulationStoredTimelineSnapshot[];
};

export async function listFuturePurchaseSimulations(): Promise<FuturePurchaseSimulation[]> {
  const response = await apiRequest("GET", "/api/simulador/compra-futura/simulacoes");
  return response.json();
}

export async function getFuturePurchaseSimulation(id: string): Promise<FuturePurchaseSimulation> {
  const response = await apiRequest("GET", `/api/simulador/compra-futura/simulacoes/${id}`);
  return response.json();
}

export async function createFuturePurchaseSimulation(
  payload: FuturePurchaseSimulationPayload,
): Promise<FuturePurchaseSimulation> {
  const response = await apiRequest("POST", "/api/simulador/compra-futura/simulacoes", payload);
  return response.json();
}

export async function updateFuturePurchaseSimulation(
  id: string,
  payload: FuturePurchaseSimulationPayload,
): Promise<FuturePurchaseSimulation> {
  const response = await apiRequest("PATCH", `/api/simulador/compra-futura/simulacoes/${id}`, payload);
  return response.json();
}

export async function deleteFuturePurchaseSimulation(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/simulador/compra-futura/simulacoes/${id}`);
}
