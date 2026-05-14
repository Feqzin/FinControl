import { useQuery } from "@tanstack/react-query";
import { fetchReportsOverview, type ReportsOverviewParams } from "@/services/api/reports";

type UseRelatoriosOverviewQueryOptions = {
  enabled?: boolean;
};

export function useRelatoriosOverviewQuery(
  params: ReportsOverviewParams,
  options: UseRelatoriosOverviewQueryOptions = {},
) {
  return useQuery({
    queryKey: ["/api/reports/overview", params.startDate ?? null, params.endDate ?? null],
    queryFn: () => fetchReportsOverview(params),
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
}
