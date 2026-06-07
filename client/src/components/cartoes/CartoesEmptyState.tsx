import { CreditCard } from "lucide-react";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";

export function CartoesEmptyState() {
  return (
    <FintechEmptyState
      icon={<CreditCard className="h-7 w-7 text-primary" />}
      title="Nenhum cartao cadastrado"
      description="Adicione seu primeiro cartao"
      testId="empty-cartoes"
      iconWrapClassName="border-primary/15 bg-primary/10"
      className="bg-card/80"
    />
  );
}
