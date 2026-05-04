import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type PessoasPageHeaderProps = {
  onAddPessoa: () => void;
};

export function PessoasPageHeader({ onAddPessoa }: PessoasPageHeaderProps) {
  return (
    <div className="fintech-page-header">
      <div className="fintech-page-header-row">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pessoas</h1>
          <p className="text-sm text-muted-foreground">Controle dívidas, compras vinculadas e serviços por pessoa.</p>
        </div>
        <Button
          className="h-9 w-full px-4 sm:w-auto"
          data-testid="button-add-pessoa"
          onClick={onAddPessoa}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar pessoa
        </Button>
      </div>
    </div>
  );
}
