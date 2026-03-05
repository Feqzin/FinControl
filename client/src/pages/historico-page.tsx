import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { Divida, Servico, Cartao, CompraCartao, Renda } from "@shared/schema";
import { gerarHistoricoMensal, calcularScore } from "@/utils/financialEngine";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function formatCurrencyShort(v: number): string {
  if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
}

const TooltipCustom = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p className="font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

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
        <h1 className="text-2xl font-bold tracking-tight">Historico Financeiro</h1>
        <p className="text-muted-foreground">Evolucao dos ultimos 6 meses</p>
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
            <p className="text-sm text-muted-foreground mb-1">Receitas (variacao)</p>
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
            <p className="text-sm text-muted-foreground mb-1">Despesas (variacao)</p>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Receitas vs Despesas por mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64" data-testid="chart-receitas-despesas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={formatCurrencyShort} width={60} />
                <Tooltip content={<TooltipCustom />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Evolucao do saldo mensal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52" data-testid="chart-saldo-historico">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={formatCurrencyShort} width={60} />
                <Tooltip content={<TooltipCustom />} />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 2" strokeWidth={1.5} />
                <Line type="monotone" dataKey="saldo" name="Saldo" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Evolucao do Score financeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48" data-testid="chart-score-historico">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreHistorico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: any) => [`${v}/100`, "Score"]} />
                <ReferenceLine y={80} stroke="hsl(var(--chart-2))" strokeDasharray="4 2" label={{ value: "Otimo", position: "right", fontSize: 10 }} />
                <ReferenceLine y={40} stroke="hsl(var(--chart-3))" strokeDasharray="4 2" label={{ value: "Risco", position: "right", fontSize: 10 }} />
                <Line type="monotone" dataKey="score" name="Score" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center">
            <span className="text-emerald-600">80+ Otima</span>
            <span className="text-primary">60-79 Boa</span>
            <span className="text-amber-600">40-59 Atencao</span>
            <span className="text-red-600">Abaixo de 40 Risco</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
