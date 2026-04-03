import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type InvestimentoPoint = {
  mes: number;
  bruto: number;
  investido: number;
};

interface InvestimentoProjectionChartProps {
  data: InvestimentoPoint[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function InvestimentoProjectionChart({
  data,
}: InvestimentoProjectionChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorBruto" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="hsl(var(--muted-foreground) / 0.2)"
        />
        <XAxis
          dataKey="mes"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickFormatter={(value) => (value % 12 === 0 ? `${value / 12}a` : "")}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickFormatter={(value) => `R$ ${value / 1000}k`}
        />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          labelFormatter={(label) => `Mes ${label}`}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            borderColor: "hsl(var(--border))",
          }}
        />
        <Area
          type="monotone"
          dataKey="bruto"
          name="Bruto"
          stroke="hsl(var(--primary))"
          fillOpacity={1}
          fill="url(#colorBruto)"
        />
        <Area
          type="monotone"
          dataKey="investido"
          name="Investido"
          stroke="hsl(var(--muted-foreground))"
          fill="none"
          strokeDasharray="5 5"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
