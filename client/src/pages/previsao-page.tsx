import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
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
  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const rendaMensal = rendasAtivas.reduce((s, r) => s + Number(r.valor), 0);

  const receberDividas = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalEntradas = rendaMensal + receberDividas;

  const pagarDividas = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const servicosMes = servicosAtivos.reduce((s, sv) => s + Number(sv.valorMensal), 0);

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
      <div className="app-page-shell app-section-stack max-w-6xl">
        <div className="rounded-[28px] border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-10 w-72 rounded-full" />
            <Skeleton className="h-4 w-96 max-w-full rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[26px] border border-border/60 bg-card/95 p-5 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 rounded-full" />
                    <Skeleton className="h-8 w-28 rounded-full" />
                  </div>
                  <Skeleton className="h-11 w-11 rounded-2xl" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full rounded-full" />
                  <Skeleton className="h-3 w-4/5 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[26px] border border-border/60 bg-card/95 p-5 shadow-sm">
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-56 rounded-full" />
              <Skeleton className="h-4 w-48 rounded-full" />
            </div>
            <Skeleton className="h-64 w-full rounded-3xl" />
            <Skeleton className="mx-auto h-3 w-64 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-[26px] border border-border/60 bg-card/95 p-5 shadow-sm">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-44 rounded-full" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((__, itemIndex) => (
                    <div key={itemIndex} className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32 rounded-full" />
                          <Skeleton className="h-3 w-20 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-20 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack max-w-6xl" data-testid="previsao-page">
      <FintechPageHeader
        eyebrow={(
          <Badge variant="outline" className="w-fit rounded-full border-border/60 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
            Projeção mensal
          </Badge>
        )}
        title="Previsão de Entradas e Saídas"
        subtitle={`Projeção financeira para ${format(now, "MMMM yyyy")}`}
        badges={(
          <>
            <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              {rendasAtivas.length} {rendasAtivas.length === 1 ? "renda ativa" : "rendas ativas"}
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              {servicosAtivos.length} {servicosAtivos.length === 1 ? "serviço ativo" : "serviços ativos"}
            </Badge>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="hover-elevate h-full rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 shadow-sm shrink-0">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total entradas</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-emerald-600">{mask(formatCurrency(totalEntradas))}</p>
            <div className="space-y-1 rounded-2xl border border-border/50 bg-background/80 p-3 shadow-sm">
              {rendaMensal > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between gap-3">
                  <span>Renda</span><span className="font-medium">{mask(formatCurrency(rendaMensal))}</span>
                </p>
              )}
              {receberDividas > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between gap-3">
                  <span>A receber</span><span className="font-medium">{mask(formatCurrency(receberDividas))}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate h-full rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl border border-red-500/15 bg-red-500/10 shadow-sm shrink-0">
                <ArrowDownRight className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total de saídas</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-red-600">{mask(formatCurrency(totalSaida))}</p>
            <div className="space-y-1 rounded-2xl border border-border/50 bg-background/80 p-3 shadow-sm">
              {pagarDividas > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between gap-3">
                  <span>Dívidas</span><span className="font-medium">{mask(formatCurrency(pagarDividas))}</span>
                </p>
              )}
              {servicosMes > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between gap-3">
                  <span>Serviços</span><span className="font-medium">{mask(formatCurrency(servicosMes))}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate h-full rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex items-center justify-center w-11 h-11 rounded-2xl border shrink-0 shadow-sm ${saldoPrevisto >= 0 ? "border-emerald-500/15 bg-emerald-500/10" : "border-red-500/15 bg-red-500/10"}`}>
                {saldoPrevisto >= 0
                  ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                  : <TrendingDown className="w-4 h-4 text-red-600" />}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Saldo previsto</p>
            </div>
            <p className={`text-2xl font-semibold tracking-tight ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {mask(formatCurrency(saldoPrevisto))}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {saldoPrevisto >= 0 ? "Finanças equilibradas" : "Despesas excedem receitas"}
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate h-full rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl border border-primary/15 bg-primary/10 shadow-sm shrink-0">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Renda comprometida</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-primary">
              {pctComprometido !== null ? `${pctComprometido}%` : "—"}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
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

      <Card className="rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
        <CardHeader className="space-y-2 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Curva de saldo ao longo do mês
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Acompanhe a projeção acumulada das entradas e saídas ao longo do mês atual.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-3xl" />}>
            <PrevisaoSaldoChart
              data={chartDataWithBalance}
              currentDay={currentDay}
              formatCurrency={formatCurrency}
              formatCurrencyShort={formatCurrencyShort}
              maskCurrency={mask}
            />
          </Suspense>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Saldo acumulado dia a dia incluindo renda mensal, valores a receber e despesas
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Entradas previstas ({rendasAtivas.length + entradasDividas.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Valores esperados para entrar no caixa ao longo deste mês.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rendasAtivas.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{r.descricao}</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="rounded-full border border-emerald-500/15 bg-background/80 text-[10px] shadow-sm">Renda fixa</Badge>
                      <span className="text-xs text-muted-foreground">Dia {r.diaRecebimento}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-emerald-600">{mask(formatCurrency(Number(r.valor)))}</span>
                </div>
              ))}
              {entradasDividas.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{d.descricao || "A receber"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-emerald-600">{mask(formatCurrency(Number(d.valor)))}</span>
                </div>
              ))}
              {rendasAtivas.length === 0 && entradasDividas.length === 0 && (
                <FintechEmptyState
                  icon={<ArrowUpRight className="h-5 w-5 text-emerald-600" />}
                  title="Nenhuma entrada prevista."
                  description="Cadastre fontes de renda ou valores a receber."
                  size="compact"
                  className="bg-background/80"
                  iconWrapClassName="border-emerald-500/15 bg-emerald-500/10"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
              Saídas previstas ({saidasDividas.length + servicosAtivos.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Compromissos que pressionam o saldo previsto do mês.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {servicosAtivos.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{s.nome}</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 shadow-sm">{s.categoria}</Badge>
                      <span className="text-xs text-muted-foreground">Dia {s.dataCobranca}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-red-600">{mask(formatCurrency(Number(s.valorMensal)))}</span>
                </div>
              ))}
              {saidasDividas.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{d.descricao || "Dívida"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-red-600">{mask(formatCurrency(Number(d.valor)))}</span>
                </div>
              ))}
              {saidasDividas.length === 0 && servicosAtivos.length === 0 && (
                <FintechEmptyState
                  icon={<ArrowDownRight className="h-5 w-5 text-red-600" />}
                  title="Nenhuma saída prevista"
                  size="compact"
                  className="bg-background/80"
                  iconWrapClassName="border-red-500/15 bg-red-500/10"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
