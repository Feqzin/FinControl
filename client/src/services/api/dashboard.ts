import type { FinancialSummary } from "@shared/financial";
import { apiRequest } from "@/lib/queryClient";

export async function fetchFinancialSummary(month: string): Promise<FinancialSummary> {
  const res = await apiRequest("GET", `/api/financial/summary?month=${encodeURIComponent(month)}`);
  return res.json();
}
