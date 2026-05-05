import type { ReactNode } from "react";
import { CartoesSummaryCards } from "@/pages/cartoes/components/cartoes-summary-cards";

type CartoesSummarySectionProps = {
  hasCartoes: boolean;
  totalFaturas: number;
  totalAguardandoReembolso: number;
  formatCurrency: (value: number) => string;
  filterBar: ReactNode;
  insights?: ReactNode;
};

export function CartoesSummarySection({
  hasCartoes,
  totalFaturas,
  totalAguardandoReembolso,
  formatCurrency,
  filterBar,
  insights,
}: CartoesSummarySectionProps) {
  if (!hasCartoes) return null;

  return (
    <div className="space-y-3">
      <CartoesSummaryCards
        totalFaturas={totalFaturas}
        totalAguardandoReembolso={totalAguardandoReembolso}
        formatCurrency={formatCurrency}
      />
      {insights}
      {filterBar}
    </div>
  );
}

