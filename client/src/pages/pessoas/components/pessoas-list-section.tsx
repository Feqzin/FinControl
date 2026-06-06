import type { Pessoa } from "@shared/schema";
import type { PessoaResumoConsolidado } from "@/hooks/usePessoas";
import { PessoasGrid } from "@/components/pessoas/PessoasGrid";
import { PessoasEmptyState } from "@/components/pessoas/PessoasEmptyState";
import { PessoasSummarySection } from "@/components/pessoas/PessoasSummarySection";

type PessoasListSectionProps = {
  sortedFilteredByStatusLength: number;
  isRemovedFilter: boolean;
  visiblePessoas: Pessoa[];
  mobileMode: boolean;
  getPessoaResumoConsolidado: (pessoaId: string) => PessoaResumoConsolidado;
  getPessoaStats: (pessoaId: string) => { total: number };
  onAddDivida: (pessoa: Pessoa) => void;
  onOpenHistory: (pessoa: Pessoa) => void;
  onEdit: (pessoa: Pessoa) => void;
  onDelete: (pessoa: Pessoa) => void;
  onAddPessoa: () => void;
  onRestore: (pessoa: Pessoa) => void;
  onPermanentDelete: (pessoa: Pessoa) => void;
  hasMorePessoas: boolean;
  onLoadMore: () => void;
};

export function PessoasListSection({
  sortedFilteredByStatusLength,
  isRemovedFilter,
  visiblePessoas,
  mobileMode,
  getPessoaResumoConsolidado,
  getPessoaStats,
  onAddDivida,
  onOpenHistory,
  onEdit,
  onDelete,
  onAddPessoa,
  onRestore,
  onPermanentDelete,
  hasMorePessoas,
  onLoadMore,
}: PessoasListSectionProps) {
  return (
    <>
      {sortedFilteredByStatusLength === 0 ? (
        <PessoasEmptyState
          onAddPessoa={isRemovedFilter ? undefined : onAddPessoa}
          title={isRemovedFilter ? "Nenhuma pessoa removida." : undefined}
          description={isRemovedFilter
            ? "Pessoas removidas aparecerão aqui para restauração."
            : undefined}
          actionLabel={isRemovedFilter ? undefined : "Adicionar pessoa"}
        />
      ) : (
        <PessoasGrid
          pessoas={visiblePessoas}
          mobileMode={mobileMode}
          getPessoaResumoConsolidado={getPessoaResumoConsolidado}
          getPessoaStats={getPessoaStats}
          onAddDivida={onAddDivida}
          onOpenHistory={onOpenHistory}
          onEdit={onEdit}
          onDelete={onDelete}
          showRemovedActions={isRemovedFilter}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
        />
      )}

      <PessoasSummarySection
        hasMorePessoas={hasMorePessoas}
        onLoadMore={onLoadMore}
      />
    </>
  );
}
