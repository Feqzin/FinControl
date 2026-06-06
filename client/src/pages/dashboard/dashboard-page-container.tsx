import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, CalendarClock,
  ArrowUpRight, ArrowDownRight, Receipt,
  AlertTriangle, CreditCard, Lightbulb,
  Trophy, Star, RotateCcw, Target, DollarSign, PiggyBank,
  Settings2, Smartphone,
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { useUIPreferences } from "@/context/ui-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboard } from "@/hooks/useDashboard";
import { formatCurrencyBRL } from "@/utils/formatters";
import { useLocation } from "wouter";
import type { UsageMode } from "@/context/ui-preferences";
import { DashboardQuickActions } from "@/components/dashboard/DashboardQuickActions";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { DashboardFinancialOverview } from "@/components/dashboard/DashboardFinancialOverview";

const insightIconMap: Record<string, any> = {
  trophy: Trophy,
  alert: AlertTriangle,
  money: ArrowUpRight,
  repeat: RotateCcw,
  card: CreditCard,
  trend: TrendingDown,
  star: Star,
};

const fallbackInsightActionByIcon: Record<string, { label: string; path: string }> = {
  alert: { label: "Ver pendência", path: "/dividas?status=vencido" },
  card: { label: "Ver detalhes", path: "/cartoes" },
  repeat: { label: "Ver detalhes", path: "/servicos" },
  trend: { label: "Ver detalhes", path: "/previsao" },
  star: { label: "Ver metas", path: "/metas" },
  money: { label: "Ver detalhes", path: "/dividas?status=pendente&tipo=receber" },
};

const normalizeComparisonText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isUrgencyInsight = (insight: { tipo: string; icone: string; texto: string }) => {
  const normalized = normalizeComparisonText(insight.texto);
  if (insight.icone === "alert" || insight.icone === "card") return true;
  return [
    "vencid",
    "atras",
    "limite",
    "estour",
    "saldo negativo",
    "atencao",
    "cobranca",
    "vence",
  ].some((token) => normalized.includes(token));
};

