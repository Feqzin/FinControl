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
      <Card className="fintech-surface desktop-hover-lift touch-feedback">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total de faturas abertas</p>
              <p className="fin-value-kpi mt-1">{formatCurrency(totalFaturas)}</p>
            </div>
            <BrandIconDisplay name="generic" size="md" />
          </div>
        </CardContent>
      </Card>
      {totalAguardandoReembolso > 0 && (
        <Card className="fintech-surface desktop-hover-lift touch-feedback border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Aguardando reembolso</p>
                <p className="fin-value-kpi mt-1 text-amber-600">{formatCurrency(totalAguardandoReembolso)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
