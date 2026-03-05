import { useQuery } from "@tanstack/react-query";
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
import type { Divida, Servico, Pessoa, Cartao, CompraCartao, Renda, Patrimonio } from "@shared/schema";
import { format, differenceInDays, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { calcularScore, gerarInsights } from "@/utils/financialEngine";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useMemo } from "react";
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getUrgencyStyle(dataVencimento: string | null, status: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (status === "pago") return { dot: "bg-emerald-500", label: "", labelClass: "" };
  if (!dataVencimento) return { dot: "bg-muted", label: "Sem data", labelClass: "text-muted-foreground" };
  if (dataVencimento < today) return { dot: "bg-red-500", label: "Vencido", labelClass: "text-red-600" };
  const days = differenceInDays(parseISO(dataVencimento), new Date());
  if (days <= 7) return { dot: "bg-amber-400", label: `${days}d`, labelClass: "text-amber-600" };
  return { dot: "bg-emerald-400", label: `${days}d`, labelClass: "text-emerald-600" };
}

function StatCard({ title, value, icon: Icon, trend, color, valueColor, tooltipLines, compact }: {
  title: string;
  value: string;
  icon: any;
  trend?: string;
  color: string;
  valueColor?: string;
  tooltipLines?: string[];
  compact?: boolean;
}) {
  const card = (
    <Card className={`hover-elevate ${compact ? "min-h-[80px]" : "min-h-[100px]"}`}>
      <CardContent className={`${compact ? "p-3" : "p-5"} h-full`}>
        <div className="flex items-start justify-between gap-2 h-full">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className={`${compact ? "text-lg" : "text-xl"} font-bold tracking-tight truncate ${valueColor || ""}`} title={value}>{value}</p>
            {trend && !compact && <p className="text-xs text-muted-foreground truncate">{trend}</p>}
          </div>
          <div className={`flex items-center justify-center ${compact ? "w-8 h-8" : "w-10 h-10"} rounded-md flex-shrink-0 ${color}`}>
            <Icon className={`${compact ? "w-4 h-4" : "w-5 h-5"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!tooltipLines?.length) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[300px] p-3">
        <div className="space-y-1 text-xs">
          {tooltipLines.map((line, i) =>
            line.startsWith("---")
              ? <div key={i} className="border-t border-border my-1" />
              : <div key={i}>{line}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function DateBadge({ dateStr }: { dateStr: string }) {
  const d = parseISO(dateStr);
  const diff = differenceInDays(d, new Date());
  const bg =
    diff < 0 ? "bg-red-500" :
    diff === 0 ? "bg-red-500" :
    diff <= 3 ? "bg-amber-500" :
    "bg-blue-500";
  return (
    <div className={`flex flex-col items-center justify-center w-11 h-12 rounded-xl ${bg} text-white flex-shrink-0 shadow-sm`}>
      <span className="text-base font-bold leading-none">{format(d, "dd")}</span>
      <span className="text-[9px] uppercase font-semibold mt-0.5 opacity-90 tracking-wide">
        {format(d, "MMM", { locale: ptBR })}
      </span>
    </div>
  );
}

function urgencyLabel(dateStr: string): { text: string; cls: string } {
  const diff = differenceInDays(parseISO(dateStr), new Date());
  if (diff < 0) return { text: `Venceu há ${Math.abs(diff)}d`, cls: "text-red-600 font-medium" };
  if (diff === 0) return { text: "Vence Hoje", cls: "text-red-600 font-semibold" };
  if (diff === 1) return { text: "Vence amanhã", cls: "text-amber-600 font-medium" };
  return { text: `Vence em ${diff} dias`, cls: "text-muted-foreground" };
}

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
  const { prefs, toggleDashCard, toggleCompact, toggleMobileMode } = useUIPreferences();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = format(d, "MMMM 'de' yyyy", { locale: ptBR });
      opts.push({ value: format(d, "yyyy-MM"), label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  }, []);

  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: pessoas = [], isLoading: l3 } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: rendas = [] } = useQuery<Renda[]>({ queryKey: ["/api/rendas"] });
  const { data: patrimonios = [] } = useQuery<Patrimonio[]>({ queryKey: ["/api/patrimonios"] });

  const isLoading = l1 || l2 || l3;

  const currentMonth = selectedMonth;

  // Totais gerais (para cards A receber / A pagar)
  const totalReceber = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalPagar = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalServicos = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + Number(sv.valorMensal), 0);

  const totalRenda = rendas
    .filter((r) => r.ativo)
    .reduce((s, r) => s + Number(r.valor), 0);

  const totalPatrimonio = patrimonios
    .reduce((s, p) => s + Number(p.valorAtual), 0);

  // === SALDO DO MÊS — CÁLCULO COMPLETO ===
  // Entradas do mês
  const ReceberMes = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento?.startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalEntradas = totalRenda + ReceberMes;

  // Saídas do mês
  const totalCartoesMes = compras
    .reduce((s, c) => s + Number(c.valorParcela), 0);

  const totalPagarMes = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento?.startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const totalSaidas = totalCartoesMes + totalPagarMes + totalServicos;

  const saldoPrevisto = totalEntradas - totalSaidas;

  const saldoColor =
    saldoPrevisto > 0 ? "text-emerald-600"
    : saldoPrevisto === 0 ? "text-blue-600"
    : "text-red-600";

  const saldoIconBg =
    saldoPrevisto > 0 ? "bg-emerald-500/10 text-emerald-600"
    : saldoPrevisto === 0 ? "bg-blue-500/10 text-blue-600"
    : "bg-red-500/10 text-red-600";

  const today = format(new Date(), "yyyy-MM-dd");
  const in5Days = format(new Date(Date.now() + 5 * 86400000), "yyyy-MM-dd");
  const in7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const proximosVencimentos = dividas
    .filter((d) => d.status === "pendente")
    .sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""))
    .slice(0, 6);

  const vencendo5Dias = dividas.filter(
    (d) => d.status === "pendente" && d.dataVencimento && d.dataVencimento >= today && d.dataVencimento <= in5Days
  );
  const vencidos = dividas.filter(
    (d) => d.status === "pendente" && d.dataVencimento && d.dataVencimento < today
  );

  const getCardUsage = (cartaoId: string) =>
    compras.filter((c) => c.cartaoId === cartaoId).reduce((s, c) => s + Number(c.valorParcela), 0);

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "Desconhecido";

  // === A PAGAR NA SEMANA (dívidas + cartões + serviços vencendo em até 7 dias) ===
  interface PagarSemanaItem {
    id: string;
    title: string;
    dateStr: string;
    amount: number;
    type: "divida" | "cartao" | "servico";
  }

  const pagarSemana: PagarSemanaItem[] = useMemo(() => {
    const items: PagarSemanaItem[] = [];

    dividas
      .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento && d.dataVencimento <= in7Days)
      .forEach((d) => {
        items.push({
          id: `div-${d.id}`,
          title: d.descricao || pessoas.find((p) => p.id === d.pessoaId)?.nome || "Pagamento",
          dateStr: d.dataVencimento!,
          amount: Number(d.valor),
          type: "divida",
        });
      });

    cartoes.forEach((c) => {
      const usado = compras.filter((cc) => cc.cartaoId === c.id).reduce((s, cc) => s + Number(cc.valorParcela), 0);
      if (usado <= 0) return;
      const now = new Date();
      const vencDate = new Date(now.getFullYear(), now.getMonth(), c.diaVencimento);
      const vencStr = format(vencDate, "yyyy-MM-dd");
      if (vencStr >= today && vencStr <= in7Days) {
        items.push({ id: `cat-${c.id}`, title: `Fatura ${c.nome}`, dateStr: vencStr, amount: usado, type: "cartao" });
      }
    });

    servicos.filter((s) => s.status === "ativo").forEach((s) => {
      const now = new Date();
      let d = new Date(now.getFullYear(), now.getMonth(), s.dataCobranca);
      if (format(d, "yyyy-MM-dd") < today) d = new Date(now.getFullYear(), now.getMonth() + 1, s.dataCobranca);
      const ds = format(d, "yyyy-MM-dd");
      if (ds >= today && ds <= in7Days) {
        items.push({ id: `svc-${s.id}`, title: s.nome, dateStr: ds, amount: Number(s.valorMensal), type: "servico" });
      }
    });

    return items.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividas, cartoes, servicos, compras, pessoas, today, in7Days]);

  const alertCartoes = cartoes.filter((c) => {
    const usado = getCardUsage(c.id);
    return (usado / Number(c.limite)) >= 0.8;
  });

  // === TOOLTIPS ===
  const mask = (v: string) => maskValue(v, visible);

  const aReceberTooltip = useMemo(() => {
    const items = dividas
      .filter((d) => d.tipo === "receber" && d.status === "pendente")
      .sort((a, b) => Number(b.valor) - Number(a.valor))
      .slice(0, 5);
    if (items.length === 0) return ["Nenhum valor a receber pendente."];
    return [
      "Principais valores a receber:",
      ...items.map(d => `• ${getPessoaNome(d.pessoaId)} — ${mask(formatCurrency(Number(d.valor)))}`),
      "---",
      `Total: ${mask(formatCurrency(totalReceber))}`
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividas, pessoas, totalReceber, visible]);

  const aPagarTooltip = useMemo(() => {
    const items = dividas
      .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento)
      .sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""))
      .slice(0, 5);
    if (items.length === 0) return ["Nenhum vencimento pendente."];
    return [
      "Próximos vencimentos:",
      ...items.map(d => `• ${(d.descricao || getPessoaNome(d.pessoaId)).slice(0, 25)} — ${mask(formatCurrency(Number(d.valor)))} (${d.dataVencimento ? format(parseISO(d.dataVencimento), 'dd/MM') : 'S/D'})`),
      "---",
      `Total: ${mask(formatCurrency(totalPagar))}`
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividas, pessoas, totalPagar, visible]);

  const gastosFixosTooltip = useMemo(() => {
    const items = servicos.filter((s) => s.status === "ativo");
    if (items.length === 0) return ["Nenhum serviço ativo."];
    return [
      "Serviços ativos:",
      ...items.map(s => `• ${s.nome} — ${mask(formatCurrency(Number(s.valorMensal)))}/mês`),
      "---",
      `Total: ${mask(formatCurrency(totalServicos))}`
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicos, totalServicos, visible]);

  const saldoMesTooltip = useMemo(() => [
    "ENTRADAS",
    `• Renda mensal: ${mask(formatCurrency(totalRenda))}`,
    ...(ReceberMes > 0 ? [`• A receber (mês): ${mask(formatCurrency(ReceberMes))}`] : []),
    `Total entradas: ${mask(formatCurrency(totalEntradas))}`,
    "---",
    "SAÍDAS",
    `• Cartões: ${mask(formatCurrency(totalCartoesMes))}`,
    `• A pagar (mês): ${mask(formatCurrency(totalPagarMes))}`,
    `• Serviços: ${mask(formatCurrency(totalServicos))}`,
    `Total saídas: ${mask(formatCurrency(totalSaidas))}`,
    "---",
    `Saldo = ${mask(formatCurrency(totalEntradas))} - ${mask(formatCurrency(totalSaidas))} = ${mask(formatCurrency(saldoPrevisto))}`,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [totalRenda, ReceberMes, totalEntradas, totalCartoesMes, totalPagarMes, totalServicos, totalSaidas, saldoPrevisto, visible]);

  const rendaMensalTooltip = useMemo(() => {
    const items = rendas.filter((r) => r.ativo);
    if (items.length === 0) return ["Nenhuma renda cadastrada.", "Acesse /renda para adicionar."];
    return [
      "Fontes de renda ativas:",
      ...items.map(r => `• ${r.descricao} — ${mask(formatCurrency(Number(r.valor)))} (${r.tipo === 'fixo' ? 'Fixo' : 'Variável'})`),
      "---",
      `Total: ${mask(formatCurrency(totalRenda))}`
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendas, totalRenda, visible]);

  const patrimonioTooltip = useMemo(() => {
    if (patrimonios.length === 0) return ["Nenhum patrimônio cadastrado."];
    const grouped = patrimonios.reduce((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] || 0) + Number(p.valorAtual);
      return acc;
    }, {} as Record<string, number>);

    const tipoLabels: Record<string, string> = {
      conta_bancaria: "Conta Bancária",
      dinheiro: "Dinheiro",
      poupanca: "Poupança",
      investimento: "Investimento",
      outros: "Outros"
    };

    return [
      "Distribuição por tipo:",
      ...Object.entries(grouped).map(([tipo, total]) => `• ${tipoLabels[tipo] || tipo}: ${mask(formatCurrency(total))}`),
      "---",
      `Total: ${mask(formatCurrency(totalPatrimonio))}`
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrimonios, totalPatrimonio, visible]);

  const alertas: { icon: any; color: string; bgColor: string; texto: string }[] = [];
  if (vencidos.length > 0) {
    alertas.push({
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-500/5 border-red-500/20",
      texto: `Você tem ${vencidos.length} dívida(s) vencida(s) que precisam de atenção`,
    });
  }
  if (vencendo5Dias.length > 0) {
    alertas.push({
      icon: Bell,
      color: "text-amber-600",
      bgColor: "bg-amber-500/5 border-amber-500/20",
      texto: `${vencendo5Dias.length} conta(s) vencem nos proximos 5 dias`,
    });
  }
  if (saldoPrevisto < 0) {
    alertas.push({
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-500/5 border-red-500/20",
      texto: `Saldo do mês negativo: ${maskValue(formatCurrency(saldoPrevisto), visible)}`,
    });
  }
  for (const c of alertCartoes) {
    const usado = getCardUsage(c.id);
    const pct = Math.round((usado / Number(c.limite)) * 100);
    alertas.push({
      icon: CreditCard,
      color: "text-amber-600",
      bgColor: "bg-amber-500/5 border-amber-500/20",
      texto: `Cartao ${c.nome} esta usando ${pct}% do limite`,
    });
  }
  if (alertas.length === 0) {
    alertas.push({
      icon: CheckCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/5 border-emerald-500/20",
      texto: "Tudo em ordem! Nenhum alerta no momento.",
    });
  }

  const score = calcularScore(dividas, servicos, cartoes, compras, rendas);
  const insights = gerarInsights(dividas, servicos, cartoes, compras, rendas);

  const scoreBarColor =
    score.valor >= 80 ? "bg-emerald-500" :
    score.valor >= 60 ? "bg-primary" :
    score.valor >= 40 ? "bg-amber-500" :
    "bg-red-500";

  const scoreLabelColor =
    score.valor >= 80 ? "text-emerald-600" :
    score.valor >= 60 ? "text-primary" :
    score.valor >= 40 ? "text-amber-600" :
    "text-red-600";

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

  const allDashCards = [
    { id: "receber", title: "A receber" },
    { id: "pagar", title: "A pagar" },
    { id: "servicos", title: "Gastos fixos" },
    { id: "saldo", title: "Saldo do mês" },
    { id: "renda", title: "Renda mensal" },
    { id: "patrimonio", title: "Patrimônio total" },
  ];

  if (prefs.mobileMode) {
    const visibleCards = allDashCards.filter(c => !prefs.hiddenDashCards.includes(c.id));
    const cardDataMap: Record<string, { value: string; icon: any; iconColor: string; bg: string; valueColor: string }> = {
      receber: { value: maskValue(formatCurrency(totalReceber), visible), icon: ArrowUpRight, iconColor: "text-emerald-600", bg: "bg-emerald-500/10", valueColor: "text-emerald-600" },
      pagar: { value: maskValue(formatCurrency(totalPagar), visible), icon: ArrowDownRight, iconColor: "text-red-500", bg: "bg-red-500/10", valueColor: "text-red-600" },
      servicos: { value: maskValue(formatCurrency(totalServicos), visible), icon: Receipt, iconColor: "text-amber-500", bg: "bg-amber-500/10", valueColor: "text-foreground" },
      saldo: { value: maskValue(formatCurrency(saldoPrevisto), visible), icon: saldoPrevisto >= 0 ? TrendingUp : TrendingDown, iconColor: saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-500", bg: saldoPrevisto >= 0 ? "bg-emerald-500/10" : "bg-red-500/10", valueColor: saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600" },
      renda: { value: maskValue(formatCurrency(totalRenda), visible), icon: DollarSign, iconColor: "text-emerald-600", bg: "bg-emerald-500/10", valueColor: "text-emerald-600" },
      patrimonio: { value: maskValue(formatCurrency(totalPatrimonio), visible), icon: PiggyBank, iconColor: "text-blue-500", bg: "bg-blue-500/10", valueColor: "text-blue-600" },
    };

    const selectedMonthLabel = monthOptions.find(o => o.value === selectedMonth)?.label || selectedMonth;

    return (
      <div className="min-h-screen bg-background pb-24" data-testid="dashboard-mobile">
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
                      <Switch id="mobile-mode-m" checked={prefs.mobileMode} onCheckedChange={toggleMobileMode} />
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
            <p className="text-4xl font-bold tracking-tight mb-3">{maskValue(formatCurrency(saldoPrevisto), visible)}</p>
            <div className="flex gap-4 text-sm opacity-85">
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{maskValue(formatCurrency(totalRenda), visible)}</span>
              </div>
              <div className="w-px bg-white/30" />
              <div className="flex items-center gap-1.5">
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>{maskValue(formatCurrency(totalCartoesMes + totalPagarMes + totalServicos), visible)}</span>
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
                      {maskValue(formatCurrency(item.amount), visible)}
                    </span>
                  </div>
                );
              })}
              <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Total da semana</span>
                <span className="text-sm font-bold text-red-600">
                  {maskValue(formatCurrency(pagarSemana.reduce((s, i) => s + i.amount, 0)), visible)}
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
            <div className="px-4 pt-4 pb-2">
              <span className="font-semibold text-sm">Resumo do Score</span>
            </div>
            <div className="px-4 pb-3 space-y-2.5">
              {score.fatores.map((f, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{f.label}</span>
                  <span className={`text-sm font-semibold ${f.tipo === "positivo" ? "text-emerald-600" : f.tipo === "negativo" ? "text-red-500" : "text-muted-foreground"}`}>
                    {f.impacto > 0 ? "+" : ""}{f.impacto}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
            <p className="text-muted-foreground text-sm">Resumo financeiro geral</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Personalizar Painel">
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
                    onCheckedChange={toggleMobileMode}
                    data-testid="toggle-mobile-mode"
                  />
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
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 w-[200px] text-sm" data-testid="select-month">
              <SelectValue placeholder="Selecionar mês" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-xl border bg-card min-w-[200px]"
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

      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 ${prefs.dashboardCompact ? "gap-2" : "gap-4"}`}>
        {!prefs.hiddenDashCards.includes("receber") && (
          <StatCard
            title="A receber"
            value={maskValue(formatCurrency(totalReceber), visible)}
            icon={ArrowUpRight}
            trend={`${dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").length} pendentes`}
            color="bg-emerald-500/10 text-emerald-600"
            valueColor="text-emerald-600"
            tooltipLines={aReceberTooltip}
            compact={prefs.dashboardCompact}
          />
        )}
        {!prefs.hiddenDashCards.includes("pagar") && (
          <StatCard
            title="A pagar"
            value={maskValue(formatCurrency(totalPagar), visible)}
            icon={ArrowDownRight}
            trend={`${dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} pendentes`}
            color="bg-red-500/10 text-red-600"
            valueColor="text-red-600"
            tooltipLines={aPagarTooltip}
            compact={prefs.dashboardCompact}
          />
        )}
        {!prefs.hiddenDashCards.includes("servicos") && (
          <StatCard
            title="Gastos fixos"
            value={maskValue(formatCurrency(totalServicos), visible)}
            icon={Receipt}
            trend={`${servicos.filter((s) => s.status === "ativo").length} ativos`}
            color="bg-amber-500/10 text-amber-600"
            tooltipLines={gastosFixosTooltip}
            compact={prefs.dashboardCompact}
          />
        )}
        {!prefs.hiddenDashCards.includes("saldo") && (
          <StatCard
            title="Saldo do mês"
            value={maskValue(formatCurrency(saldoPrevisto), visible)}
            icon={saldoPrevisto >= 0 ? TrendingUp : TrendingDown}
            trend="Entradas - Saídas"
            color={saldoIconBg}
            valueColor={saldoColor}
            tooltipLines={saldoMesTooltip}
            compact={prefs.dashboardCompact}
          />
        )}
        {!prefs.hiddenDashCards.includes("renda") && (
          <StatCard
            title="Renda mensal"
            value={maskValue(formatCurrency(totalRenda), visible)}
            icon={DollarSign}
            trend={`${rendas.filter((r) => r.ativo).length} fontes ativas`}
            color="bg-emerald-500/10 text-emerald-600"
            valueColor="text-emerald-600"
            tooltipLines={rendaMensalTooltip}
            compact={prefs.dashboardCompact}
          />
        )}
        {!prefs.hiddenDashCards.includes("patrimonio") && (
          <StatCard
            title="Patrimônio total"
            value={maskValue(formatCurrency(totalPatrimonio), visible)}
            icon={PiggyBank}
            trend={`${patrimonios.length} itens`}
            color="bg-blue-500/10 text-blue-600"
            valueColor="text-blue-600"
            tooltipLines={patrimonioTooltip}
            compact={prefs.dashboardCompact}
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
                      {maskValue(formatCurrency(item.amount), visible)}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground">Total da semana</span>
                <span className="text-sm font-bold text-red-600">
                  {maskValue(formatCurrency(pagarSemana.reduce((s, i) => s + i.amount, 0)), visible)}
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
              <CalendarClock className="w-4 h-4" /> Proximos vencimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proximosVencimentos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum vencimento pendente</p>
              </div>
            ) : (
              <div className="space-y-2">
                {proximosVencimentos.map((d) => {
                  const urgency = getUrgencyStyle(d.dataVencimento, d.status);
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/40"
                      data-testid={`vencimento-${d.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${urgency.dot}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{getPessoaNome(d.pessoaId)}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.dataVencimento}
                            {urgency.label && (
                              <span className={`ml-1 font-medium ${urgency.labelClass}`}>
                                · {urgency.label}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={d.tipo === "receber" ? "default" : "destructive"} className="text-xs">
                          {d.tipo === "receber" ? "Receber" : "Pagar"}
                        </Badge>
                        <span className="text-sm font-semibold">{maskValue(formatCurrency(Number(d.valor)), visible)}</span>
                      </div>
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
