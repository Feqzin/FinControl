import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

type PrevisaoSaldoPoint = {
  dia: number;
  entradas: number;
  saidas: number;
  saldo: number;
};

interface PrevisaoSaldoChartProps {
  data: PrevisaoSaldoPoint[];
  currentDay: number;
  formatCurrency: (value: number) => string;
  formatCurrencyShort: (value: number) => string;
  maskCurrency: (value: string) => string;
}

export default function PrevisaoSaldoChart({
  data,
  currentDay,
  formatCurrency,
  formatCurrencyShort,
  maskCurrency,
}: PrevisaoSaldoChartProps) {
  const customTooltip = ({
    active,
    payload,
    label,
  }: any) => {
    if (!active || !payload?.length) return null;
    const tooltipData = payload[0]?.payload as PrevisaoSaldoPoint | undefined;
    if (!tooltipData) return null;

    return (
      <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
        <p className="font-semibold">Dia {label}</p>
        {tooltipData.entradas > 0 && (
          <p className="text-emerald-600">
            +{maskCurrency(formatCurrency(tooltipData.entradas))}
          </p>
        )}
        {tooltipData.saidas > 0 && (
          <p className="text-red-600">
            -{maskCurrency(formatCurrency(tooltipData.saidas))}
          </p>
        )}
        <p
          className={`font-bold ${
            tooltipData.saldo >= 0 ? "text-emerald-600" : "text-red-600"
          }`}
        >
          Saldo: {maskCurrency(formatCurrency(tooltipData.saldo))}
        </p>
      </div>
    );
  };

  return (
    <div className="h-56" data-testid="chart-saldo-mes">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="dia"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCurrencyShort}
            width={60}
          />
          <Tooltip content={customTooltip} />
          <ReferenceLine
            y={0}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 2"
            strokeWidth={1.5}
          />
          <ReferenceLine
            x={currentDay}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 2"
            label={{
              value: "Hoje",
              position: "top",
              fontSize: 10,
              fill: "hsl(var(--muted-foreground))",
            }}
          />
          <Area
            type="monotone"
            dataKey="saldo"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#saldoGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
