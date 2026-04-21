import { apiRequest } from "@/lib/queryClient";

export async function createDividaSimples(payload: Record<string, unknown>): Promise<void> {
  await apiRequest("POST", "/api/dividas", payload);
}

export async function createDividaParcelada(payload: Record<string, unknown>): Promise<void> {
  await apiRequest("POST", "/api/dividas/parcelado", payload);
}

export async function updateParcela(id: string, payload: Record<string, unknown>): Promise<void> {
  await apiRequest("PATCH", `/api/parcelas/${id}`, payload);
}

export async function anteciparParcelas(payload: { dividaId: string; quantidade: number; formaPagamento: string }): Promise<unknown> {
  const res = await apiRequest("POST", "/api/parcelas/antecipar", payload);
  return res.json();
}

export async function deleteDivida(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/dividas/${id}`);
}

export async function updateDivida(id: string, payload: Record<string, unknown>): Promise<void> {
  await apiRequest("PATCH", `/api/dividas/${id}`, payload);
}

export async function recalcularDivida(payload: { id: string; novoTotal: number; primeiroVencimento?: string }): Promise<unknown> {
  const res = await apiRequest("POST", `/api/dividas/${payload.id}/recalcular`, {
    novoTotal: payload.novoTotal,
    primeiroVencimento: payload.primeiroVencimento || undefined,
  });
  return res.json();
}
