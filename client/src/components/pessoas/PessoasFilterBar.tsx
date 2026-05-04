import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PessoasFilterBarProps = {
  search: string;
  filterTipo: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
};

export function PessoasFilterBar({
  search,
  filterTipo,
  onSearchChange,
  onFilterChange,
}: PessoasFilterBarProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-2.5 sm:p-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full min-w-0 lg:max-w-md lg:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-search-pessoa"
            className="h-9 rounded-xl pl-9"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <Tabs value={filterTipo} onValueChange={onFilterChange} className="w-full lg:w-auto">
          <TabsList className="mobile-tabs-scroll h-8 w-full justify-start rounded-lg lg:w-auto">
            <TabsTrigger value="todos" className="h-7 px-2.5 text-xs" data-testid="filter-pessoas-todos">Todos</TabsTrigger>
            <TabsTrigger value="me_deve" className="h-7 px-2.5 text-xs" data-testid="filter-pessoas-me-devem">Me devem</TabsTrigger>
            <TabsTrigger value="eu_devo" className="h-7 px-2.5 text-xs" data-testid="filter-pessoas-eu-devo">Eu devo</TabsTrigger>
            <TabsTrigger value="atrasados" className="h-7 px-2.5 text-xs" data-testid="filter-pessoas-atrasados">Atrasados</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
