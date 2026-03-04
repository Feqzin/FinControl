import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Divida, Pessoa } from "@shared/schema";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function RelatoriosPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, "yyyy-MM"));

  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const isLoading = l1;

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "—";

  const monthStart = new Date(selectedMonth + "-01");
  const monthEnd = endOfMonth(monthStart);

  const dividasMes = dividas.filter((d) => {
    const dv = d.dataVencimento;
    return dv >= format(monthStart, "yyyy-MM-dd") && dv <= format(monthEnd, "yyyy-MM-dd");
  });

  const recebidoMes = dividasMes
    .filter((d) => d.tipo === "receber" && d.status === "pago")
    .reduce((s, d) => s + Number(d.valor), 0);

  const pagoMes = dividasMes
    .filter((d) => d.tipo === "pagar" && d.status === "pago")
    .reduce((s, d) => s + Number(d.valor), 0);

  const pendenteMes = dividasMes
    .filter((d) => d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);

  const saldoMes = recebidoMes - pagoMes;

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const dividasSemana = dividas.filter((d) => {
    const dv = d.dataVencimento;
    return dv >= format(weekStart, "yyyy-MM-dd") && dv <= format(weekEnd, "yyyy-MM-dd");
  });

  const entradasSemana = dividasSemana
    .filter((d) => d.tipo === "receber")
    .reduce((s, d) => s + Number(d.valor), 0);

  const saidasSemana = dividasSemana
    .filter((d) => d.tipo === "pagar")
    .reduce((s, d) => s + Number(d.valor), 0);

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    const mKey = format(d, "yyyy-MM");
    const mDividas = dividas.filter((dv) => dv.dataVencimento.startsWith(mKey));
    return {
      name: format(d, "MMM"),
      entradas: mDividas.filter((dv) => dv.tipo === "receber" && dv.status === "pago").reduce((s, dv) => s + Number(dv.valor), 0),
      saidas: mDividas.filter((dv) => dv.tipo === "pagar" && dv.status === "pago").reduce((s, dv) => s + Number(dv.valor), 0),
    };
  });

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(now, i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="relatorios-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatorios</h1>
        <p className="text-muted-foreground">Acompanhe seus resultados financeiros</p>
      </div>

      <Tabs defaultValue="mensal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mensal" data-testid="tab-mensal">Mensal</TabsTrigger>
          <TabsTrigger value="semanal" data-testid="tab-semanal">Semanal</TabsTrigger>
        </TabsList>

        <TabsContent value="mensal" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px]" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Recebido</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(recebidoMes)}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Pago</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(pagoMes)}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Pendente</p>
                <p className="text-xl font-bold text-amber-600">{formatCurrency(pendenteMes)}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className={`text-xl font-bold ${saldoMes >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(saldoMes)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Historico (ultimos 6 meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="entradas" fill="hsl(var(--chart-2))" name="Entradas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" fill="hsl(var(--chart-1))" name="Saidas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detalhamento do mes</CardTitle>
            </CardHeader>
            <CardContent>
              {dividasMes.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma movimentacao neste mes</p>
              ) : (
                <div className="space-y-2">
                  {dividasMes.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)).map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{d.dataVencimento}</span>
                        <span className="text-sm font-medium truncate">{getPessoaNome(d.pessoaId)}</span>
                        <Badge variant={d.tipo === "receber" ? "default" : "destructive"}>
                          {d.tipo === "receber" ? "Entrada" : "Saida"}
                        </Badge>
                        <Badge variant={d.status === "pago" ? "secondary" : "outline"}>
                          {d.status}
                        </Badge>
                      </div>
                      <span className={`font-semibold flex-shrink-0 ${d.tipo === "receber" ? "text-emerald-600" : "text-red-600"}`}>
                        {d.tipo === "receber" ? "+" : "-"}{formatCurrency(Number(d.valor))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="semanal" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Semana de {format(weekStart, "dd/MM")} a {format(weekEnd, "dd/MM")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm text-muted-foreground">Entradas</p>
                </div>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(entradasSemana)}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-muted-foreground">Saidas</p>
                </div>
                <p className="text-xl font-bold text-red-600">{formatCurrency(saidasSemana)}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4" />
                  <p className="text-sm text-muted-foreground">Balanco</p>
                </div>
                <p className={`text-xl font-bold ${entradasSemana - saidasSemana >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(entradasSemana - saidasSemana)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Movimentacoes da semana</CardTitle>
            </CardHeader>
            <CardContent>
              {dividasSemana.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma movimentacao esta semana</p>
              ) : (
                <div className="space-y-2">
                  {dividasSemana.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)).map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{d.dataVencimento}</span>
                        <span className="text-sm font-medium truncate">{getPessoaNome(d.pessoaId)}</span>
                        <Badge variant={d.tipo === "receber" ? "default" : "destructive"}>
                          {d.tipo === "receber" ? "Entrada" : "Saida"}
                        </Badge>
                      </div>
                      <span className={`font-semibold flex-shrink-0 ${d.tipo === "receber" ? "text-emerald-600" : "text-red-600"}`}>
                        {d.tipo === "receber" ? "+" : "-"}{formatCurrency(Number(d.valor))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
