import { Plus, Users } from "lucide-react";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
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
    <FintechEmptyState
      icon={<Users className="h-6 w-6 text-muted-foreground/70" />}
      title={title}
      description={description}
      testId="empty-pessoas"
      action={
        onAddPessoa ? (
          <Button
            className="h-10 rounded-2xl px-4 shadow-sm"
            onClick={onAddPessoa}
            data-testid="button-empty-add-pessoa"
          >
            <Plus className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        ) : null
      }
    />
  );
}
