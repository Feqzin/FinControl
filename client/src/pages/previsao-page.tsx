import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Calendar } from "lucide-react";
import type { Divida, Servico } from "@shared/schema";
import { format } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function PrevisaoPage() {
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const isLoading = l1 || l2;

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");

  const receberMes = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const pagarMes = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .reduce((s, d) => s + Number(d.valor), 0);

  const servicosMes = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + Number(sv.valorMensal), 0);

  const totalSaida = pagarMes + servicosMes;
  const saldoPrevisto = receberMes - totalSaida;

  const entradasMes = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

  const saidasMes = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente" && d.dataVencimento.startsWith(currentMonth))
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="previsao-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Previsao de Entrada e Saida</h1>
        <p className="text-muted-foreground">Projecao financeira para {format(now, "MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-emerald-500/10">
                <ArrowUpRight className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total a receber</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(receberMes)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{entradasMes.length} lancamento(s) este mes</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-red-500/10">
                <ArrowDownRight className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total a pagar</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalSaida)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {saidasMes.length} divida(s) + {servicos.filter((s) => s.status === "ativo").length} servico(s)
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saldo previsto</p>
                <p className={`text-2xl font-bold ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(saldoPrevisto)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Receitas - Despesas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Entradas previstas ({entradasMes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entradasMes.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma entrada prevista</p>
            ) : (
              <div className="space-y-2">
                {entradasMes.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">{d.descricao || "Divida"}</p>
                      <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                    </div>
                    <span className="font-semibold text-emerald-600">{formatCurrency(Number(d.valor))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
              Saidas previstas ({saidasMes.length + servicos.filter((s) => s.status === "ativo").length})
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
                  <span className="font-semibold text-red-600">{formatCurrency(Number(s.valorMensal))}</span>
                </div>
              ))}
              {saidasMes.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{d.descricao || "Divida"}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {d.dataVencimento}</p>
                  </div>
                  <span className="font-semibold text-red-600">{formatCurrency(Number(d.valor))}</span>
                </div>
              ))}
              {saidasMes.length === 0 && servicos.filter((s) => s.status === "ativo").length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma saida prevista</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
