import type { ReportsOverviewResponse } from "@shared/reports";
import { apiRequest } from "@/lib/queryClient";

export type ReportsOverviewParams = {
  startDate?: string;
  endDate?: string;
};

function buildReportsOverviewQuery(params: ReportsOverviewParams = {}) {
  const search = new URLSearchParams();
  if (params.startDate) search.set("startDate", params.startDate);
  if (params.endDate) search.set("endDate", params.endDate);
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function fetchReportsOverview(params: ReportsOverviewParams = {}): Promise<ReportsOverviewResponse> {
  const response = await apiRequest("GET", `/api/reports/overview${buildReportsOverviewQuery(params)}`);
  return response.json();
}
