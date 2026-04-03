import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
} from "recharts";

type HistoricoItem = {
  label: string;
  receitas: number;
  despesas: number;
  saldo: number;
};

type ScoreHistoricoItem = {
  label: string;
  score: number;
};

interface HistoricoOverviewChartsProps {
  historico: HistoricoItem[];
  scoreHistorico: ScoreHistoricoItem[];
  formatCurrency: (value: number) => string;
  formatCurrencyShort: (value: number) => string;
}

function TooltipCustom({
  active,
  payload,
  label,
  formatCurrency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; color: string; value: number }>;
  label?: string;
  formatCurrency: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
      <p className="font-semibold">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: {formatCurrency(item.value)}
        </p>
      ))}
    </div>
  );
}

export default function HistoricoOverviewCharts({
  historico,
  scoreHistorico,
  formatCurrency,
  formatCurrencyShort,
}: HistoricoOverviewChartsProps) {
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Receitas vs Despesas por mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64" data-testid="chart-receitas-despesas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCurrencyShort}
                  width={60}
                />
                <Tooltip
                  content={
                    <TooltipCustom formatCurrency={formatCurrency} />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="receitas"
                  name="Receitas"
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="despesas"
                  name="Despesas"
                  fill="hsl(var(--chart-3))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Evolução do saldo mensal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52" data-testid="chart-saldo-historico">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCurrencyShort}
                  width={60}
                />
                <Tooltip
                  content={
                    <TooltipCustom formatCurrency={formatCurrency} />
                  }
                />
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Evolução do Score financeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48" data-testid="chart-score-historico">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreHistorico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(value: number) => [`${value}/100`, "Score"]} />
                <ReferenceLine
                  y={80}
                  stroke="hsl(var(--chart-2))"
                  strokeDasharray="4 2"
                  label={{ value: "Ótimo", position: "right", fontSize: 10 }}
                />
                <ReferenceLine
                  y={40}
                  stroke="hsl(var(--chart-3))"
                  strokeDasharray="4 2"
                  label={{ value: "Risco", position: "right", fontSize: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center">
            <span className="text-emerald-600">80+ Ótima</span>
            <span className="text-primary">60-79 Boa</span>
            <span className="text-amber-600">40-59 Atenção</span>
            <span className="text-red-600">Abaixo de 40 Risco</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
