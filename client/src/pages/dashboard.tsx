import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Wallet, CalendarClock,
  ArrowUpRight, ArrowDownRight, Receipt, Bell,
  AlertTriangle, CreditCard, CheckCircle, ShieldAlert, ShieldCheck, Shield,
} from "lucide-react";
import type { Divida, Servico, Pessoa, Cartao, CompraCartao } from "@shared/schema";
import { format, differenceInDays, parseISO } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getUrgencyStyle(dataVencimento: string, status: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (status === "pago") return { dot: "bg-emerald-500", label: "", labelClass: "" };
  if (dataVencimento < today) return { dot: "bg-red-500", label: "Vencido", labelClass: "text-red-600" };
  const days = differenceInDays(parseISO(dataVencimento), new Date());
  if (days <= 7) return { dot: "bg-amber-400", label: `${days}d`, labelClass: "text-amber-600" };
  return { dot: "bg-emerald-400", label: `${days}d`, labelClass: "text-emerald-600" };
}

function StatCard({ title, value, icon: Icon, trend, color }: {
  title: string; value: string; icon: any; trend?: string; color: string;
}) {
  return (
    <Card className="hover-elevate">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`flex items-center justify-center w-10 h-10 rounded-md ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: pessoas = [], isLoading: l3 } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });

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

  const saldoPrevisto = totalReceber - totalPagar - totalServicos;

  const today = format(new Date(), "yyyy-MM-dd");
  const in5Days = format(new Date(Date.now() + 5 * 86400000), "yyyy-MM-dd");
  const in7Days = format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd");

  const proximosVencimentos = dividas
    .filter((d) => d.status === "pendente")
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    .slice(0, 6);

  const vencendo5Dias = dividas.filter(
    (d) => d.status === "pendente" && d.dataVencimento >= today && d.dataVencimento <= in5Days
  );
  const vencidos = dividas.filter(
    (d) => d.status === "pendente" && d.dataVencimento < today
  );

  const getCardUsage = (cartaoId: string) => {
    const total = compras.filter((c) => c.cartaoId === cartaoId).reduce((s, c) => s + Number(c.valorParcela), 0);
    return total;
  };
  const alertCartoes = cartoes.filter((c) => {
    const usado = getCardUsage(c.id);
    return (usado / Number(c.limite)) >= 0.8;
  });

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "Desconhecido";

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

  const overdueCount = vencidos.length;
  const highCardUsage = alertCartoes.length;
  const negativeBalance = saldoPrevisto < 0 ? 1 : 0;
  const riskScore = overdueCount + highCardUsage + negativeBalance;

  let scoreLabel: string;
  let scoreColor: string;
  let ScoreIcon: any;
  if (riskScore === 0) {
    scoreLabel = "Saude financeira: Otima";
    scoreColor = "text-emerald-600";
    ScoreIcon = ShieldCheck;
  } else if (riskScore <= 1) {
    scoreLabel = "Saude financeira: Atencao";
    scoreColor = "text-amber-600";
    ScoreIcon = Shield;
  } else {
    scoreLabel = "Saude financeira: Risco";
    scoreColor = "text-red-600";
    ScoreIcon = ShieldAlert;
  }

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
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
          riskScore === 0
            ? "border-emerald-500/20 bg-emerald-500/5"
            : riskScore <= 1
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`} data-testid="score-financeiro">
          <ScoreIcon className={`w-4 h-4 ${scoreColor}`} />
          <span className={`text-sm font-medium ${scoreColor}`}>{scoreLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="A receber"
          value={formatCurrency(totalReceber)}
          icon={ArrowUpRight}
          trend={`${dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").length} pendentes`}
          color="bg-emerald-500/10 text-emerald-600"
        />
        <StatCard
          title="A pagar"
          value={formatCurrency(totalPagar)}
          icon={ArrowDownRight}
          trend={`${dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} pendentes`}
          color="bg-red-500/10 text-red-600"
        />
        <StatCard
          title="Gastos fixos"
          value={formatCurrency(totalServicos)}
          icon={Receipt}
          trend={`${servicos.filter((s) => s.status === "ativo").length} servicos ativos`}
          color="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          title="Saldo previsto"
          value={formatCurrency(saldoPrevisto)}
          icon={saldoPrevisto >= 0 ? TrendingUp : TrendingDown}
          trend="Receitas - Despesas"
          color={saldoPrevisto >= 0 ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-600"}
        />
      </div>

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
              <TrendingUp className="w-4 h-4" /> Resumo geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Pessoas cadastradas</span>
                <span className="font-semibold">{pessoas.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Dividas em aberto</span>
                <span className="font-semibold">
                  {dividas.filter((d) => d.status === "pendente").length}
                </span>
              </div>
              {vencidos.length > 0 && (
                <div className="flex justify-between items-center p-3 rounded-md bg-red-500/5 border border-red-500/10">
                  <span className="text-sm text-red-600 font-medium">Vencidas</span>
                  <span className="font-bold text-red-600">{vencidos.length}</span>
                </div>
              )}
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Dividas quitadas</span>
                <span className="font-semibold text-emerald-600">
                  {dividas.filter((d) => d.status === "pago").length}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">Servicos ativos</span>
                <span className="font-semibold">{servicos.filter((s) => s.status === "ativo").length}</span>
              </div>
              <div className={`flex justify-between items-center p-3 rounded-md ${
                saldoPrevisto >= 0 ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-red-500/5 border border-red-500/10"
              }`}>
                <span className="text-sm font-medium">Balanco geral</span>
                <span className={`font-bold ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(saldoPrevisto)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
