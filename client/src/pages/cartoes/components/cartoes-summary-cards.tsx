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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FintechSurfaceCard interactive>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total de faturas abertas</p>
              <p className="fin-value-kpi mt-1">{formatCurrency(totalFaturas)}</p>
            </div>
            <FintechSurfaceIconChip size="lg" className="border-border/60 bg-background/80">
              <BrandIconDisplay name="generic" size="md" />
            </FintechSurfaceIconChip>
          </div>
        </CardContent>
      </FintechSurfaceCard>
      {totalAguardandoReembolso > 0 && (
        <FintechSurfaceCard interactive tone="warning">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Aguardando reembolso</p>
                <p className="fin-value-kpi mt-1 text-amber-600">{formatCurrency(totalAguardandoReembolso)}</p>
              </div>
              <FintechSurfaceIconChip size="lg" className="border-amber-500/20 bg-background/80">
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </FintechSurfaceIconChip>
            </div>
          </CardContent>
        </FintechSurfaceCard>
      )}
    </div>
  );
}
