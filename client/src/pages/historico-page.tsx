import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { Divida, Servico, Cartao, CompraCartao, Renda } from "@shared/schema";
import { gerarHistoricoMensal, calcularScore } from "@/utils/financialEngine";

const HistoricoOverviewCharts = lazy(
  () => import("@/components/charts/historico-overview-charts"),
);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function formatCurrencyShort(v: number): string {
  if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
}

export default function HistoricoPage() {
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: rendas = [] } = useQuery<Renda[]>({ queryKey: ["/api/rendas"] });

  const isLoading = l1 || l2;

  const historico = gerarHistoricoMensal(dividas, servicos, 6, rendas);
  const score = calcularScore(dividas, servicos, cartoes, compras, rendas);

  const ultimoMes = historico[historico.length - 1];
  const penultimoMes = historico[historico.length - 2];

  const variacaoReceitas = penultimoMes?.receitas > 0
    ? ((ultimoMes.receitas - penultimoMes.receitas) / penultimoMes.receitas) * 100
    : 0;
  const variacaoDespesas = penultimoMes?.despesas > 0
    ? ((ultimoMes.despesas - penultimoMes.despesas) / penultimoMes.despesas) * 100
    : 0;

  const scoreHistorico = historico.map((h) => ({
    ...h,
    score: Math.min(100, Math.max(0,
      60 +
      (h.saldo > 0 ? 15 : -15) +
      (h.dividasQuitadas > 0 ? 10 : 0) -
      (h.dividasPendentes * 3)
    )),
  }));

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="historico-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Histórico Financeiro</h1>
        <p className="text-muted-foreground">Evolução dos últimos 6 meses</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Score atual</p>
            <div className="flex items-end gap-2">
              <p className={`text-3xl font-bold ${
                score.valor >= 80 ? "text-emerald-600" : score.valor >= 60 ? "text-primary" : score.valor >= 40 ? "text-amber-600" : "text-red-600"
              }`}>{score.valor}</p>
              <p className="text-sm text-muted-foreground mb-1">/100 · {score.classificacao}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Receitas (variação)</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{formatCurrency(ultimoMes?.receitas || 0)}</p>
              {variacaoReceitas !== 0 && (
                <span className={`text-sm font-medium flex items-center ${variacaoReceitas > 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {variacaoReceitas > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(variacaoReceitas).toFixed(0)}%
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Despesas (variação)</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{formatCurrency(ultimoMes?.despesas || 0)}</p>
              {variacaoDespesas !== 0 && (
                <span className={`text-sm font-medium flex items-center ${variacaoDespesas < 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {variacaoDespesas > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(variacaoDespesas).toFixed(0)}%
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        }
      >
        <HistoricoOverviewCharts
          historico={historico}
          scoreHistorico={scoreHistorico}
          formatCurrency={formatCurrency}
          formatCurrencyShort={formatCurrencyShort}
        />
      </Suspense>
    </div>
  );
}
