import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BrandIconDisplay } from "@/lib/brand-icons";

export function CartoesSummaryCards({
  totalFaturas,
  totalAguardandoReembolso,
  formatCurrency,
}: {
  totalFaturas: number;
  totalAguardandoReembolso: number;
  formatCurrency: (value: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card className="fintech-surface desktop-hover-lift touch-feedback rounded-[26px] border border-border/60 bg-card/95 shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total de faturas abertas</p>
              <p className="fin-value-kpi mt-1">{formatCurrency(totalFaturas)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm">
              <BrandIconDisplay name="generic" size="md" />
            </div>
          </div>
        </CardContent>
      </Card>
      {totalAguardandoReembolso > 0 && (
        <Card className="fintech-surface desktop-hover-lift touch-feedback rounded-[26px] border border-amber-500/20 bg-amber-500/5 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Aguardando reembolso</p>
                <p className="fin-value-kpi mt-1 text-amber-600">{formatCurrency(totalAguardandoReembolso)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-background/80 shadow-sm">
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
