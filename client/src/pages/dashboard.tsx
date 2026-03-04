import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Wallet, CalendarClock,
  ArrowUpRight, ArrowDownRight, Receipt,
} from "lucide-react";
import type { Divida, Servico, Pessoa } from "@shared/schema";
import { format, parseISO, isAfter, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

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
            {trend && (
              <p className="text-xs text-muted-foreground">{trend}</p>
            )}
          </div>
          <div className={`flex items-center justify-center w-10 h-10 rounded-md ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Dashboard() {
  const { data: dividas = [], isLoading: loadingDividas } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: loadingServicos } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: pessoas = [], isLoading: loadingPessoas } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const isLoading = loadingDividas || loadingServicos || loadingPessoas;

  const totalReceber = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente")
    .reduce((sum, d) => sum + Number(d.valor), 0);

  const totalPagar = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente")
    .reduce((sum, d) => sum + Number(d.valor), 0);

  const totalServicos = servicos
    .filter((s) => s.status === "ativo")
    .reduce((sum, s) => sum + Number(s.valorMensal), 0);

  const saldoPrevisto = totalReceber - totalPagar - totalServicos;

  const now = new Date();
  const proximosVencimentos = dividas
    .filter((d) => d.status === "pendente")
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    .slice(0, 5);

  const getPessoaNome = (pessoaId: string) => {
    const p = pessoas.find((p) => p.id === pessoaId);
    return p?.nome || "Desconhecido";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="dashboard-loading">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
        <p className="text-muted-foreground">Resumo financeiro do mes</p>
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
          icon={Wallet}
          trend="Previsao mensal"
          color={saldoPrevisto >= 0 ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-600"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              Proximos vencimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proximosVencimentos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum vencimento pendente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {proximosVencimentos.map((d) => {
                  const isOverdue = d.dataVencimento < format(now, "yyyy-MM-dd");
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50" data-testid={`vencimento-${d.id}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-500" : "bg-amber-500"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{getPessoaNome(d.pessoaId)}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.dataVencimento}
                            {isOverdue && " - Vencido"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={d.tipo === "receber" ? "default" : "destructive"}>
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
              <TrendingUp className="w-4 h-4" />
              Resumo rapido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">Total de pessoas</span>
                <span className="font-semibold">{pessoas.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">Dividas em aberto</span>
                <span className="font-semibold">{dividas.filter((d) => d.status === "pendente").length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">Dividas quitadas</span>
                <span className="font-semibold">{dividas.filter((d) => d.status === "pago").length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">Servicos ativos</span>
                <span className="font-semibold">{servicos.filter((s) => s.status === "ativo").length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-md bg-emerald-500/5">
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
