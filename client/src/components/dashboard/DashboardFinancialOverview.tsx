import type { FinancialScore } from "@shared/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, CalendarClock, CreditCard, Receipt, TrendingUp } from "lucide-react";
import { DateBadge, urgencyLabel } from "@/pages/dashboard/components/date-badge";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";

type DashboardSectionStatus = {
  isLoading: boolean;
  isError: boolean;
  message: string | null;
};

type VencimentoItem = {
  id: string;
  tipo: "cartao" | "divida" | "servico";
  nome: string;
  subtitulo: string;
  valor: number;
  dataVenc: string;
};

type PagarSemanaItem = {
  id: string;
  title: string;
  dateStr: string;
  amount: number;
};

type DashboardFinancialOverviewProps = {
  proximosStatus: DashboardSectionStatus;
  scoreDetalhadoStatus: DashboardSectionStatus;
  pagarSemanaStatus: DashboardSectionStatus;
  proximosVencimentos: VencimentoItem[];
  pagarSemana: PagarSemanaItem[];
  score: FinancialScore;
  scoreBarColor: string;
  scoreLabelColor: string;
  pessoasCount: number;
  dividasQuitadas: number;
  showAdvancedResources: boolean;
  showContextualTips: boolean;
  today: string;
  in7Days: string;
  formatMoney: (value: number) => string;
};

function SectionErrorState({ message }: { message?: string | null }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
      <p className="font-medium">Não foi possível carregar esta seção agora.</p>
      {message && <p className="mt-1 text-xs opacity-90">{message}</p>}
    </div>
  );
}

export function DashboardFinancialOverview({
  proximosStatus,
  scoreDetalhadoStatus,
  pagarSemanaStatus,
  proximosVencimentos,
  pagarSemana,
  score,
  scoreBarColor,
  scoreLabelColor,
  pessoasCount,
  dividasQuitadas,
  showAdvancedResources,
  showContextualTips,
  today,
  in7Days,
  formatMoney,
}: DashboardFinancialOverviewProps) {
  return (
    <>
      <Card className="border-border/60 bg-card/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> Próximos vencimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proximosStatus.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((idx) => (
                <Skeleton key={idx} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : proximosStatus.isError ? (
            <SectionErrorState message={proximosStatus.message} />
          ) : proximosVencimentos.length === 0 ? (
            <DashboardEmptyState
              icon={CalendarClock}
              title="Nenhum vencimento pendente"
              description="Sem contas próximas para este período."
            />
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
                    className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
                    data-testid={`vencimento-${item.id}`}
                  >
                    <div className={`h-8 w-8 flex-shrink-0 rounded-lg ${tipoBg} flex items-center justify-center`}>
                      <TipoIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.nome}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <div className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                        <p className={`text-xs ${isPast || isToday ? "text-red-600 font-medium" : isThisWeek ? "text-amber-600" : "text-muted-foreground"}`}>
                          {item.subtitulo}
                        </p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold">{formatMoney(item.valor)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showAdvancedResources ? (
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Score detalhado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scoreDetalhadoStatus.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((idx) => (
                  <Skeleton key={idx} className="h-14 rounded-md" />
                ))}
              </div>
            ) : scoreDetalhadoStatus.isError ? (
              <SectionErrorState message={scoreDetalhadoStatus.message} />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">Pontuacao geral</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${scoreBarColor}`} style={{ width: `${score.valor}%` }} />
                    </div>
                    <span className={`text-sm font-bold ${scoreLabelColor}`}>{score.valor}/100</span>
                  </div>
                </div>

                {score.fatores.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 p-2.5 text-sm">
                    <span className="mr-2 truncate text-muted-foreground">{f.label}</span>
                    <span
                      className={`flex-shrink-0 font-semibold ${
                        f.tipo === "positivo"
                          ? "text-emerald-600"
                          : f.tipo === "negativo"
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {f.impacto > 0 ? "+" : ""}
                      {f.impacto}
                    </span>
                  </div>
                ))}

                <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">Pessoas cadastradas</span>
                  <span className="font-semibold">{pessoasCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">Dívidas quitadas</span>
                  <span className="font-semibold text-emerald-600">{dividasQuitadas}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showContextualTips ? (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Dica contextual</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Priorize quitar pendências vencidas primeiro para reduzir juros e melhorar seu fluxo mensal.
          </p>
        </div>
      ) : null}

      {pagarSemanaStatus.isLoading ? (
        <Skeleton className="h-[220px] rounded-2xl" />
      ) : pagarSemanaStatus.isError ? (
        <SectionErrorState message={pagarSemanaStatus.message} />
      ) : pagarSemana.length > 0 ? (
        <Card className="border-border/60 bg-card/95 shadow-sm" data-testid="pagar-semana-widget">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              A Pagar na Semana
              <span className="ml-auto text-xs font-normal text-muted-foreground">Próximos 7 dias</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pagarSemana.map((item) => {
                const urg = urgencyLabel(item.dateStr);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                    data-testid={`pagar-semana-${item.id}`}
                  >
                    <DateBadge dateStr={item.dateStr} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className={`text-xs ${urg.cls}`}>{urg.text}</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-red-600">{formatMoney(item.amount)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t px-2 pt-2">
                <span className="text-xs text-muted-foreground">Total da semana</span>
                <span className="text-sm font-bold text-red-600">
                  {formatMoney(pagarSemana.reduce((s, i) => s + i.amount, 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

