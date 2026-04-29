import type { FinancialSummary } from "@shared/financial";
import { apiRequest } from "@/lib/queryClient";

const DASHBOARD_SUMMARY_TIMEOUT_MS = 12_000;

export async function fetchFinancialSummary(month: string): Promise<FinancialSummary> {
  const startedAt = Date.now();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Tempo limite ao carregar resumo financeiro do mês."));
    }, DASHBOARD_SUMMARY_TIMEOUT_MS);
  });

  const response = await Promise.race([
    apiRequest("GET", `/api/financial/summary?month=${encodeURIComponent(month)}`),
    timeoutPromise,
  ]);

  const durationMs = Date.now() - startedAt;
  if (durationMs >= 3_000) {
    console.warn(`[dashboard] query lenta: resumo financeiro (${durationMs}ms)`);
  }

  return response.json();
}
