import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type PessoasEmptyStateProps = {
  onAddPessoa: () => void;
};

export function PessoasEmptyState({ onAddPessoa }: PessoasEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card p-7 text-center shadow-sm" data-testid="empty-pessoas">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/70">
        <Users className="h-6 w-6 text-muted-foreground/70" />
      </div>
      <p className="text-lg font-semibold tracking-tight">Nenhuma pessoa cadastrada</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Comece adicionando a primeira pessoa.
      </p>
      <Button
        className="mt-4 h-10 rounded-xl px-4"
        onClick={onAddPessoa}
        data-testid="button-empty-add-pessoa"
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar pessoa
      </Button>
    </div>
  );
}
