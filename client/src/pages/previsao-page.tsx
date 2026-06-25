import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import {
  FintechSurfaceCard,
  FintechSurfaceIconChip,
  FintechSurfaceInset,
} from "@/components/layout/fintech-surface-card";
import {
  FintechLoadingListItem,
  FintechLoadingMetricCard,
  FintechLoadingPageHeader,
  FintechLoadingSurface,
} from "@/components/layout/fintech-loading-shell";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import type {
  Cartao,
  CartaoFaturaPagamento,
  CompraCartao,
  Divida,
  ParcelaCompra,
  Renda,
  Servico,
  ServicoCobrancaPagamento,
} from "@shared/schema";
import { calculateServicoOutstandingChargeForCompetency } from "@shared/servico-periodicidade";
import { format, getDaysInMonth } from "date-fns";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { fetchServicoCobrancaPagamentos } from "@/services/api/servicos";
import { buildFinancialCalendarEvents } from "@/lib/financial-calendar";

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
  const { data: servicoCobrancaPagamentos = [], isLoading: l4 } = useQuery<ServicoCobrancaPagamento[]>({
    queryKey: ["/api/servicos/cobranca-pagamentos"],
    queryFn: fetchServicoCobrancaPagamentos,
  });
  const { data: cartoes = [], isLoading: l5 } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [], isLoading: l6 } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: parcelasCompra = [], isLoading: l7 } = useQuery<ParcelaCompra[]>({ queryKey: ["/api/parcelas-compra"] });
  const { data: cartaoFaturaPagamentos = [], isLoading: l8 } = useQuery<CartaoFaturaPagamento[]>({
    queryKey: ["/api/cartoes/fatura-pagamentos"],
  });
  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8;

  const mask = (v: string) => maskValue(v, visible);

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const daysInMonth = getDaysInMonth(now);
  const currentDay = now.getDate();

  const rendasAtivas = rendas.filter((r) => r.ativo);
  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const monthlyEvents = buildFinancialCalendarEvents({
    monthReference: currentMonth,
    cartoes,
    compras,
    parcelasCompra,
    cartaoFaturaPagamentos,
    dividas,
    parcelas: [],
    pessoas: [],
    servicos,
    servicoCobrancaPagamentos,
    rendas,
    metas: [],
    referenceDate: format(now, "yyyy-MM-dd"),
  });
  const servicosSaidaMes = servicosAtivos
    .map((servico) => ({
      servico,
      valor: calculateServicoOutstandingChargeForCompetency(servico, currentMonth, servicoCobrancaPagamentos),
    }))
    .filter((item) => item.valor > 0);
  const rendaMensal = rendasAtivas.reduce((s, r) => s + Number(r.valor), 0);

  const receberDividas = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalEntradas = rendaMensal + receberDividas;

  const pagarDividas = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && (d.dataVencimento || "").startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const servicosMes = servicosSaidaMes.reduce((sum, item) => sum + item.valor, 0);
  const cartoesMes = monthlyEvents
    .filter((event) => event.source === "fatura_cartao" && event.direction === "saida")
    .reduce((sum, event) => sum + (event.amount ?? 0), 0);

  const totalSaida = pagarDividas + servicosMes + cartoesMes;
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
    const eventsOfDay = monthlyEvents.filter((event) => event.date === dayStr);
    const entradas = eventsOfDay
      .filter((event) => event.direction === "entrada")
      .reduce((sum, event) => sum + (event.amount ?? 0), 0);
    const saidas = eventsOfDay
      .filter((event) => event.direction === "saida")
      .reduce((sum, event) => sum + (event.amount ?? 0), 0);

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
        <FintechLoadingPageHeader
          titleWidth="w-72"
          subtitleWidth="w-96 max-w-full"
          eyebrowWidth="w-28"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <FintechLoadingMetricCard
              key={i}
              titleWidth="w-24"
              valueWidth="w-28"
              detailWidth="w-full"
              iconSizeClassName="h-11 w-11"
            />
          ))}
        </div>

        <FintechLoadingSurface>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-56 rounded-full bg-muted/65" />
              <Skeleton className="h-4 w-48 rounded-full bg-muted/60" />
            </div>
            <Skeleton className="h-64 w-full rounded-3xl bg-muted/70" />
            <Skeleton className="mx-auto h-3 w-64 rounded-full bg-muted/60" />
          </div>
        </FintechLoadingSurface>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <FintechLoadingSurface key={i}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-44 rounded-full bg-muted/65" />
                  <Skeleton className="h-4 w-20 rounded-full bg-muted/60" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((__, itemIndex) => (
                    <FintechLoadingListItem
                      key={itemIndex}
                      tone="inset"
                      titleWidth="w-32"
                      subtitleWidth="w-20"
                      trailingWidth="w-20"
                    />
                  ))}
                </div>
              </div>
            </FintechLoadingSurface>
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
        <FintechSurfaceCard interactive className="h-full">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <FintechSurfaceIconChip size="md" className="border-emerald-500/15 bg-emerald-500/10">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              </FintechSurfaceIconChip>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total entradas</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-emerald-600">{mask(formatCurrency(totalEntradas))}</p>
            <FintechSurfaceInset className="space-y-1 p-3">
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
            </FintechSurfaceInset>
          </CardContent>
        </FintechSurfaceCard>

        <FintechSurfaceCard interactive className="h-full">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <FintechSurfaceIconChip size="md" className="border-red-500/15 bg-red-500/10">
                <ArrowDownRight className="w-4 h-4 text-red-600" />
              </FintechSurfaceIconChip>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total de saídas</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight text-red-600">{mask(formatCurrency(totalSaida))}</p>
            <FintechSurfaceInset className="space-y-1 p-3">
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
              {cartoesMes > 0 && (
                <p className="text-xs text-muted-foreground flex justify-between gap-3">
                  <span>Faturas</span><span className="font-medium">{mask(formatCurrency(cartoesMes))}</span>
                </p>
              )}
            </FintechSurfaceInset>
          </CardContent>
        </FintechSurfaceCard>

        <FintechSurfaceCard interactive className="h-full">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <FintechSurfaceIconChip
                size="md"
                className={saldoPrevisto >= 0 ? "border-emerald-500/15 bg-emerald-500/10" : "border-red-500/15 bg-red-500/10"}
              >
                {saldoPrevisto >= 0
                  ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                  : <TrendingDown className="w-4 h-4 text-red-600" />}
              </FintechSurfaceIconChip>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Saldo previsto</p>
            </div>
            <p className={`text-2xl font-semibold tracking-tight ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {mask(formatCurrency(saldoPrevisto))}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {saldoPrevisto >= 0 ? "Finanças equilibradas" : "Despesas excedem receitas"}
            </p>
          </CardContent>
        </FintechSurfaceCard>

        <FintechSurfaceCard interactive className="h-full">
          <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3 mb-2">
              <FintechSurfaceIconChip size="md" className="border-primary/15 bg-primary/10">
                <Wallet className="w-4 h-4 text-primary" />
              </FintechSurfaceIconChip>
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
        </FintechSurfaceCard>
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
                <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">{r.descricao}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="rounded-full border border-emerald-500/15 bg-background/80 text-[10px] shadow-sm">Renda fixa</Badge>
                      <span className="text-xs text-muted-foreground">Dia {r.diaRecebimento}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 [overflow-wrap:anywhere] sm:shrink-0">{mask(formatCurrency(Number(r.valor)))}</span>
                </div>
              ))}
              {entradasDividas.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">{d.descricao || "A receber"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 [overflow-wrap:anywhere] sm:shrink-0">{mask(formatCurrency(Number(d.valor)))}</span>
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
              Saídas previstas ({saidasDividas.length + servicosSaidaMes.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Compromissos que pressionam o saldo previsto do mês.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {servicosSaidaMes.map(({ servico, valor }) => (
                <div key={servico.id} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">{servico.nome}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 shadow-sm">{servico.categoria}</Badge>
                      <span className="text-xs text-muted-foreground">Dia {servico.dataCobranca}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-red-600 [overflow-wrap:anywhere] sm:shrink-0">{mask(formatCurrency(valor))}</span>
                </div>
              ))}
              {saidasDividas.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">{d.descricao || "Dívida"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600 [overflow-wrap:anywhere] sm:shrink-0">{mask(formatCurrency(Number(d.valor)))}</span>
                </div>
              ))}
              {saidasDividas.length === 0 && servicosSaidaMes.length === 0 && (
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
