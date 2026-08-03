import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FuturePurchaseSimulationMonth } from "@/pages/simulador/future-purchase-simulation";

type FuturePurchaseBalanceChartProps = {
  months: FuturePurchaseSimulationMonth[];
  minimumReserve: number;
  formatCurrency: (value: number) => string;
};

function formatShortCurrency(value: number): string {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`;
  if (absoluteValue >= 1_000) return `R$ ${(value / 1_000).toFixed(1)} mil`;
  return `R$ ${Math.round(value)}`;
}

function getBarColor(month: FuturePurchaseSimulationMonth): string {
  if (month.belowZero) return "hsl(var(--destructive))";
  if (month.belowReserve) return "#f59e0b";
  return "#10b981";
}

export function FuturePurchaseBalanceChart({
  months,
  minimumReserve,
  formatCurrency,
}: FuturePurchaseBalanceChartProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-500" /> Verde: dinheiro suficiente</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-amber-500" /> Amarelo: abaixo da reserva</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-500" /> Vermelho: faltaria dinheiro</span>
      </div>

      <div className="h-72 w-full" data-testid="future-purchase-balance-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 16, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              interval="preserveStartEnd"
              minTickGap={26}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={formatShortCurrency}
              width={72}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.45)" }}
              content={({ active, payload }) => {
                const month = payload?.[0]?.payload as FuturePurchaseSimulationMonth | undefined;
                if (!active || !month) return null;
                return (
                  <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
                    <p className="font-semibold text-foreground">{month.label}</p>
                    <p className="mt-1 text-muted-foreground">Saldo final: <span className="font-semibold text-foreground">{formatCurrency(month.endingBalance)}</span></p>
                    <p className="text-muted-foreground">Entrou: {formatCurrency(month.actualIncome + month.simulatedExtraIncome)}</p>
                    <p className="text-muted-foreground">Saiu: {formatCurrency(month.actualExpenses + month.simulatedInstallment)}</p>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="5 4" />
            {minimumReserve > 0 ? (
              <ReferenceLine
                y={minimumReserve}
                stroke="#f59e0b"
                strokeDasharray="5 4"
                label={{ value: "Reserva", position: "insideTopRight", fill: "#b45309", fontSize: 10 }}
              />
            ) : null}
            <Bar dataKey="endingBalance" radius={[6, 6, 0, 0]} maxBarSize={38}>
              {months.map((month) => <Cell key={month.monthReference} fill={getBarColor(month)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
