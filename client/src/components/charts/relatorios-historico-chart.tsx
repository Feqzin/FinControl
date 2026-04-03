import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type RelatoriosHistoricoPoint = {
  name: string;
  entradas: number;
  saidas: number;
};

interface RelatoriosHistoricoChartProps {
  data: RelatoriosHistoricoPoint[];
  formatCurrency: (value: number) => string;
}

export default function RelatoriosHistoricoChart({
  data,
  formatCurrency,
}: RelatoriosHistoricoChartProps) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="name" className="text-xs" />
          <YAxis className="text-xs" tickFormatter={(value) => `R$ ${value}`} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Legend />
          <Bar dataKey="entradas" fill="hsl(var(--chart-2))" name="Entradas" radius={[4, 4, 0, 0]} />
          <Bar dataKey="saidas" fill="hsl(var(--chart-1))" name="Saídas" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
