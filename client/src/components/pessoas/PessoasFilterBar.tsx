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
      </div>
    </div>
  );
}
