import type { DashboardOverviewResponse, FinancialSummary } from "@shared/financial";

const DASHBOARD_TIMEOUT_MS = 12_000;

async function fetchDashboardData<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Tempo limite ao carregar seus dados. Tente novamente.")), DASHBOARD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "include", signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status}: ${(await response.text()) || response.statusText}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export function fetchFinancialSummary(month: string, signal?: AbortSignal): Promise<FinancialSummary> {
  return fetchDashboardData(`/api/financial/summary?month=${encodeURIComponent(month)}`, signal);
}

export function fetchDashboardOverview(month: string, signal?: AbortSignal): Promise<DashboardOverviewResponse> {
  return fetchDashboardData(`/api/dashboard/overview?month=${encodeURIComponent(month)}`, signal);
}
