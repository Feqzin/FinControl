import type { FinancialScore } from "@shared/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, CalendarClock, CreditCard, Receipt, TrendingUp } from "lucide-react";
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
  const pagarSemanaTotal = pagarSemana.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <Card className="border-border/60 bg-card/95 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> Próximos vencimentos
            {!pagarSemanaStatus.isLoading && !pagarSemanaStatus.isError && pagarSemana.length > 0 ? (
              <span className="ml-auto rounded-full border border-amber-500/15 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm">
                {pagarSemana.length} na semana
              </span>
            ) : null}
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
            <div className="space-y-2.5">
              {proximosVencimentos.map((item) => {
                const isPast = item.dataVenc < today;
                const isToday = item.dataVenc === today;
                const isThisWeek = item.dataVenc > today && item.dataVenc <= in7Days;
                const dotColor = isPast ? "bg-red-500" : isToday ? "bg-red-500" : isThisWeek ? "bg-amber-400" : "bg-emerald-400";
                const TipoIcon = item.tipo === "cartao" ? CreditCard : item.tipo === "servico" ? Receipt : ArrowDownRight;
                const tipoBg = item.tipo === "cartao" ? "bg-blue-500/10 text-blue-600" : item.tipo === "servico" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600";
                const itemSurface = isPast || isToday
                  ? "border-red-500/15 bg-red-500/[0.03]"
                  : isThisWeek
                    ? "border-amber-500/15 bg-amber-500/[0.03]"
                    : "border-border/55 bg-muted/[0.16]";

                return (
                  <div
                    key={item.id}
                    className={`group flex items-start gap-3 rounded-2xl border p-3 transition-all duration-200 hover:border-border/80 hover:bg-muted/[0.24] ${itemSurface}`}
                    data-testid={`vencimento-${item.id}`}
                  >
                    <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-black/5 shadow-sm ${tipoBg}`}>
                      <TipoIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate pr-1 text-sm font-semibold text-foreground/95">{item.nome}</p>
                        <span className="flex-shrink-0 text-sm font-semibold tracking-tight text-foreground/95">
                          {formatMoney(item.valor)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className={`h-2 w-2 flex-shrink-0 rounded-full shadow-[0_0_0_3px] shadow-background ${dotColor}`} />
                        <p className={`text-xs leading-relaxed ${isPast || isToday ? "font-medium text-red-600" : isThisWeek ? "text-amber-600" : "text-muted-foreground"}`}>
                          {item.subtitulo}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!proximosStatus.isLoading && !proximosStatus.isError ? (
            <div className="mt-4 border-t border-border/60 pt-4">
              {pagarSemanaStatus.isLoading ? (
                <Skeleton className="h-11 rounded-lg" />
              ) : pagarSemanaStatus.isError ? (
                <p className="text-xs text-muted-foreground">Resumo da semana indisponível no momento.</p>
              ) : pagarSemana.length > 0 ? (
                <div className="flex items-center justify-between rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-3.5 py-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      A pagar em 7 dias
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold tracking-tight text-red-600">{formatMoney(pagarSemanaTotal)}</p>
                  </div>
                  <span className="rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {pagarSemana.length} item(ns)
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sem pagamentos críticos nos próximos 7 dias.</p>
              )}
            </div>
          ) : null}
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
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Dica contextual</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Priorize pendências vencidas para reduzir juros e proteger o caixa do mês.
          </p>
        </div>
      ) : null}
    </>
  );
}
