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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card className="hover-elevate">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Total de faturas abertas</p>
              <p className="text-2xl font-bold">{formatCurrency(totalFaturas)}</p>
            </div>
            <BrandIconDisplay name="generic" size="md" />
          </div>
        </CardContent>
      </Card>
      {totalAguardandoReembolso > 0 && (
        <Card className="hover-elevate border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Aguardando reembolso</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalAguardandoReembolso)}</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-amber-500/10">
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
