import { useQuery } from "@tanstack/react-query";
import type { Divida, Servico } from "@shared/schema";
import type { FinancialScore } from "@shared/financial";

type UseSimuladorQueriesArgs = {
  shouldSimulateScore: boolean;
  quitarDivida: number;
  reducaoDespesas: number;
};

export function useSimuladorQueries({
  shouldSimulateScore,
  quitarDivida,
  reducaoDespesas,
}: UseSimuladorQueriesArgs) {
  const { data: dividas = [], isLoading: loadingDividas } = useQuery<Divida[]>({
    queryKey: ["/api/dividas"],
  });
  const { data: servicos = [], isLoading: loadingServicos } = useQuery<Servico[]>({
    queryKey: ["/api/servicos"],
  });
  const { data: baseScoreData, isLoading: loadingBaseScore } = useQuery<FinancialScore>({
    queryKey: ["/api/financial/score"],
  });
  const { data: simScoreData, isLoading: loadingSimScore } = useQuery<FinancialScore>({
    queryKey: ["/api/financial/score", "sim", quitarDivida, reducaoDespesas],
    enabled: shouldSimulateScore,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (quitarDivida > 0) params.set("quitarDivida", String(quitarDivida));
      if (reducaoDespesas > 0) params.set("reducaoDespesas", String(reducaoDespesas));
      const q = params.toString();
      const res = await fetch(`/api/financial/score${q ? `?${q}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  return {
    dividas,
    servicos,
    baseScoreData,
    simScoreData,
    isLoading: loadingDividas || loadingServicos || loadingBaseScore,
    isSimScoreLoading: shouldSimulateScore && loadingSimScore,
  };
}
