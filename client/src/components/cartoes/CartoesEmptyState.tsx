import { CreditCard } from "lucide-react";

export function CartoesEmptyState() {
  return (
    <div
      className="rounded-[28px] border border-dashed border-border/70 bg-card/80 px-6 py-14 text-center shadow-sm"
      data-testid="empty-cartoes"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/15 bg-primary/10 shadow-sm">
        <CreditCard className="h-7 w-7 text-primary" />
      </div>
      <p className="mt-5 text-lg font-semibold tracking-tight text-foreground">Nenhum cartao cadastrado</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Adicione seu primeiro cartao</p>
    </div>
  );
}
