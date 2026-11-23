import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChoiceGroup, FilterToggle } from "@/components/filter-options";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PessoaSortBy } from "@/pages/pessoas/pessoas-sort.utils";

type PessoasFilterBarProps = {
  compact?: boolean;
  search: string;
  filterTipo: string;
  sortBy: PessoaSortBy;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onSortChange: (value: PessoaSortBy) => void;
};

export function PessoasFilterBar({ search, filterTipo, sortBy, onSearchChange, onFilterChange, onSortChange }: PessoasFilterBarProps) {
  const selected = filterTipo.split("|").filter(value => value !== "todos");
  const removed = selected.includes("removidas");
  const relation = selected.find(value => value === "me_deve" || value === "eu_devo") ?? "todos";
  const count = selected.length + (sortBy !== "nome_az" ? 1 : 0);
  const changeRelation = (value: string) => {
    const next = selected.filter(item => item !== "me_deve" && item !== "eu_devo" && item !== "removidas");
    if (value !== "todos") next.push(value);
    onFilterChange(next.join("|") || "todos");
  };
  const toggle = (value: string, checked: boolean) => {
    const next = selected.filter(item => item !== value && item !== "removidas");
    if (checked) next.push(value);
    onFilterChange(next.join("|") || "todos");
  };
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2" data-testid="pessoas-essential-filters">
    <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar pessoa" data-testid="input-search-pessoa" className="h-10 rounded-xl pl-9" placeholder="Buscar pessoa..." value={search} onChange={event => onSearchChange(event.target.value)} /></div>
    <Popover>
      <PopoverTrigger asChild><Button variant="outline" className="h-10 gap-2 rounded-xl" aria-label="Filtros de pessoas"><SlidersHorizontal className="h-4 w-4" />Filtros{count > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{count}</span>}</Button></PopoverTrigger>
      <PopoverContent align="end" className="max-h-[75dvh] w-[min(360px,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-xl p-4">
        <p className="font-semibold">Filtros e ordenação</p>
        <FilterChoiceGroup label="Mostrar" value={removed ? "removidas" : "ativas"} onChange={value => onFilterChange(value === "removidas" ? value : "todos")} options={[{value:"ativas",label:"Pessoas ativas"},{value:"removidas",label:"Pessoas removidas"}]} />
        {!removed && <>
          <FilterChoiceGroup label="Valores" value={relation} onChange={changeRelation} options={[{value:"todos",label:"Todas as pessoas"},{value:"me_deve",label:"Me devem"},{value:"eu_devo",label:"Eu devo"}]} />
          <fieldset><legend className="mb-1 text-sm font-medium">Condições adicionais</legend>
            <FilterToggle label="Somente com atraso" checked={selected.includes("atrasados")} onChange={checked => toggle("atrasados", checked)} />
            <FilterToggle label="Somente sinalizadas" checked={selected.includes("lista_negra")} onChange={checked => toggle("lista_negra", checked)} />
          </fieldset>
        </>}
        <div className="space-y-2"><p className="text-sm font-medium">Ordenar por</p><Select value={sortBy} onValueChange={value => onSortChange(value as PessoaSortBy)}><SelectTrigger aria-label="Ordenar pessoas"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="nome_az">Nome A-Z</SelectItem><SelectItem value="nome_za">Nome Z-A</SelectItem><SelectItem value="maior_saldo">Maior saldo</SelectItem><SelectItem value="menor_saldo">Menor saldo</SelectItem><SelectItem value="maior_valor_receber">Maior valor a receber</SelectItem><SelectItem value="maior_valor_pagar">Maior valor a pagar</SelectItem><SelectItem value="mais_recente">Mais recente</SelectItem><SelectItem value="mais_antigo">Mais antigo</SelectItem>
        </SelectContent></Select></div>
        <Button variant="ghost" className="w-full" onClick={() => { onFilterChange("todos"); onSortChange("nome_az"); }}>Limpar filtros</Button>
      </PopoverContent>
    </Popover>
  </div>;
}
