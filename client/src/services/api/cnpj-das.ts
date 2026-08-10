import { apiRequest } from "@/lib/queryClient";
import type { DasMeiCalculation, MeiActivity } from "@shared/das-mei";

export type CnpjDasOverride = {
  principal?: number | null;
  dueDate?: string | null;
  beneficioInss?: boolean;
};

export type CnpjDasCalculationPayload = {
  atividade: MeiActivity;
  competenciaInicial: string;
  competenciaFinal: string;
  dataCalculo: string;
  overrides: Record<string, CnpjDasOverride>;
};

export type CnpjDasHistoryItem = {
  id: string;
  dataCalculo: string;
  principal: string;
  multaValor: string;
  jurosValor: string;
  total: string;
  createdAt: string;
};

export type CnpjDasObligationView = {
  id: string;
  competencia: string;
  dataVencimento: string;
  dataCalculo: string;
  principal: string;
  multaValor: string;
  jurosValor: string;
  total: string;
  debtStatus: string;
  debtDeletedAt: string | null;
  history: CnpjDasHistoryItem[];
};

export type CnpjDasCompanyView = {
  id: string;
  cnpj: string;
  nome: string;
  atividadeMei: MeiActivity;
  obligations: CnpjDasObligationView[];
};

export async function previewCnpjDas(payload: CnpjDasCalculationPayload): Promise<DasMeiCalculation[]> {
  const response = await apiRequest("POST", "/api/cnpj-das/preview", payload);
  return response.json();
}

export async function saveCnpjDas(payload: CnpjDasCalculationPayload & {
  cnpj: string;
  nome: string;
  competenciasSelecionadas: string[];
}): Promise<{ skippedPaid: number }> {
  const response = await apiRequest("POST", "/api/cnpj-das", payload);
  return response.json();
}

export async function listCnpjDas(): Promise<CnpjDasCompanyView[]> {
  const response = await apiRequest("GET", "/api/cnpj-das");
  return response.json();
}

export async function recalculateCnpjDas(companyId: string, dataCalculo: string): Promise<{
  updated: number;
  skippedPaid: number;
}> {
  const response = await apiRequest("POST", `/api/cnpj-das/${companyId}/recalculate`, { dataCalculo });
  return response.json();
}
