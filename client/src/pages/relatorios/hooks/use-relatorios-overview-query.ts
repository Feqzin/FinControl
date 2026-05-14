import { useQuery } from "@tanstack/react-query";
import { fetchReportsOverview, type ReportsOverviewParams } from "@/services/api/reports";

export function useRelatoriosOverviewQuery(params: ReportsOverviewParams) {
  return useQuery({
    queryKey: ["/api/reports/overview", params.startDate ?? null, params.endDate ?? null],
    queryFn: () => fetchReportsOverview(params),
    staleTime: 30_000,
  });
}