function SectionErrorState({ message, compact = false }: { message?: string | null; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-red-500/20 bg-red-500/5 ${compact ? "p-3" : "p-4"} text-sm text-red-700 dark:text-red-300`}>
      <p className="font-medium">Não foi possível carregar esta seção agora.</p>
      {message && <p className="mt-1 text-xs opacity-90">{message}</p>}
    </div>
  );
}

function resolveVencimentoPath(item: { tipo: "cartao" | "divida" | "servico" } | null) {
  if (!item) return "/dividas";
  if (item.tipo === "cartao") return "/cartoes";
  if (item.tipo === "servico") return "/servicos";
  return "/dividas";
}

export default function Dashboard() {
  const { visible } = useValuesVisibility();
  const [, setLocation] = useLocation();
  const {
    prefs,
    isEssentialMode,
    showAdvancedResources,
    showContextualTips,
    isMobileModeAuto,
    toggleDashCard,
    toggleCompact,
    setUsageMode,
    setMobileModeAuto,
    setMobileModeManual,
  } = useUIPreferences();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const {
    monthOptions,
    dividas,
    servicos,
    pessoas,
    rendas,
    patrimonios,
    totalRenda,
    totalPatrimonio,
    totalServicos,
    servicosEquivalenteMensalTotal,
    servicosCobrancaRealCompetenciaTotal,
    totalReceber,
    totalPagar,
    totalCartoesMes,
    totalPagarMes,
    totalEntradas,
    totalSaidas,
    saldoPrevisto,
    today,
    in7Days,
    proximosVencimentos,
    pagarSemana,
    alertas,
    aReceberTooltip,
    aPagarTooltip,
    gastosFixosTooltip,
    rendaMensalTooltip,
    patrimonioTooltip,
    score,
    insights,
    scoreBarColor,
    scoreLabelColor,
    allDashCards,
    sectionStatus,
  } = useDashboard({ selectedMonth, visible });
  const selectedMonthLabel = monthOptions.find((o) => o.value === selectedMonth)?.label || selectedMonth;

  const alertasUrgentes = alertas
    .filter((item) => !normalizeComparisonText(item.texto).includes("tudo em ordem"))
    .slice(0, 3);

  const alertasUrgentesTextoSet = new Set(
    alertasUrgentes.map((item) => normalizeComparisonText(item.texto)),
  );

  const insightsOportunidades = insights
    .filter((insight) => !isUrgencyInsight(insight))
    .filter((insight) => !alertasUrgentesTextoSet.has(normalizeComparisonText(insight.texto)))
    .slice(0, 3);

  const shouldRenderAlertasSection =
    sectionStatus.alertas.isLoading || sectionStatus.alertas.isError || alertasUrgentes.length > 0;

  const proximoVencimento = proximosVencimentos[0] ?? null;
  const diasProximoVencimento = proximoVencimento
    ? Math.ceil((new Date(`${proximoVencimento.dataVenc}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : null;
  const receberPorPessoa = dividas.reduce<Map<string, number>>((acc, divida) => {
    if (divida.tipo !== "receber" || divida.status !== "pendente") return acc;
    const current = acc.get(divida.pessoaId) ?? 0;
    acc.set(divida.pessoaId, current + Number(divida.valor));
    return acc;
  }, new Map<string, number>());
  const principalReceberEntry = Array.from(receberPorPessoa.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const principalReceberNome = principalReceberEntry
    ? (pessoas.find((p) => p.id === principalReceberEntry[0])?.nome ?? null)
    : null;
  const pagarSemanaTotal = pagarSemana.reduce((sum, item) => sum + item.amount, 0);
  const summaryCards = [
    {
      id: "receber",
      title: "A receber",
      value: maskValue(formatCurrencyBRL(totalReceber), visible),
      icon: ArrowUpRight,
      trend: `${dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").length} pendentes`,
      color: "bg-emerald-500/10 text-emerald-600",
      valueColor: "text-emerald-600",
      tooltipLines: aReceberTooltip,
    },
    {
      id: "pagar",
      title: "A pagar",
      value: maskValue(formatCurrencyBRL(totalPagar), visible),
      icon: ArrowDownRight,
      trend: `${dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} pendentes`,
      color: "bg-red-500/10 text-red-600",
      valueColor: "text-red-600",
      tooltipLines: aPagarTooltip,
    },
    {
      id: "servicos",
      title: "Gastos fixos",
      value: maskValue(formatCurrencyBRL(totalServicos), visible),
      icon: Receipt,
      trend: `Média: ${maskValue(formatCurrencyBRL(servicosEquivalenteMensalTotal), visible)} · Real mês: ${maskValue(formatCurrencyBRL(servicosCobrancaRealCompetenciaTotal), visible)}`,
      color: "bg-amber-500/10 text-amber-600",
      tooltipLines: gastosFixosTooltip,
    },
    {
      id: "renda",
      title: "Renda mensal",
      value: maskValue(formatCurrencyBRL(totalRenda), visible),
      icon: DollarSign,
      trend: `${rendas.filter((r) => r.ativo).length} fontes ativas`,
      color: "bg-emerald-500/10 text-emerald-600",
      valueColor: "text-emerald-600",
      tooltipLines: rendaMensalTooltip,
    },
    {
      id: "patrimonio",
      title: "Patrimônio",
      value: maskValue(formatCurrencyBRL(totalPatrimonio), visible),
      icon: PiggyBank,
      trend: `${patrimonios.length} itens`,
      color: "bg-blue-500/10 text-blue-600",
      valueColor: "text-blue-600",
      tooltipLines: patrimonioTooltip,
    },
  ];
  const desktopSettingsContent = (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <div>
            <Label htmlFor="mobile-mode" className="cursor-pointer font-medium">Modo Celular</Label>
            <p className="text-xs text-muted-foreground">Interface otimizada para toque</p>
          </div>
        </div>
        <Switch
          id="mobile-mode"
          checked={prefs.mobileMode}
          onCheckedChange={(checked) => setMobileModeManual(checked)}
          data-testid="toggle-mobile-mode"
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {isMobileModeAuto ? "Modo automático ativo (segue tamanho da tela)." : "Modo manual ativo."}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={setMobileModeAuto}
          disabled={isMobileModeAuto}
        >
          Usar automático
        </Button>
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2">
        <Label htmlFor="compact-mode" className="font-medium">Modo Compacto</Label>
        <Switch
          id="compact-mode"
          checked={prefs.dashboardCompact}
          onCheckedChange={toggleCompact}
        />
      </div>
      <div className="space-y-2">
        <Label className="px-2 text-sm text-muted-foreground">Cards visíveis</Label>
        {allDashCards.map((card) => (
          <div key={card.id} className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-muted/50">
            <span className="text-sm">{card.title}</span>
            <Switch
              checked={!prefs.hiddenDashCards.includes(card.id)}
              onCheckedChange={() => toggleDashCard(card.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );

  if (isEssentialMode) {
    return (
      <div className="app-page-shell app-section-stack" data-testid="dashboard-essencial">
        <div className="fintech-page-header border border-border/60 bg-card/95 shadow-sm">
          <div className="fintech-page-header-row gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight">Painel Essencial</h1>
              <p className="text-sm text-muted-foreground/90">Visão simplificada para decisões rápidas.</p>
            </div>
            <div className="fintech-actions-wrap w-full lg:w-auto">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-10 w-full min-w-0 rounded-xl text-sm lg:w-[220px]" data-testid="select-month-essencial">
                  <SelectValue placeholder="Selecionar mês" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-10 w-full justify-center gap-2 rounded-xl lg:w-auto">
                    <Settings2 className="h-4 w-4" />
                    Ajustes
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ajustes do painel</DialogTitle>
                    <DialogDescription className="sr-only">
                      Ajuste o modo de interface e as preferências rápidas exibidas no painel essencial.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="usage-mode-essencial">Modo de interface</Label>
                      <Select value={prefs.usageMode} onValueChange={(value) => setUsageMode(value as UsageMode)}>
                        <SelectTrigger id="usage-mode-essencial">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="essencial">Essencial</SelectItem>
                          <SelectItem value="guiado">Guiado</SelectItem>
                          <SelectItem value="completo">Completo</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <div>
                          <Label htmlFor="mobile-mode-essencial" className="cursor-pointer font-medium">Modo Celular</Label>
                          <p className="text-xs text-muted-foreground">Interface otimizada para toque</p>
                        </div>
                      </div>
                      <Switch
                        id="mobile-mode-essencial"
                        checked={prefs.mobileMode}
                        onCheckedChange={(checked) => setMobileModeManual(checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-muted-foreground">
                        {isMobileModeAuto ? "Modo automático ativo (segue tamanho da tela)." : "Modo manual ativo."}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={setMobileModeAuto}
                        disabled={isMobileModeAuto}
                      >
                        Usar automático
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {sectionStatus.saldo.isLoading ? (
          <Skeleton className="h-44 rounded-2xl" />
        ) : sectionStatus.saldo.isError ? (
          <SectionErrorState message={sectionStatus.saldo.message} />
        ) : (
          <Card className={`border-0 shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`} data-testid="essencial-hero">
            <CardContent className="p-4 sm:p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-90">Seu dinheiro este mês</p>
              <p className="fin-value-hero">{maskValue(formatCurrencyBRL(saldoPrevisto), visible)}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] opacity-80">Entrou</p>
                  <p className="text-base font-semibold">{maskValue(formatCurrencyBRL(totalEntradas), visible)}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] opacity-80">Saiu</p>
                  <p className="text-base font-semibold">{maskValue(formatCurrencyBRL(totalSaidas), visible)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="flex flex-col shadow-sm" data-testid="essencial-proxima-conta">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Próxima conta</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              {sectionStatus.proximosVencimentos.isLoading ? (
                <Skeleton className="h-20 rounded-xl" />
              ) : sectionStatus.proximosVencimentos.isError ? (
                <SectionErrorState compact message={sectionStatus.proximosVencimentos.message} />
              ) : !proximoVencimento ? (
                <p className="text-sm text-muted-foreground">Nenhuma conta pendente no período.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {diasProximoVencimento !== null
                      ? diasProximoVencimento < 0
                        ? `Conta vencida há ${Math.abs(diasProximoVencimento)} dia(s)`
                        : diasProximoVencimento === 0
                          ? "Conta vence hoje"
                          : `Próxima conta em ${diasProximoVencimento} dia(s)`
                      : "Próxima conta"}
                  </p>
                  <p className="text-sm font-semibold">{proximoVencimento.nome}</p>
                  <p className="text-2xl font-bold leading-tight tracking-tight">
                    {maskValue(formatCurrencyBRL(proximoVencimento.valor), visible)}
                  </p>
                  <Button
                    type="button"
                    className="mt-auto h-11 w-full justify-center rounded-xl text-sm"
                    variant="outline"
                    onClick={() => setLocation(resolveVencimentoPath(proximoVencimento))}
                  >
                    Ver contas
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col shadow-sm" data-testid="essencial-receber">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dinheiro para receber</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              {totalReceber > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">Você tem {maskValue(formatCurrencyBRL(totalReceber), visible)} para receber.</p>
                  {principalReceberNome && (
                    <p className="text-sm text-muted-foreground">
                      Principal pendência: <span className="font-medium text-foreground">{principalReceberNome}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem valores pendentes para receber neste período.</p>
              )}
              <Button
                type="button"
                className="mt-auto h-11 w-full justify-center rounded-xl text-sm"
                variant="outline"
                onClick={() => setLocation("/pessoas")}
              >
                Ver pessoas
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 shadow-sm" data-testid="essencial-atalhos-uteis">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atalhos úteis</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardQuickActions
              onGoPessoas={() => setLocation("/pessoas")}
              onGoCartoes={() => setLocation("/cartoes")}
              onGoServicos={() => setLocation("/servicos")}
              onGoPerfil={() => setLocation("/perfil")}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (prefs.mobileMode) {
    const visibleCards = allDashCards.filter(c => !prefs.hiddenDashCards.includes(c.id));
    const cardDataMap: Record<string, { value: string; icon: any; iconColor: string; bg: string; valueColor: string }> = {
      receber: { value: maskValue(formatCurrencyBRL(totalReceber), visible), icon: ArrowUpRight, iconColor: "text-emerald-600", bg: "bg-emerald-500/10", valueColor: "text-emerald-600" },
      pagar: { value: maskValue(formatCurrencyBRL(totalPagar), visible), icon: ArrowDownRight, iconColor: "text-red-500", bg: "bg-red-500/10", valueColor: "text-red-600" },
      servicos: { value: maskValue(formatCurrencyBRL(totalServicos), visible), icon: Receipt, iconColor: "text-amber-500", bg: "bg-amber-500/10", valueColor: "text-foreground" },
      saldo: { value: maskValue(formatCurrencyBRL(saldoPrevisto), visible), icon: saldoPrevisto >= 0 ? TrendingUp : TrendingDown, iconColor: saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-500", bg: saldoPrevisto >= 0 ? "bg-emerald-500/10" : "bg-red-500/10", valueColor: saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600" },
      renda: { value: maskValue(formatCurrencyBRL(totalRenda), visible), icon: DollarSign, iconColor: "text-emerald-600", bg: "bg-emerald-500/10", valueColor: "text-emerald-600" },
      patrimonio: { value: maskValue(formatCurrencyBRL(totalPatrimonio), visible), icon: PiggyBank, iconColor: "text-blue-500", bg: "bg-blue-500/10", valueColor: "text-blue-600" },
    };

    return (
      <div className="min-h-full w-full max-w-full overflow-x-hidden bg-background pb-[calc(var(--app-bottom-nav-height)+env(safe-area-inset-bottom))]" data-testid="dashboard-mobile">
        <div className="bg-card/80 backdrop-blur-sm border-b px-4 pt-5 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Painel</h1>
              <p className="text-xs text-muted-foreground capitalize">{selectedMonthLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    aria-label="Personalizar painel"
                    title="Personalizar"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Personalizar Painel</DialogTitle>
                    <DialogDescription className="sr-only">
                      Escolha quais cards ficam visíveis e ajuste as preferências do painel no modo celular.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-primary" />
                        <div>
                          <Label htmlFor="mobile-mode-m" className="font-medium cursor-pointer">Modo Celular</Label>
                          <p className="text-xs text-muted-foreground">Interface otimizada para toque</p>
                        </div>
                      </div>
                      <Switch
                        id="mobile-mode-m"
                        checked={prefs.mobileMode}
                        onCheckedChange={(checked) => setMobileModeManual(checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-muted-foreground">
                        {isMobileModeAuto ? "Modo automático ativo (segue tamanho da tela)." : "Modo manual ativo."}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={setMobileModeAuto}
                        disabled={isMobileModeAuto}
                      >
                        Usar automático
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground px-1 uppercase tracking-wide">Cards visíveis</Label>
                      {allDashCards.map((card) => (
                        <div key={card.id} className="flex items-center justify-between py-3 px-2 border-b last:border-b-0">
                          <span className="text-base">{card.title}</span>
                          <Switch
                            checked={!prefs.hiddenDashCards.includes(card.id)}
                            onCheckedChange={() => toggleDashCard(card.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-10 w-full text-sm rounded-xl border-0 bg-muted/50" data-testid="select-month-mobile">
              <SelectValue placeholder="Selecionar mês" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="py-3 text-base">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="px-4 pt-4 space-y-3">
          {sectionStatus.saldo.isLoading ? (
            <Skeleton className="h-44 rounded-2xl" />
          ) : sectionStatus.saldo.isError ? (
            <SectionErrorState message={sectionStatus.saldo.message} />
          ) : (
            <div
              className={`rounded-2xl p-[14px] shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}
              data-testid="mobile-saldo-hero"
            >
              <p className="mb-1 text-[12px] font-medium uppercase tracking-wide opacity-80">Saldo do mês</p>
              <p className="fin-value-hero mb-3">
                {maskValue(formatCurrencyBRL(saldoPrevisto), visible)}
              </p>
              <div className="flex gap-4 text-sm opacity-85">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{maskValue(formatCurrencyBRL(totalRenda), visible)}</span>
                </div>
                <div className="w-px bg-white/30" />
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>{maskValue(formatCurrencyBRL(totalCartoesMes + totalPagarMes + totalServicos), visible)}</span>
                </div>
              </div>
            </div>
          )}

          {visibleCards.filter(c => c.id !== "saldo").length > 0 ? (
            sectionStatus.cardsResumo.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((idx) => <Skeleton key={idx} className="h-[98px] rounded-2xl" />)}
              </div>
            ) : sectionStatus.cardsResumo.isError ? (
              <SectionErrorState compact message={sectionStatus.cardsResumo.message} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleCards.filter(c => c.id !== "saldo").map(card => {
                  const d = cardDataMap[card.id];
                  if (!d) return null;
                  const IconC = d.icon;
                  return (
                    <div
                      key={card.id}
                      className="bg-card rounded-2xl border border-border/50 p-[14px] shadow-sm min-h-[90px] flex flex-col justify-between"
                      data-testid={`mobile-card-${card.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] text-muted-foreground font-medium">{card.title}</p>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${d.bg}`}>
                          <IconC className={`w-3.5 h-3.5 ${d.iconColor}`} />
                        </div>
                      </div>
                      <p className={`fin-value-kpi ${d.valueColor}`}>
                        {d.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}

          {shouldRenderAlertasSection && (
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="font-semibold text-sm">Alertas importantes</span>
            </div>
            {sectionStatus.alertas.isLoading ? (
              <div className="space-y-2 px-4 pb-4">
                {[1, 2, 3].map((idx) => <Skeleton key={idx} className="h-12 rounded-md" />)}
              </div>
            ) : sectionStatus.alertas.isError ? (
              <div className="px-4 pb-4">
                <SectionErrorState compact message={sectionStatus.alertas.message} />
              </div>
            ) : (
              <div className="space-y-2 px-4 pb-4">
                {alertasUrgentes.map((alerta, index) => {
                  const IconComp = alerta.icon || AlertTriangle;
                  return (
                    <div key={`${alerta.texto}-${index}`} className={`rounded-md border p-3 ${alerta.bgColor}`}>
                      <div className={`flex items-start gap-2.5 ${alerta.color}`}>
                        <IconComp className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <p className="text-sm font-medium">{alerta.texto}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {showAdvancedResources && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm">Insights automáticos</span>
              </div>
              {sectionStatus.insights.isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {[1, 2].map((idx) => <Skeleton key={idx} className="h-14 rounded-md" />)}
                </div>
              ) : sectionStatus.insights.isError ? (
                <div className="px-4 pb-4">
                  <SectionErrorState compact message={sectionStatus.insights.message} />
                </div>
              ) : insightsOportunidades.length === 0 ? (
                <div className="px-4 pb-4 text-xs text-muted-foreground">Sem oportunidades relevantes no momento.</div>
              ) : (
                <div className="space-y-2 px-4 pb-4">
                  {insightsOportunidades.map((insight, i) => {
                    const IconComp = insightIconMap[insight.icone] || Lightbulb;
                    const insightAction = insight.acao
                      ? { label: insight.acao.label, path: insight.acao.path }
                      : fallbackInsightActionByIcon[insight.icone];
                    const isActionable = Boolean(insightAction?.path);
                    const styles = {
                      positivo: "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                      negativo: "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400",
                      neutro: "bg-muted/40 border-border text-muted-foreground",
                    };
                    return (
                      <div
                        key={i}
                        className={`rounded-md border p-3 ${styles[insight.tipo]} ${isActionable ? "cursor-pointer" : ""}`}
                        onClick={isActionable ? () => setLocation(insightAction.path) : undefined}
                      >
                        <div className="flex items-start gap-2.5">
                          <IconComp className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-medium">{insight.texto}</p>
                            {isActionable && insightAction && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setLocation(insightAction.path);
                                }}
                              >
                                {insightAction.label}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Próximos Vencimentos</span>
              {!sectionStatus.pagarSemana.isLoading && !sectionStatus.pagarSemana.isError && pagarSemana.length > 0 ? (
                <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {pagarSemana.length} na semana
                </span>
              ) : null}
            </div>
            {sectionStatus.proximosVencimentos.isLoading ? (
              <div className="space-y-2 px-4 pb-4">
                {[1, 2, 3].map((idx) => <Skeleton key={idx} className="h-12 rounded-lg" />)}
              </div>
            ) : sectionStatus.proximosVencimentos.isError ? (
              <div className="px-4 pb-4">
                <SectionErrorState compact message={sectionStatus.proximosVencimentos.message} />
              </div>
            ) : proximosVencimentos.length === 0 ? (
              <div className="px-4 pb-4 text-center">
                <p className="text-sm text-muted-foreground py-2">Nenhum vencimento pendente</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {proximosVencimentos.slice(0, 6).map((item) => {
                  const isPast = item.dataVenc < today;
                  const isToday = item.dataVenc === today;
                  const isThisWeek = item.dataVenc > today && item.dataVenc <= in7Days;
                  const dotColor = isPast ? "bg-red-500" : isToday ? "bg-red-500" : isThisWeek ? "bg-amber-400" : "bg-emerald-400";
                  const TipoIcon = item.tipo === "cartao" ? CreditCard : item.tipo === "servico" ? Receipt : ArrowDownRight;
                  const tipoBg = item.tipo === "cartao" ? "bg-blue-500/10 text-blue-600" : item.tipo === "servico" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600";
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3" data-testid={`mobile-vencimento-${item.id}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tipoBg}`}>
                        <TipoIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.nome}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                          <p className={`text-xs ${isPast || isToday ? "text-red-600 font-medium" : isThisWeek ? "text-amber-600" : "text-muted-foreground"}`}>
                            {item.subtitulo}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0">
                        {maskValue(formatCurrencyBRL(item.valor), visible)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {!sectionStatus.proximosVencimentos.isLoading && !sectionStatus.proximosVencimentos.isError ? (
              <div className="border-t border-border/60 px-4 py-3">
                {sectionStatus.pagarSemana.isLoading ? (
                  <Skeleton className="h-10 rounded-lg" />
                ) : sectionStatus.pagarSemana.isError ? (
                  <p className="text-xs text-muted-foreground">Resumo da semana indisponível no momento.</p>
                ) : pagarSemana.length > 0 ? (
                  <div className="flex items-center justify-between rounded-lg bg-amber-500/5 px-3 py-2">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground">A pagar em 7 dias</p>
                      <p className="text-sm font-semibold text-red-600">
                        {maskValue(formatCurrencyBRL(pagarSemanaTotal), visible)}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {pagarSemana.length} item(ns)
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem pagamentos críticos nos próximos 7 dias.</p>
                )}
              </div>
            ) : null}
          </div>

          {showAdvancedResources && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden" data-testid="mobile-score">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Score detalhado</span>
              </div>
              {sectionStatus.scoreDetalhado.isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {[1, 2].map((idx) => <Skeleton key={idx} className="h-10 rounded-md" />)}
                </div>
              ) : sectionStatus.scoreDetalhado.isError ? (
                <div className="px-4 pb-4">
                  <SectionErrorState compact message={sectionStatus.scoreDetalhado.message} />
                </div>
              ) : (
                <div className="space-y-3 px-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Pontuação geral</span>
                        <span className={`text-xs font-bold ${scoreLabelColor}`}>{score.classificacao}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor}`} style={{ width: `${score.valor}%` }} />
                        </div>
                        <span className={`text-sm font-bold ${scoreLabelColor}`}>{score.valor}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {score.fatores.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-2 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground">{f.label}</span>
                        <span className={`ml-2 flex-shrink-0 font-semibold ${f.tipo === "positivo" ? "text-emerald-600" : f.tipo === "negativo" ? "text-red-600" : "text-muted-foreground"}`}>
                          {f.impacto > 0 ? "+" : ""}{f.impacto}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showContextualTips && (
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Dica rápida</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Priorize quitar os itens vencidos da semana para proteger seu fluxo de caixa do mês.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
      <div className="app-page-shell app-section-stack" data-testid="dashboard-page">
      <DashboardPageHeader
        title="Painel"
        subtitle="Visão financeira consolidada do período."
        selectedMonth={selectedMonth}
        monthOptions={monthOptions}
        onMonthChange={setSelectedMonth}
        settingsContent={desktopSettingsContent}
        showAdvancedResources={showAdvancedResources}
        scoreStatus={sectionStatus.score}
        score={score}
        scoreBarColor={scoreBarColor}
        scoreLabelColor={scoreLabelColor}
      />

      {!prefs.hiddenDashCards.includes("saldo") && (
        sectionStatus.saldo.isLoading ? (
          <Skeleton className="h-[170px] rounded-2xl" />
        ) : sectionStatus.saldo.isError ? (
          <SectionErrorState message={sectionStatus.saldo.message} />
        ) : (
          <Card
            className={`border-0 shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
            data-testid="desktop-saldo-hero"
          >
            <CardContent className="p-[14px] md:p-[18px]">
              <p className="mb-1 text-[12px] uppercase tracking-wide opacity-85">Saldo do mês</p>
              <p className="fin-value-hero">
                {maskValue(formatCurrencyBRL(saldoPrevisto), visible)}
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] uppercase tracking-wide opacity-80">Entradas</p>
                  <p className="text-sm font-semibold">{maskValue(formatCurrencyBRL(totalRenda), visible)}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] uppercase tracking-wide opacity-80">Saídas</p>
                  <p className="text-sm font-semibold">
                    {maskValue(formatCurrencyBRL(totalCartoesMes + totalPagarMes + totalServicos), visible)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      )}

      <DashboardSummaryCards
        status={sectionStatus.cardsResumo}
        cards={summaryCards}
        hiddenCardIds={prefs.hiddenDashCards}
        compact={prefs.dashboardCompact}
      />

      <DashboardInsights
        shouldRenderAlertasSection={shouldRenderAlertasSection}
        showAdvancedResources={showAdvancedResources}
        alertasStatus={sectionStatus.alertas}
        insightsStatus={sectionStatus.insights}
        alertasUrgentes={alertasUrgentes}
        insightsOportunidades={insightsOportunidades}
        insightIconMap={insightIconMap}
        fallbackInsightActionByIcon={fallbackInsightActionByIcon}
        onNavigate={setLocation}
      />

      <DashboardFinancialOverview
        proximosStatus={sectionStatus.proximosVencimentos}
        scoreDetalhadoStatus={sectionStatus.scoreDetalhado}
        pagarSemanaStatus={sectionStatus.pagarSemana}
        proximosVencimentos={proximosVencimentos}
        pagarSemana={pagarSemana}
        score={score}
        scoreBarColor={scoreBarColor}
        scoreLabelColor={scoreLabelColor}
        pessoasCount={pessoas.length}
        dividasQuitadas={dividas.filter((d) => d.status === "pago").length}
        showAdvancedResources={showAdvancedResources}
        showContextualTips={showContextualTips}
        today={today}
        in7Days={in7Days}
        formatMoney={(value) => maskValue(formatCurrencyBRL(value), visible)}
      />
    </div>
  );
}






