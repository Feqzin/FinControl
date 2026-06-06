import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type PessoasEmptyStateProps = {
  onAddPessoa?: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
};

export function PessoasEmptyState({
  onAddPessoa,
  title = "Nenhuma pessoa cadastrada",
  description = "Comece adicionando a primeira pessoa.",
  actionLabel = "Adicionar pessoa",
}: PessoasEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/95 p-8 text-center shadow-sm sm:p-10" data-testid="empty-pessoas">
      <div className="mx-auto max-w-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm">
          <Users className="h-6 w-6 text-muted-foreground/70" />
        </div>
        <p className="text-xl font-semibold tracking-tight">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {onAddPessoa && (
        <Button
          className="mt-5 h-10 rounded-2xl px-4 shadow-sm"
          onClick={onAddPessoa}
          data-testid="button-empty-add-pessoa"
        >
          <Plus className="mr-2 h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
