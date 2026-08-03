import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { FuturePurchaseReceivablePersonOption } from "@/pages/simulador/future-purchase-simulation";

type FuturePurchaseReceivableSelectorProps = {
  options: FuturePurchaseReceivablePersonOption[];
  selectedIds: string[];
  includePersonalReceivables: boolean;
  includeCardReceivables: boolean;
  onIncludePersonalReceivablesChange: (checked: boolean) => void;
  onIncludeCardReceivablesChange: (checked: boolean) => void;
  onSelectionChange: (ids: string[]) => void;
};

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function FuturePurchaseReceivableSelector({
  options,
  selectedIds,
  includePersonalReceivables,
  includeCardReceivables,
  onIncludePersonalReceivablesChange,
  onIncludeCardReceivablesChange,
  onSelectionChange,
}: FuturePurchaseReceivableSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredOptions = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);
    if (!normalizedSearch) return options;
    return options.filter((option) => normalizeSearch(option.nome).includes(normalizedSearch));
  }, [options, search]);
  const consideredOptions = useMemo(() => options.filter((option) => (
    selectedIdSet.has(option.id)
    && (
      (includePersonalReceivables && option.hasPersonalReceivables)
      || (includeCardReceivables && option.hasCardReceivables)
    )
  )), [includeCardReceivables, includePersonalReceivables, options, selectedIdSet]);
  const selectedSummary = consideredOptions.length === 0
    ? "Nenhuma pessoa considerada"
    : consideredOptions.length <= 2
      ? consideredOptions.map((option) => option.nome).join(" e ")
      : `${consideredOptions.slice(0, 2).map((option) => option.nome).join(", ")} +${consideredOptions.length - 2}`;

  const togglePerson = (personId: string, checked: boolean) => {
    onSelectionChange(checked
      ? Array.from(new Set([...selectedIds, personId]))
      : selectedIds.filter((id) => id !== personId));
  };

  const selectVisible = () => {
    onSelectionChange(Array.from(new Set([...selectedIds, ...filteredOptions.map((option) => option.id)])));
  };

  return (
    <div className="space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">De quem você espera receber?</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Escolha somente pessoas em quem você quer confiar. A lista fica fechada para não ocupar a tela inteira.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-3">
          <div className="space-y-1">
            <Label htmlFor="include-personal-receivables" className="cursor-pointer text-sm font-medium">Dívidas pessoais</Label>
            <p className="text-xs text-muted-foreground">Inclui dívidas manuais com expectativa de recebimento.</p>
          </div>
          <Switch id="include-personal-receivables" checked={includePersonalReceivables} onCheckedChange={onIncludePersonalReceivablesChange} />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-3">
          <div className="space-y-1">
            <Label htmlFor="include-card-receivables" className="cursor-pointer text-sm font-medium">Parcelas de cartão</Label>
            <p className="text-xs text-muted-foreground">Inclui reembolsos pendentes de compras vinculadas.</p>
          </div>
          <Switch id="include-card-receivables" checked={includeCardReceivables} onCheckedChange={onIncludeCardReceivablesChange} />
        </div>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
          Nenhuma pessoa possui dívida pessoal esperada ou reembolso de cartão pendente.
        </div>
      ) : (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="h-auto w-full justify-between gap-3 bg-background/90 px-4 py-3 text-left">
              <span className="flex min-w-0 items-center gap-3">
                <span className="rounded-lg bg-sky-500/10 p-2 text-sky-600">
                  <Users className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{selectedSummary}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {consideredOptions.length} {consideredOptions.length === 1 ? "pessoa considerada" : "pessoas consideradas"} · clique para {open ? "fechar" : "alterar"}
                  </span>
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-3">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/95">
              <div className="space-y-3 border-b border-border/60 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar pessoa..."
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={selectVisible} disabled={filteredOptions.length === 0}>
                    Selecionar visíveis
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onSelectionChange([])} disabled={selectedIds.length === 0}>
                    Limpar seleção
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-64">
                <div className="space-y-1 p-2">
                  {filteredOptions.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada.</p>
                  ) : filteredOptions.map((option) => {
                    const checked = selectedIdSet.has(option.id);
                    const personalIncluded = checked && includePersonalReceivables && option.hasPersonalReceivables;
                    const cardIncluded = checked && includeCardReceivables && option.hasCardReceivables;
                    return (
                      <label
                        key={option.id}
                        htmlFor={`receivable-person-${option.id}`}
                        className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        <Checkbox
                          id={`receivable-person-${option.id}`}
                          checked={checked}
                          onCheckedChange={(value) => togglePerson(option.id, value === true)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{option.nome}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {option.hasPersonalReceivables ? (
                              <Badge variant="outline" className={personalIncluded ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "text-muted-foreground"}>
                                {personalIncluded ? <Check className="mr-1 h-3 w-3" /> : null}
                                Dívidas {personalIncluded ? "incluídas" : "disponíveis"}
                              </Badge>
                            ) : null}
                            {option.hasCardReceivables ? (
                              <Badge variant="outline" className={cardIncluded ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "text-muted-foreground"}>
                                {cardIncluded ? <Check className="mr-1 h-3 w-3" /> : null}
                                Cartão {cardIncluded ? "incluído" : "disponível"}
                              </Badge>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        Dívidas marcadas como “Sem expectativa” continuam fora do cálculo, mesmo quando a pessoa estiver selecionada.
      </p>
    </div>
  );
}
