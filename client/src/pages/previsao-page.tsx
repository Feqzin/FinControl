import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import type { Divida, Servico, Renda } from "@shared/schema";
import { format, getDaysInMonth } from "date-fns";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";

const PrevisaoSaldoChart = lazy(
  () => import("@/components/charts/previsao-saldo-chart"),
);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatCurrencyShort(value: number): string {
  if (Math.abs(value) >= 1000) return `R$${(value / 1000).toFixed(1)}k`;
  return `R$${value.toFixed(0)}`;
}

export default function PrevisaoPage() {
  const { visible } = useValuesVisibility();
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: rendas = [], isLoading: l3 } = useQuery<Renda[]>({ queryKey: ["/api/rendas"] });
  const isLoading = l1 || l2 || l3;

  const mask = (v: string) => maskValue(v, visible);

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const daysInMonth = getDaysInMonth(now);
  const currentDay = now.getDate();

  const rendasAtivas = rendas.filter((r) => r.ativo);
  const rendaMensal = rendasAtivas.reduce((s, r) => s + Number(r.valor), 0);

  const receberDividas = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalEntradas = rendaMensal + receberDividas;

  const pagarDividas = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const servicosMes = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + Number(sv.valorMensal), 0);

  const totalSaida = pagarDividas + servicosMes;
  const saldoPrevisto = totalEntradas - totalSaida;
  const pctComprometido = totalEntradas > 0 ? Math.round((totalSaida / totalEntradas) * 100) : null;

  const entradasDividas = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""));

  const saidasDividas = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""));

  const chartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = `${currentMonth}-${String(day).padStart(2, "0")}`;
    let entradas = 0;
    let saidas = 0;

    for (const r of rendasAtivas) {
      if (Number(r.diaRecebimento) === day) {
        entradas += Number(r.valor);
      }
    }

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

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="previsao-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Previsão de Entradas e Saídas</h1>
        <p className="text-muted-foreground">Projeção financeira para {format(now, "MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10 shrink-0">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xs text-muted-foreground">Total entradas</p>
            </div>
            <p className="text-xl font-bold text-emerald-600">{mask(formatCurrency(totalEntradas))}</p>
            <div className="mt-1 space-y-0.5">
              {rendaMensal > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between">
                  <span>Renda</span><span className="font-medium">{mask(formatCurrency(rendaMensal))}</span>
                </p>
              )}
              {receberDividas > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between">
                  <span>A receber</span><span className="font-medium">{mask(formatCurrency(receberDividas))}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-red-500/10 shrink-0">
                <ArrowDownRight className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-xs text-muted-foreground">Total de saídas</p>
            </div>
            <p className="text-xl font-bold text-red-600">{mask(formatCurrency(totalSaida))}</p>
            <div className="mt-1 space-y-0.5">
              {pagarDividas > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between">
                  <span>Dívidas</span><span className="font-medium">{mask(formatCurrency(pagarDividas))}</span>
                </p>
              )}
              {servicosMes > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between">
                  <span>Serviços</span><span className="font-medium">{mask(formatCurrency(servicosMes))}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${saldoPrevisto >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                {saldoPrevisto >= 0
                  ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                  : <TrendingDown className="w-4 h-4 text-red-600" />}
              </div>
              <p className="text-xs text-muted-foreground">Saldo previsto</p>
            </div>
            <p className={`text-xl font-bold ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {mask(formatCurrency(saldoPrevisto))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {saldoPrevisto >= 0 ? "Finanças equilibradas" : "Despesas excedem receitas"}
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Renda comprometida</p>
            </div>
            <p className="text-xl font-bold text-primary">
              {pctComprometido !== null ? `${pctComprometido}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pctComprometido === null
                ? "Cadastre fontes de renda"
                : pctComprometido < 50
                  ? "Nível saudável"
                  : pctComprometido < 80
                    ? "Atenção"
                    : "Risco elevado"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Curva de saldo ao longo do mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <PrevisaoSaldoChart
              data={chartDataWithBalance}
              currentDay={currentDay}
              formatCurrency={formatCurrency}
              formatCurrencyShort={formatCurrencyShort}
              maskCurrency={mask}
            />
          </Suspense>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Saldo acumulado dia a dia incluindo renda mensal, valores a receber e despesas
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Entradas previstas ({rendasAtivas.length + entradasDividas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rendasAtivas.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                  <div>
                    <p className="text-sm font-medium">{r.descricao}</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px]">Renda fixa</Badge>
                      <span className="text-xs text-muted-foreground">Dia {r.diaRecebimento}</span>
                    </div>
                  </div>
                  <span className="font-semibold text-emerald-600">{mask(formatCurrency(Number(r.valor)))}</span>
                </div>
              ))}
              {entradasDividas.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{d.descricao || "A receber"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="font-semibold text-emerald-600">{mask(formatCurrency(Number(d.valor)))}</span>
                </div>
              ))}
              {rendasAtivas.length === 0 && entradasDividas.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma entrada prevista.<br />Cadastre fontes de renda ou valores a receber.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
              Saídas previstas ({saidasDividas.length + servicos.filter((s) => s.status === "ativo").length})
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
                  <span className="font-semibold text-red-600">{mask(formatCurrency(Number(s.valorMensal)))}</span>
                </div>
              ))}
              {saidasDividas.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{d.descricao || "Dívida"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="font-semibold text-red-600">{mask(formatCurrency(Number(d.valor)))}</span>
                </div>
              ))}
              {saidasDividas.length === 0 && servicos.filter((s) => s.status === "ativo").length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma saída prevista</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
