import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type PessoasEmptyStateProps = {
  onAddPessoa: () => void;
};

export function PessoasEmptyState({ onAddPessoa }: PessoasEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/70 p-8 text-center" data-testid="empty-pessoas">
      <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
      <p className="text-lg font-semibold">Nenhuma pessoa cadastrada ainda</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Adicione alguém para controlar dívidas, compras compartilhadas e serviços.
      </p>
      <Button
        className="mt-4"
        onClick={onAddPessoa}
        data-testid="button-empty-add-pessoa"
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar pessoa
      </Button>
    </div>
  );
}
