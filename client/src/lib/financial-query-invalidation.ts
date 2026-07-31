type FinancialQueryClient = {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => Promise<unknown>;
};

export const FINANCIAL_QUERY_ROOTS = [
  ["/api/dashboard/overview"],
  ["/api/financial/summary"],
  ["/api/financial/score"],
  ["/api/financial/insights"],
  ["/api/reports/overview"],
  ["/api/dividas"],
  ["/api/parcelas"],
  ["/api/pessoas"],
] as const;

export async function invalidateFinancialQueries(queryClient: FinancialQueryClient) {
  await Promise.all(
    FINANCIAL_QUERY_ROOTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
