import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";
import type { Divida, Servico } from "@shared/schema";
import { format, getDaysInMonth, startOfMonth } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatCurrencyShort(value: number): string {
  if (Math.abs(value) >= 1000) return `R$${(value / 1000).toFixed(1)}k`;
  return `R$${value.toFixed(0)}`;
}

export default function PrevisaoPage() {
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const isLoading = l1 || l2;

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const daysInMonth = getDaysInMonth(now);
  const currentDay = now.getDate();

  const receberMes = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const pagarDividas = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const servicosMes = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + Number(sv.valorMensal), 0);

  const totalSaida = pagarDividas + servicosMes;
  const saldoPrevisto = receberMes - totalSaida;

  const entradasMes = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

  const saidasDividas = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

  const chartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = `${currentMonth}-${String(day).padStart(2, "0")}`;
    let entradas = 0;
    let saidas = 0;

    for (const d of dividas) {
      if (d.status === "pendente" && d.dataVencimento === dayStr) {
        if (d.tipo === "receber") entradas += Number(d.valor);
        else saidas += Number(d.valor);
      }
    }

    for (const s of servicos) {
      if (s.status === "ativo" && Number(s.dataCobranca) === day) {
        saidas += Number(s.valorMensal);
      }
    }

    return { dia: day, entradas, saidas };
  });

  let cumulativo = 0;
  const chartDataWithBalance = chartData.map((d) => {
    cumulativo += d.entradas - d.saidas;
    return { ...d, saldo: Math.round(cumulativo * 100) / 100 };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (
      <div className="rounded-md border bg-card p-3 shadow-md text-sm space-y-1">
        <p className="font-semibold">Dia {label}</p>
        {data.entradas > 0 && <p className="text-emerald-600">+{formatCurrency(data.entradas)}</p>}
        {data.saidas > 0 && <p className="text-red-600">-{formatCurrency(data.saidas)}</p>}
        <p className={`font-bold ${data.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          Saldo: {formatCurrency(data.saldo)}
        </p>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="previsao-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Previsao de Entrada e Saida</h1>
        <p className="text-muted-foreground">Projecao financeira para {format(now, "MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-emerald-500/10">
                <ArrowUpRight className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total a receber</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(receberMes)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{entradasMes.length} lancamento(s) este mes</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-red-500/10">
                <ArrowDownRight className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total a pagar</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalSaida)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {saidasDividas.length} divida(s) + {servicos.filter((s) => s.status === "ativo").length} servico(s)
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-md ${saldoPrevisto >= 0 ? "bg-primary/10" : "bg-red-500/10"}`}>
                {saldoPrevisto >= 0
                  ? <TrendingUp className="w-5 h-5 text-primary" />
                  : <TrendingDown className="w-5 h-5 text-red-600" />
                }
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saldo previsto</p>
                <p className={`text-2xl font-bold ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(saldoPrevisto)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Receitas - Despesas</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Curva de saldo ao longo do mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56" data-testid="chart-saldo-mes">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartDataWithBalance} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  tickFormatter={(d) => `${d}`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCurrencyShort}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 2" strokeWidth={1.5} />
                <ReferenceLine
                  x={currentDay}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 2"
                  label={{ value: "Hoje", position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Saldo acumulado dia a dia com base nas datas de vencimento
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Entradas previstas ({entradasMes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entradasMes.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma entrada prevista</p>
            ) : (
              <div className="space-y-2">
                {entradasMes.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">{d.descricao || "Divida"}</p>
                      <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                    </div>
                    <span className="font-semibold text-emerald-600">{formatCurrency(Number(d.valor))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
              Saidas previstas ({saidasDividas.length + servicos.filter((s) => s.status === "ativo").length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {servicos.filter((s) => s.status === "ativo").map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{s.nome}</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary">{s.categoria}</Badge>
                      <span className="text-xs text-muted-foreground">Dia {s.dataCobranca}</span>
                    </div>
                  </div>
                  <span className="font-semibold text-red-600">{formatCurrency(Number(s.valorMensal))}</span>
                </div>
              ))}
              {saidasDividas.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{d.descricao || "Divida"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="font-semibold text-red-600">{formatCurrency(Number(d.valor))}</span>
                </div>
              ))}
              {saidasDividas.length === 0 && servicos.filter((s) => s.status === "ativo").length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma saida prevista</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
