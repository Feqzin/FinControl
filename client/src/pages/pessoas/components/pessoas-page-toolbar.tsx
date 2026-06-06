import { PessoasFilterBar } from "@/components/pessoas/PessoasFilterBar";
import { PessoasPageHeader } from "@/components/pessoas/PessoasPageHeader";
import type { PessoaSortBy } from "@/pages/pessoas/pessoas-sort.utils";

type PessoasPageToolbarProps = {
  totalPessoas: number;
  totalPendente: number;
  totalAReceber: number;
  onAddPessoa: () => void;
  search: string;
  filterTipo: string;
  sortBy: PessoaSortBy;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onSortChange: (value: PessoaSortBy) => void;
};

export function PessoasPageToolbar({
  totalPessoas,
  totalPendente,
  totalAReceber,
  onAddPessoa,
  search,
  filterTipo,
  sortBy,
  onSearchChange,
  onFilterChange,
  onSortChange,
}: PessoasPageToolbarProps) {
  return (
    <>
      <PessoasPageHeader
        onAddPessoa={onAddPessoa}
        totalPessoas={totalPessoas}
        totalPendente={totalPendente}
        totalAReceber={totalAReceber}
      />

      <PessoasFilterBar
        search={search}
        filterTipo={filterTipo}
        sortBy={sortBy}
        onSearchChange={onSearchChange}
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
      />
    </>
  );
}
