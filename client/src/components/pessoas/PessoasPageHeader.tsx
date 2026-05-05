import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL } from "@/utils/formatters";

type PessoasPageHeaderProps = {
  onAddPessoa: () => void;
  totalPessoas: number;
  totalPendente: number;
  totalAReceber: number;
};

export function PessoasPageHeader({
  onAddPessoa,
  totalPessoas,
  totalPendente,
  totalAReceber,
}: PessoasPageHeaderProps) {
  return (
    <div className="fintech-page-header border border-border/50 bg-card/95 shadow-sm backdrop-blur">
      <div className="fintech-page-header-row items-start gap-4 sm:items-center">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pessoas</h1>
          <p className="text-sm text-muted-foreground/90">Controle dívidas, compras vinculadas e serviços por pessoa.</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              {totalPessoas} pessoa(s)
            </span>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-400">
              Pendente {formatCurrencyBRL(totalPendente)}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
              A receber {formatCurrencyBRL(totalAReceber)}
            </span>
          </div>
        </div>
        <Button
          className="h-10 w-full rounded-xl px-4 font-medium sm:w-auto"
          data-testid="button-add-pessoa"
          onClick={onAddPessoa}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar pessoa
        </Button>
      </div>
    </div>
  );
}
