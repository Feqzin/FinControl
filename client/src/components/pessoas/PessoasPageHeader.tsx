import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
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
    <FintechPageHeader
      title="Pessoas"
      subtitle="Controle dívidas, compras vinculadas e serviços por pessoa."
      rowClassName="items-start gap-4 xl:items-center"
      contentClassName="space-y-2"
      titleClassName="sm:text-3xl"
      badges={(
        <>
          <span className="rounded-full bg-muted/65 px-3 py-1.5 font-medium text-muted-foreground shadow-sm">
            {totalPessoas} pessoa(s)
          </span>
          <span className="rounded-full border border-amber-500/10 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-700 shadow-sm dark:text-amber-400">
            Pendente {formatCurrencyBRL(totalPendente)}
          </span>
          <span className="rounded-full border border-emerald-500/10 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700 shadow-sm dark:text-emerald-400">
            A receber {formatCurrencyBRL(totalAReceber)}
          </span>
        </>
      )}
      actionsClassName="flex w-full justify-stretch sm:w-auto sm:justify-end"
      actions={(
        <Button
          className="h-10 w-full rounded-2xl px-4 font-medium shadow-sm sm:h-11 sm:w-auto sm:min-w-[190px]"
          data-testid="button-add-pessoa"
          onClick={onAddPessoa}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar pessoa
        </Button>
      )}
    />
  );
}
