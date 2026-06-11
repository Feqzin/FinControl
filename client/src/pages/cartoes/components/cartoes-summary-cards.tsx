import { RefreshCw } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { FintechSurfaceCard, FintechSurfaceIconChip } from "@/components/layout/fintech-surface-card";
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
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <FintechSurfaceCard interactive>
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total de faturas abertas</p>
              <p className="fin-value-kpi">{formatCurrency(totalFaturas)}</p>
            </div>
            <FintechSurfaceIconChip size="md" className="border-border/60 bg-background/80">
              <BrandIconDisplay name="generic" size="md" />
            </FintechSurfaceIconChip>
          </div>
        </CardContent>
      </FintechSurfaceCard>
      {totalAguardandoReembolso > 0 && (
        <FintechSurfaceCard interactive tone="warning">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Aguardando reembolso</p>
                <p className="fin-value-kpi text-amber-600">{formatCurrency(totalAguardandoReembolso)}</p>
              </div>
              <FintechSurfaceIconChip size="md" className="border-amber-500/20 bg-background/80">
                <RefreshCw className="h-5 w-5 text-amber-600" />
              </FintechSurfaceIconChip>
            </div>
          </CardContent>
        </FintechSurfaceCard>
      )}
    </div>
  );
}
