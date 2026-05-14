import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PessoaSortBy } from "@/pages/pessoas/pessoas-sort.utils";

type PessoasFilterBarProps = {
  search: string;
  filterTipo: string;
  sortBy: PessoaSortBy;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onSortChange: (value: PessoaSortBy) => void;
};

export function PessoasFilterBar({
  search,
  filterTipo,
  sortBy,
  onSearchChange,
  onFilterChange,
  onSortChange,
}: PessoasFilterBarProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm sm:p-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="relative w-full min-w-0 lg:max-w-md lg:flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-search-pessoa"
            className="h-8 rounded-lg border-border/70 bg-background pl-8 text-sm"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <Tabs value={filterTipo} onValueChange={onFilterChange} className="w-full lg:w-auto">
          <TabsList className="mobile-tabs-scroll h-8 w-full justify-start rounded-lg border border-border/60 bg-muted/30 p-0.5 lg:w-auto">
            <TabsTrigger value="todos" className="h-6 rounded-md px-2.5 text-xs" data-testid="filter-pessoas-todos">Todos</TabsTrigger>
            <TabsTrigger value="me_deve" className="h-6 rounded-md px-2.5 text-xs" data-testid="filter-pessoas-me-devem">Me devem</TabsTrigger>
            <TabsTrigger value="eu_devo" className="h-6 rounded-md px-2.5 text-xs" data-testid="filter-pessoas-eu-devo">Eu devo</TabsTrigger>
            <TabsTrigger value="atrasados" className="h-6 rounded-md px-2.5 text-xs" data-testid="filter-pessoas-atrasados">Atrasados</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={sortBy} onValueChange={(value) => onSortChange(value as PessoaSortBy)}>
          <SelectTrigger
            className="h-8 w-full rounded-lg border-border/70 bg-background text-sm lg:w-[230px]"
            aria-label="Ordenar por"
          >
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome_az">Nome A-Z</SelectItem>
            <SelectItem value="nome_za">Nome Z-A</SelectItem>
            <SelectItem value="maior_saldo">Maior saldo</SelectItem>
            <SelectItem value="menor_saldo">Menor saldo</SelectItem>
            <SelectItem value="maior_valor_receber">Maior valor a receber</SelectItem>
            <SelectItem value="maior_valor_pagar">Maior valor a pagar</SelectItem>
            <SelectItem value="mais_recente">Mais recente</SelectItem>
            <SelectItem value="mais_antigo">Mais antigo</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
