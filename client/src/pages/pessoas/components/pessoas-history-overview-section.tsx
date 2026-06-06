import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type PessoasHistoryOverviewCompositionItem = {
  key: string;
  label: string;
  colorClass: string;
  widthPercent: number;
  formattedValue: string;
};

type PessoasHistoryOverviewSectionProps = {
  isVisible: boolean;
  showComposition: boolean;
  compositionTotalLabel: string;
  compositionItems: readonly PessoasHistoryOverviewCompositionItem[];
  showAvailableCredits: boolean;
  availableCreditsLabel: string;
  showProgress: boolean;
  progressoPagoPercent: number;
  progressoPendentePercent: number;
  totalPagoLabel: string;
  totalPendenteLabel: string;
  insightText: string;
  showInsight: boolean;
  showOverdueAlert: boolean;
  overdueAlertText: string;
};

export function PessoasHistoryOverviewSection({
  isVisible,
  showComposition,
  compositionTotalLabel,
  compositionItems,
  showAvailableCredits,
  availableCreditsLabel,
  showProgress,
  progressoPagoPercent,
  progressoPendentePercent,
  totalPagoLabel,
  totalPendenteLabel,
  insightText,
  showInsight,
  showOverdueAlert,
  overdueAlertText,
}: PessoasHistoryOverviewSectionProps) {
  return (
    <>
      <div className={`space-y-3 mb-3 ${isVisible ? "" : "hidden"}`}>
        {showComposition && (
          <div className="rounded-md border border-border/60 bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Composição do pendente</p>
              <Badge variant="outline" className="text-[11px]">
                {compositionTotalLabel}
              </Badge>
            </div>
            {compositionItems.length > 0 && (
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
                <div className="h-full flex">
                  {compositionItems.map((item) => (
                    <div
                      key={item.key}
                      className={item.colorClass}
                      style={{ width: `${item.widthPercent}%` }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {compositionItems.map((item) => (
                <div key={item.key} className="rounded-md bg-muted/40 px-2.5 py-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${item.colorClass}`} />
                    {item.label}
                  </span>
                  <span className="font-semibold text-foreground">{item.formattedValue}</span>
                </div>
              ))}
              {showAvailableCredits && (
                <div className="rounded-md bg-emerald-500/5 px-2.5 py-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Saldo / créditos disponíveis
                  </span>
                  <span className="font-semibold text-emerald-700">{availableCreditsLabel}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {showProgress && (
          <div className="rounded-md border border-border/60 bg-card p-3 space-y-2.5">
            <p className="text-sm font-semibold">Evolução financeira</p>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div className="h-full flex">
                <div className="bg-emerald-500" style={{ width: `${progressoPagoPercent}%` }} aria-hidden />
                <div className="bg-amber-500" style={{ width: `${progressoPendentePercent}%` }} aria-hidden />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-emerald-500/5 px-2.5 py-2 flex items-center justify-between">
                <span className="text-emerald-700">Total pago</span>
                <span className="font-semibold text-emerald-700">{totalPagoLabel}</span>
              </div>
              <div className="rounded-md bg-amber-500/5 px-2.5 py-2 flex items-center justify-between">
                <span className="text-amber-700">Total pendente</span>
                <span className="font-semibold text-amber-700">{totalPendenteLabel}</span>
              </div>
            </div>
          </div>
        )}

        {showInsight && (
          <div className="rounded-md border border-blue-200/60 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-900">
            <p className="font-medium mb-1">Insight</p>
            <p>{insightText}</p>
          </div>
        )}
      </div>

      {isVisible && showOverdueAlert && (
        <div className="mb-6 rounded-md border border-red-300/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{overdueAlertText}</span>
        </div>
      )}
    </>
  );
}
