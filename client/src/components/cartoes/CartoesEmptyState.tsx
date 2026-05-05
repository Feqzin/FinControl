import { CreditCard } from "lucide-react";

export function CartoesEmptyState() {
  return (
    <div className="py-16 text-center" data-testid="empty-cartoes">
      <CreditCard className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
      <p className="text-lg font-medium text-muted-foreground">Nenhum cartao cadastrado</p>
      <p className="mt-1 text-sm text-muted-foreground">Adicione seu primeiro cartao</p>
    </div>
  );
}

