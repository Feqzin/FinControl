import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Link2, Search } from "lucide-react";
import type { Cartao, CompraCartao, Pessoa } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL } from "@/utils/formatters";
import {
  buildCompraCartaoCandidates,
  filterCompraCartaoCandidates,
  suggestCompraCartaoCandidates,
  type CompraCartaoSuggestionContext,
} from "@/lib/compra-cartao-linking";

type CompraCartaoSearchPickerProps = {
  compras: CompraCartao[];
  cartoes: Cartao[];
  pessoas?: Pessoa[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  noneLabel?: string;
  disabled?: boolean;
  maxResults?: number;
  testId?: string;
  searchPlaceholder?: string;
  context?: CompraCartaoSuggestionContext;
};

function renderCompraMeta(compra: CompraCartao, cartaoNome: string): string {
  const parcelaAtual = Number(compra.parcelaAtual) || 1;
  const parcelas = Number(compra.parcelas) || 1;
  const valorParcela = Number(compra.valorParcela) || 0;
  return `${cartaoNome} · ${parcelaAtual}/${parcelas}x · ${formatCurrencyBRL(valorParcela)} · ${compra.dataCompra}`;
}

export function CompraCartaoSearchPicker({
  compras,
  cartoes,
  pessoas,
  value,
  onValueChange,
  placeholder = "Selecione uma compra de cartão",
  noneLabel = "Sem vínculo com cartão",
  disabled,
  maxResults = 80,
  testId,
  searchPlaceholder = "Buscar por descrição, cartão, valor ou data...",
  context,
}: CompraCartaoSearchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const candidates = useMemo(
    () => buildCompraCartaoCandidates(compras, cartoes, pessoas),
    [compras, cartoes, pessoas],
  );

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.compra.id === value) ?? null,
    [candidates, value],
  );

  const suggestions = useMemo(() => {
    if (!context) return [];
    return suggestCompraCartaoCandidates(candidates, context, 5).filter(
      (item) => item.candidate.compra.id !== value,
    );
  }, [candidates, context, value]);

  const suggestionIds = useMemo(
    () => new Set(suggestions.map((item) => item.candidate.compra.id)),
    [suggestions],
  );

  const filtered = useMemo(
    () => filterCompraCartaoCandidates(candidates, query, maxResults),
    [candidates, maxResults, query],
  );

  const filteredWithoutSuggestions = useMemo(
    () => filtered.filter((candidate) => !suggestionIds.has(candidate.compra.id)),
    [filtered, suggestionIds],
  );

  const triggerLabel = selected
    ? `${selected.cartaoNome} · ${selected.compra.descricao}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
          data-testid={testId}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="border-b p-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
              data-testid={testId ? `${testId}-search` : undefined}
            />
          </div>
          <Button
            type="button"
            variant={value ? "secondary" : "default"}
            className="w-full justify-start"
            onClick={() => {
              onValueChange(null);
              setOpen(false);
            }}
            data-testid={testId ? `${testId}-none` : undefined}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {noneLabel}
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {suggestions.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                Sugestões mais prováveis
              </p>
              <div className="space-y-1">
                {suggestions.map(({ candidate, score }) => {
                  const isSelected = candidate.compra.id === value;
                  return (
                    <button
                      key={`suggestion-${candidate.compra.id}`}
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-2 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-blue-200 bg-blue-50/50 hover:bg-blue-50",
                      )}
                      onClick={() => {
                        onValueChange(candidate.compra.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{candidate.compra.descricao}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {renderCompraMeta(candidate.compra, candidate.cartaoNome)}
                          </p>
                          {candidate.pessoaNomeVinculada && (
                            <p className="truncate text-[11px] text-amber-700">
                              Atualmente vinculada a: {candidate.pessoaNomeVinculada}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700">
                            score {score}
                          </span>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Todas as compras
            </p>
            {filteredWithoutSuggestions.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                Nenhuma compra encontrada para o filtro informado.
              </p>
            ) : (
              <div className="space-y-1">
                {filteredWithoutSuggestions.map((candidate) => {
                  const isSelected = candidate.compra.id === value;
                  return (
                    <button
                      key={candidate.compra.id}
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-2 py-2 text-left transition-colors hover:bg-muted/50",
                        isSelected && "border-primary bg-primary/5",
                      )}
                      onClick={() => {
                        onValueChange(candidate.compra.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{candidate.compra.descricao}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {renderCompraMeta(candidate.compra, candidate.cartaoNome)}
                          </p>
                          {candidate.pessoaNomeVinculada && (
                            <p className="truncate text-[11px] text-amber-700">
                              Atualmente vinculada a: {candidate.pessoaNomeVinculada}
                            </p>
                          )}
                        </div>
                        {isSelected && <Check className="mt-0.5 h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
