import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, CalendarClock,
  ArrowUpRight, ArrowDownRight, Receipt, Bell,
  AlertTriangle, CreditCard, CheckCircle, Lightbulb,
  Trophy, Star, RotateCcw, Target, DollarSign, PiggyBank,
  Settings2, Smartphone,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { useUIPreferences } from "@/context/ui-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { StatCard } from "@/pages/dashboard/components/stat-card";
import { DateBadge, urgencyLabel } from "@/pages/dashboard/components/date-badge";
import { formatCurrencyBRL } from "@/utils/formatters";

const insightIconMap: Record<string, any> = {
  trophy: Trophy,
  alert: AlertTriangle,
  money: ArrowUpRight,
  repeat: RotateCcw,
  card: CreditCard,
  trend: TrendingDown,
  star: Star,
};

export default function Dashboard() {
  const { visible } = useValuesVisibility();
  const {
    prefs,
    isMobileModeAuto,
    toggleDashCard,
    toggleCompact,
    setMobileModeAuto,
    setMobileModeManual,
  } = useUIPreferences();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const {
    isLoading,
    monthOptions,
    dividas,
    servicos,
    pessoas,
    rendas,
    patrimonios,
    totalRenda,
    totalPatrimonio,
    totalServicos,
    totalReceber,
    totalPagar,
    totalCartoesMes,
    totalPagarMes,
    saldoPrevisto,
    today,
    in7Days,
    proximosVencimentos,
    pagarSemana,
    aReceberTooltip,
    aPagarTooltip,
    gastosFixosTooltip,
    rendaMensalTooltip,
    patrimonioTooltip,
    alertas,
    score,
    insights,
    scoreBarColor,
    scoreLabelColor,
    allDashCards,
  } = useDashboard({ selectedMonth, visible });
  const selectedMonthLabel = monthOptions.find((o) => o.value === selectedMonth)?.label || selectedMonth;
  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="dashboard-loading">
        <div><Skeleton className="h-8 w-48 mb-2" /><Skeleton className="h-4 w-64" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
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
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" title="Personalizar">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Personalizar Painel</DialogTitle>
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
          <div
            className={`rounded-2xl p-5 shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}
            data-testid="mobile-saldo-hero"
          >
            <p className="text-sm font-medium opacity-80 uppercase tracking-wider mb-1">Saldo do Mês</p>
            <p className="text-4xl font-bold tracking-tight mb-3">{maskValue(formatCurrencyBRL(saldoPrevisto), visible)}</p>
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

          <div
            className="flex items-center gap-3 bg-card rounded-2xl px-4 py-3 shadow-sm border border-border/50"
            data-testid="mobile-score"
          >
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Score Financeiro</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor}`} style={{ width: `${score.valor}%` }} />
                </div>
                <span className={`text-sm font-bold ${scoreLabelColor}`}>{score.valor}</span>
              </div>
            </div>
            <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${scoreLabelColor} bg-muted/50`}>{score.classificacao}</div>
          </div>

          {visibleCards.filter(c => c.id !== "saldo").length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {visibleCards.filter(c => c.id !== "saldo").map(card => {
                const d = cardDataMap[card.id];
                if (!d) return null;
                const IconC = d.icon;
                return (
                  <div
                    key={card.id}
                    className="bg-card rounded-2xl p-4 shadow-sm border border-border/50 min-h-[90px] flex flex-col justify-between"
                    data-testid={`mobile-card-${card.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground font-medium">{card.title}</p>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${d.bg}`}>
                        <IconC className={`w-3.5 h-3.5 ${d.iconColor}`} />
                      </div>
                    </div>
                    <p className={`text-xl font-bold tracking-tight ${d.valueColor}`}>{d.value}</p>
                  </div>
                );
              })}
            </div>
          )}

          {pagarSemana.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden" data-testid="mobile-pagar-semana">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-sm">A Pagar na Semana</span>
                </div>
                <span className="text-xs text-muted-foreground">Próximos 7 dias</span>
              </div>
              {pagarSemana.map((item, idx) => {
                const urg = urgencyLabel(item.dateStr);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${idx < pagarSemana.length - 1 ? "border-b border-border/40" : ""}`}
                    data-testid={`mobile-pagar-${item.id}`}
                  >
                    <DateBadge dateStr={item.dateStr} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className={`text-xs ${urg.cls}`}>{urg.text}</p>
                    </div>
                    <span className="text-sm font-bold text-red-600 flex-shrink-0">
                      {maskValue(formatCurrencyBRL(item.amount), visible)}
                    </span>
                  </div>
                );
              })}
              <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Total da semana</span>
                <span className="text-sm font-bold text-red-600">
                  {maskValue(formatCurrencyBRL(pagarSemana.reduce((s, i) => s + i.amount, 0)), visible)}
                </span>
              </div>
            </div>
          )}

          {alertas.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span className="font-semibold text-sm">Alertas</span>
              </div>
              {alertas.map((alerta, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3.5 border-b border-border/40 last:border-b-0 ${alerta.bgColor}`}>
                  <alerta.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alerta.color}`} />
                  <p className={`text-sm ${alerta.color}`}>{alerta.texto}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Próximos Vencimentos</span>
            </div>
            {proximosVencimentos.length === 0 ? (
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden p-4 sm:p-6 space-y-5" data-testid="dashboard-page">
      <div className="rounded-2xl border border-border/60 bg-card/90 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
              <p className="text-sm text-muted-foreground capitalize">{selectedMonthLabel}</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Personalizar Painel">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Personalizar Painel</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-primary" />
                      <div>
                        <Label htmlFor="mobile-mode" className="font-medium cursor-pointer">Modo Celular</Label>
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
                  <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                    <Label htmlFor="compact-mode" className="font-medium">Modo Compacto</Label>
                    <Switch
                      id="compact-mode"
                      checked={prefs.dashboardCompact}
                      onCheckedChange={toggleCompact}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground px-2">Cards visíveis</Label>
                    {allDashCards.map((card) => (
                      <div key={card.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg transition-colors">
                        <span className="text-sm">{card.title}</span>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-full sm:w-[210px] text-sm rounded-xl" data-testid="select-month">
                <SelectValue placeholder="Selecionar mês" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div
              className="flex items-center gap-3 px-4 py-2 rounded-xl border border-border/50 bg-background min-w-[220px]"
              data-testid="score-financeiro"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Score financeiro</span>
                  <span className={`text-xs font-bold ${scoreLabelColor}`}>{score.classificacao}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${scoreBarColor}`}
                      style={{ width: `${score.valor}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold ${scoreLabelColor}`}>{score.valor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!prefs.hiddenDashCards.includes("saldo") && (
        <Card
          className={`border-0 shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
          data-testid="desktop-saldo-hero"
        >
          <CardContent className="p-5 sm:p-6">
            <p className="text-xs uppercase tracking-wider opacity-85 mb-1">Saldo do mês</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight">{maskValue(formatCurrencyBRL(saldoPrevisto), visible)}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide opacity-80">Entradas</p>
                <p className="text-sm font-semibold">{maskValue(formatCurrencyBRL(totalRenda), visible)}</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide opacity-80">Saídas</p>
                <p className="text-sm font-semibold">
                  {maskValue(formatCurrencyBRL(totalCartoesMes + totalPagarMes + totalServicos), visible)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 ${prefs.dashboardCompact ? "gap-2" : "gap-3"}`}>
        {!prefs.hiddenDashCards.includes("receber") && (
          <StatCard
            title="A receber"
            value={maskValue(formatCurrencyBRL(totalReceber), visible)}
            icon={ArrowUpRight}
            trend={`${dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").length} pendentes`}
            color="bg-emerald-500/10 text-emerald-600"
            valueColor="text-emerald-600"
            tooltipLines={aReceberTooltip}
            compact
          />
        )}
        {!prefs.hiddenDashCards.includes("pagar") && (
          <StatCard
            title="A pagar"
            value={maskValue(formatCurrencyBRL(totalPagar), visible)}
            icon={ArrowDownRight}
            trend={`${dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} pendentes`}
            color="bg-red-500/10 text-red-600"
            valueColor="text-red-600"
            tooltipLines={aPagarTooltip}
            compact
          />
        )}
        {!prefs.hiddenDashCards.includes("servicos") && (
          <StatCard
            title="Gastos fixos"
            value={maskValue(formatCurrencyBRL(totalServicos), visible)}
            icon={Receipt}
            trend={`${servicos.filter((s) => s.status === "ativo").length} ativos`}
            color="bg-amber-500/10 text-amber-600"
            tooltipLines={gastosFixosTooltip}
            compact
          />
        )}
        {!prefs.hiddenDashCards.includes("renda") && (
          <StatCard
            title="Renda mensal"
            value={maskValue(formatCurrencyBRL(totalRenda), visible)}
            icon={DollarSign}
            trend={`${rendas.filter((r) => r.ativo).length} fontes ativas`}
            color="bg-emerald-500/10 text-emerald-600"
            valueColor="text-emerald-600"
            tooltipLines={rendaMensalTooltip}
            compact
          />
        )}
        {!prefs.hiddenDashCards.includes("patrimonio") && (
          <StatCard
            title="Patrimônio"
            value={maskValue(formatCurrencyBRL(totalPatrimonio), visible)}
            icon={PiggyBank}
            trend={`${patrimonios.length} itens`}
            color="bg-blue-500/10 text-blue-600"
            valueColor="text-blue-600"
            tooltipLines={patrimonioTooltip}
            compact
          />
        )}
      </div>

      {pagarSemana.length > 0 && (
        <Card data-testid="pagar-semana-widget">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-500" />
              A Pagar na Semana
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                Próximos 7 dias
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pagarSemana.map((item) => {
                const urg = urgencyLabel(item.dateStr);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`pagar-semana-${item.id}`}>
                    <DateBadge dateStr={item.dateStr} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className={`text-xs ${urg.cls}`}>{urg.text}</p>
                    </div>
                    <span className="text-sm font-semibold text-red-600 flex-shrink-0">
                      {maskValue(formatCurrencyBRL(item.amount), visible)}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground">Total da semana</span>
                <span className="text-sm font-bold text-red-600">
                  {maskValue(formatCurrencyBRL(pagarSemana.reduce((s, i) => s + i.amount, 0)), visible)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" /> Alertas importantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="alertas-section">
              {alertas.map((alerta, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-md border ${alerta.bgColor}`}
                  data-testid={`alerta-${i}`}
                >
                  <alerta.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alerta.color}`} />
                  <p className={`text-sm font-medium ${alerta.color}`}>{alerta.texto}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" /> Insights automaticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Adicione dados para ver insights personalizados</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="insights-section">
                {insights.map((insight, i) => {
                  const IconComp = insightIconMap[insight.icone] || Lightbulb;
                  const styles = {
                    positivo: "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                    negativo: "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400",
                    neutro: "bg-muted/40 border-border text-muted-foreground",
                  };
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-md border ${styles[insight.tipo]}`}
                      data-testid={`insight-${i}`}
                    >
                      <IconComp className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p className="text-sm font-medium">{insight.texto}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Próximos vencimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proximosVencimentos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum vencimento pendente</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {proximosVencimentos.map((item) => {
                  const isPast = item.dataVenc < today;
                  const isToday = item.dataVenc === today;
                  const isThisWeek = item.dataVenc > today && item.dataVenc <= in7Days;
                  const dotColor = isPast ? "bg-red-500" : isToday ? "bg-red-500" : isThisWeek ? "bg-amber-400" : "bg-emerald-400";
                  const TipoIcon = item.tipo === "cartao" ? CreditCard : item.tipo === "servico" ? Receipt : ArrowDownRight;
                  const tipoBg = item.tipo === "cartao" ? "bg-blue-500/10 text-blue-600" : item.tipo === "servico" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600";
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                      data-testid={`vencimento-${item.id}`}
                    >
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Score detalhado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Pontuacao geral</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBarColor}`} style={{ width: `${score.valor}%` }} />
                  </div>
                  <span className={`font-bold text-sm ${scoreLabelColor}`}>{score.valor}/100</span>
                </div>
              </div>
              {score.fatores.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 text-sm">
                  <span className="text-muted-foreground truncate mr-2">{f.label}</span>
                  <span className={`font-semibold flex-shrink-0 ${f.tipo === "positivo" ? "text-emerald-600" : f.tipo === "negativo" ? "text-red-600" : "text-muted-foreground"}`}>
                    {f.impacto > 0 ? "+" : ""}{f.impacto}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Pessoas cadastradas</span>
                <span className="font-semibold">{pessoas.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Dívidas quitadas</span>
                <span className="font-semibold text-emerald-600">
                  {dividas.filter((d) => d.status === "pago").length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}





