import type { FinancialInsight } from "@shared/financial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Lightbulb, Target } from "lucide-react";

type DashboardSectionStatus = {
  isLoading: boolean;
  isError: boolean;
  message: string | null;
};

type DashboardAlertItem = {
  icon: any;
  color: string;
  bgColor: string;
  texto: string;
};

type DashboardInsightsProps = {
  shouldRenderAlertasSection: boolean;
  showAdvancedResources: boolean;
  alertasStatus: DashboardSectionStatus;
  insightsStatus: DashboardSectionStatus;
  alertasUrgentes: DashboardAlertItem[];
  insightsOportunidades: FinancialInsight[];
  insightIconMap: Record<string, any>;
  fallbackInsightActionByIcon: Record<string, { label: string; path: string }>;
  onNavigate: (path: string) => void;
};

function SectionErrorState({ message }: { message?: string | null }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
      <p className="font-medium">Não foi possível carregar esta seção agora.</p>
      {message && <p className="mt-1 text-xs opacity-90">{message}</p>}
    </div>
  );
}

export function DashboardInsights({
  shouldRenderAlertasSection,
  showAdvancedResources,
  alertasStatus,
  insightsStatus,
  alertasUrgentes,
  insightsOportunidades,
  insightIconMap,
  fallbackInsightActionByIcon,
  onNavigate,
}: DashboardInsightsProps) {
  if (!shouldRenderAlertasSection && !showAdvancedResources) return null;

  return (
    <div className={`grid grid-cols-1 gap-3 ${shouldRenderAlertasSection && showAdvancedResources ? "lg:grid-cols-2" : ""}`}>
      {shouldRenderAlertasSection ? (
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Alertas importantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertasStatus.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((idx) => (
                  <Skeleton key={idx} className="h-14 rounded-md" />
                ))}
              </div>
            ) : alertasStatus.isError ? (
              <SectionErrorState message={alertasStatus.message} />
            ) : (
              <div className="space-y-2" data-testid="alerts-section">
                {alertasUrgentes.map((alerta, i) => {
                  const IconComp = alerta.icon || AlertTriangle;
                  return (
                    <div key={`${alerta.texto}-${i}`} className={`flex items-start gap-3 rounded-lg border p-3 ${alerta.bgColor}`}>
                      <IconComp className={`mt-0.5 h-4 w-4 flex-shrink-0 ${alerta.color}`} />
                      <p className={`text-sm font-medium ${alerta.color}`}>{alerta.texto}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showAdvancedResources ? (
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Insights automáticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insightsStatus.isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((idx) => (
                  <Skeleton key={idx} className="h-16 rounded-md" />
                ))}
              </div>
            ) : insightsStatus.isError ? (
              <SectionErrorState message={insightsStatus.message} />
            ) : insightsOportunidades.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <Target className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm">Sem oportunidades relevantes no momento.</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="insights-section">
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
                      className={`flex items-start gap-3 rounded-lg border p-3 ${styles[insight.tipo]} ${isActionable ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}`}
                      data-testid={`insight-${i}`}
                      role={isActionable ? "button" : undefined}
                      tabIndex={isActionable ? 0 : -1}
                      onClick={isActionable ? () => onNavigate(insightAction.path) : undefined}
                      onKeyDown={
                        isActionable
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onNavigate(insightAction.path);
                              }
                            }
                          : undefined
                      }
                    >
                      <IconComp className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm font-medium">{insight.texto}</p>
                        {isActionable && insightAction ? (
                          <div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNavigate(insightAction.path);
                              }}
                              data-testid={`insight-action-${i}`}
                            >
                              {insightAction.label}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

