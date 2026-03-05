import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, CalendarClock,
  ArrowUpRight, ArrowDownRight, Receipt, Bell,
  AlertTriangle, CreditCard, CheckCircle, Lightbulb,
  Trophy, Star, RotateCcw, Target, DollarSign, PiggyBank,
} from "lucide-react";
import type { Divida, Servico, Pessoa, Cartao, CompraCartao, Renda, Patrimonio } from "@shared/schema";
import { format, differenceInDays, parseISO } from "date-fns";
import { calcularScore, gerarInsights } from "@/utils/financialEngine";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo } from "react";

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

function StatCard({ title, value, icon: Icon, trend, color, tooltipLines }: {
  title: string; value: string; icon: any; trend?: string; color: string; tooltipLines?: string[];
}) {
  const card = (
    <Card className="hover-elevate min-h-[100px]">
      <CardContent className="p-5 h-full">
        <div className="flex items-start justify-between gap-2 h-full">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-xl font-bold tracking-tight truncate" title={value}>{value}</p>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`flex items-center justify-center w-10 h-10 rounded-md flex-shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!tooltipLines?.length) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[280px] p-3">
        <div className="space-y-1 text-xs">
          {tooltipLines.map((line, i) => (
            <div key={i} className={line.startsWith('---') ? 'border-t my-1' : ''}>{line.startsWith('---') ? '' : line}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
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
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: pessoas = [], isLoading: l3 } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: rendas = [] } = useQuery<Renda[]>({ queryKey: ["/api/rendas"] });
  const { data: patrimonios = [] } = useQuery<Patrimonio[]>({ queryKey: ["/api/patrimonios"] });

  const isLoading = l1 || l2 || l3;

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

  const saldoPrevisto = totalRenda > 0
    ? totalRenda - totalServicos - totalPagar
    : totalReceber - totalPagar - totalServicos;

  const today = format(new Date(), "yyyy-MM-dd");
  const in5Days = format(new Date(Date.now() + 5 * 86400000), "yyyy-MM-dd");

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

  const alertCartoes = cartoes.filter((c) => {
    const usado = getCardUsage(c.id);
    return (usado / Number(c.limite)) >= 0.8;
  });

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "Desconhecido";

  const aReceberTooltip = useMemo(() => {
    const items = dividas
      .filter((d) => d.tipo === "receber" && d.status === "pendente")
      .sort((a, b) => Number(b.valor) - Number(a.valor))
      .slice(0, 5);
    if (items.length === 0) return ["Nenhum valor a receber pendente."];
    return [
      "Principais valores a receber:",
      ...items.map(d => `• ${getPessoaNome(d.pessoaId)} — ${formatCurrency(Number(d.valor))}`),
      "---",
      `Total: ${formatCurrency(totalReceber)}`
    ];
  }, [dividas, pessoas, totalReceber]);

  const aPagarTooltip = useMemo(() => {
    const items = dividas
      .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento)
      .sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""))
      .slice(0, 5);
    if (items.length === 0) return ["Nenhum vencimento pendente."];
    return [
      "Próximos vencimentos:",
      ...items.map(d => `• ${(d.descricao || getPessoaNome(d.pessoaId)).slice(0, 25)} — ${formatCurrency(Number(d.valor))} (${d.dataVencimento ? format(parseISO(d.dataVencimento), 'dd/MM') : 'S/D'})`),
      "---",
      `Total: ${formatCurrency(totalPagar)}`
    ];
  }, [dividas, pessoas, totalPagar]);

  const gastosFixosTooltip = useMemo(() => {
    const items = servicos.filter((s) => s.status === "ativo");
    if (items.length === 0) return ["Nenhum serviço ativo."];
    return [
      "Serviços ativos:",
      ...items.map(s => `• ${s.nome} — ${formatCurrency(Number(s.valorMensal))}/mês`),
      "---",
      `Total: ${formatCurrency(totalServicos)}`
    ];
  }, [servicos, totalServicos]);

  const saldoMesTooltip = useMemo(() => [
    totalRenda > 0 ? `Renda: ${formatCurrency(totalRenda)}` : `A receber: ${formatCurrency(totalReceber)}`,
    `Serviços: -${formatCurrency(totalServicos)}`,
    `A pagar: -${formatCurrency(totalPagar)}`,
    "---",
    `Saldo: ${formatCurrency(saldoPrevisto)}`
  ], [totalRenda, totalReceber, totalServicos, totalPagar, saldoPrevisto]);

  const rendaMensalTooltip = useMemo(() => {
    const items = rendas.filter((r) => r.ativo);
    if (items.length === 0) return ["Nenhuma renda cadastrada.", "Acesse /renda para adicionar."];
    return [
      "Fontes de renda ativas:",
      ...items.map(r => `• ${r.descricao} — ${formatCurrency(Number(r.valor))} (${r.tipo === 'fixo' ? 'Fixo' : 'Variável'})`),
      "---",
      `Total: ${formatCurrency(totalRenda)}`
    ];
  }, [rendas, totalRenda]);

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
      ...Object.entries(grouped).map(([tipo, total]) => `• ${tipoLabels[tipo] || tipo}: ${formatCurrency(total)}`),
      "---",
      `Total: ${formatCurrency(totalPatrimonio)}`
    ];
  }, [patrimonios, totalPatrimonio]);

  const alertas: { icon: any; color: string; bgColor: string; texto: string }[] = [];
  if (vencidos.length > 0) {
    alertas.push({
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-500/5 border-red-500/20",
      texto: `Voce tem ${vencidos.length} divida(s) vencida(s) que precisam de atencao`,
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
      texto: `Seu saldo previsto esta negativo: ${formatCurrency(saldoPrevisto)}`,
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

  const score = calcularScore(dividas, servicos, cartoes, compras);
  const insights = gerarInsights(dividas, servicos, cartoes, compras);

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

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
          <p className="text-muted-foreground">Resumo financeiro geral</p>
        </div>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="A receber"
          value={formatCurrency(totalReceber)}
          icon={ArrowUpRight}
          trend={`${dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").length} pendentes`}
          color="bg-emerald-500/10 text-emerald-600"
          tooltipLines={aReceberTooltip}
        />
        <StatCard
          title="A pagar"
          value={formatCurrency(totalPagar)}
          icon={ArrowDownRight}
          trend={`${dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} pendentes`}
          color="bg-red-500/10 text-red-600"
          tooltipLines={aPagarTooltip}
        />
        <StatCard
          title="Gastos fixos"
          value={formatCurrency(totalServicos)}
          icon={Receipt}
          trend={`${servicos.filter((s) => s.status === "ativo").length} ativos`}
          color="bg-amber-500/10 text-amber-600"
          tooltipLines={gastosFixosTooltip}
        />
        <StatCard
          title="Saldo do mês"
          value={formatCurrency(saldoPrevisto)}
          icon={saldoPrevisto >= 0 ? TrendingUp : TrendingDown}
          trend={totalRenda > 0 ? "Renda - Gastos" : "Receitas - Despesas"}
          color={saldoPrevisto >= 0 ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-600"}
          tooltipLines={saldoMesTooltip}
        />
        <StatCard
          title="Renda mensal"
          value={formatCurrency(totalRenda)}
          icon={DollarSign}
          trend={`${rendas.filter((r) => r.ativo).length} fontes ativas`}
          color="bg-emerald-500/10 text-emerald-600"
          tooltipLines={rendaMensalTooltip}
        />
        <StatCard
          title="Patrimônio total"
          value={formatCurrency(totalPatrimonio)}
          icon={PiggyBank}
          trend={`${patrimonios.length} itens`}
          color="bg-blue-500/10 text-blue-600"
          tooltipLines={patrimonioTooltip}
        />
      </div>

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
                        <span className="text-sm font-semibold">{formatCurrency(Number(d.valor))}</span>
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
                <span className="text-sm text-muted-foreground">Dividas quitadas</span>
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
