import type { ReactNode } from "react";
import { CartoesSummaryCards } from "@/pages/cartoes/components/cartoes-summary-cards";

type CartoesSummarySectionProps = {
  hasCartoes: boolean;
  totalFaturas: number;
  totalAguardandoReembolso: number;
  formatCurrency: (value: number) => string;
  filterBar: ReactNode;
  insights?: ReactNode;
  showInsights?: boolean;
};

export function CartoesSummarySection({
  hasCartoes,
  totalFaturas,
  totalAguardandoReembolso,
  formatCurrency,
  filterBar,
  insights,
  showInsights = true,
}: CartoesSummarySectionProps) {
  if (!hasCartoes) return null;

  return (
    <div className="space-y-2.5">
      <CartoesSummaryCards
        totalFaturas={totalFaturas}
        totalAguardandoReembolso={totalAguardandoReembolso}
        formatCurrency={formatCurrency}
      />
      {showInsights ? insights : null}
      {filterBar}
    </div>
  );
}
