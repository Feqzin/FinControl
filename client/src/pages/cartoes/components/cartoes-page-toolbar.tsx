import { FilterChoiceGroup } from "@/components/filter-options";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, Plus, Trash2, Upload, RefreshCw } from "lucide-react";
import { CartoesPageHeader } from "@/components/cartoes/CartoesPageHeader";

type CardView = "resumo" | "compras";

type CartoesPageToolbarProps = {
  view: CardView;
  onViewChange: (view: CardView) => void;
  onClearSearch: () => void;
  smartImportLiberado: boolean;
  cartoesCount: number;
  lastImportLogId: string | null;
  rollbackImportPending: boolean;
  onOpenImportDialog: () => void;
  onOpenDeleteFaturaDialog: () => void;
  onRollbackLastImport: () => void;
  onOpenNewCardDialog: () => void;
};

function CardViewOptions({ view, onViewChange, onClearSearch }: {
  view: CardView;
  onViewChange: (view: CardView) => void;
  onClearSearch: () => void;
}) {
  return <Popover>
    <PopoverTrigger asChild><Button variant="outline" className="h-10 gap-2 rounded-xl" aria-label="Opções de visualização dos cartões"><SlidersHorizontal className="h-4 w-4" />Filtros{view === "compras" && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">1</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(300px,calc(100vw-2rem))] space-y-3 rounded-xl p-4">
      <p className="font-semibold">Visualização dos cartões</p>
      <FilterChoiceGroup label="Mostrar" value={view} onChange={value => onViewChange(value as CardView)} options={[{value:"resumo",label:"Resumo"},{value:"compras",label:"Compras"}]} />
      <Button variant="ghost" className="w-full" onClick={() => { onViewChange("resumo"); onClearSearch(); }}>Voltar ao padrão</Button>
    </PopoverContent>
  </Popover>;
}

export function CartoesPageToolbar({
  view,
  onViewChange,
  onClearSearch,
  smartImportLiberado,
  cartoesCount,
  lastImportLogId,
  rollbackImportPending,
  onOpenImportDialog,
  onOpenDeleteFaturaDialog,
  onRollbackLastImport,
  onOpenNewCardDialog,
}: CartoesPageToolbarProps) {
  const importLabel = smartImportLiberado
    ? "Importar Fatura"
    : "Importação inteligente (Premium)";

  return (
    <CartoesPageHeader
      title="Cartões de Crédito"
      subtitle="Gerencie seus cartões e compras parceladas"
      actions={(
        <div className="w-full space-y-2 md:space-y-2.5">
          <div className="flex flex-col gap-2 md:hidden">
            <Button
              className="h-11 w-full rounded-2xl px-5 shadow-sm touch-feedback"
              onClick={onOpenNewCardDialog}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo cartao
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <CardViewOptions view={view} onViewChange={onViewChange} onClearSearch={onClearSearch} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 flex-1 justify-between rounded-2xl border-border/60 bg-background/85 px-4 shadow-sm touch-feedback"
                  >
                    <span className="flex items-center gap-2">
                      <EllipsisVertical className="h-4 w-4" />
                      Ações secundárias
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 rounded-2xl p-1.5">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Ações de cartões
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onOpenImportDialog} className="rounded-xl py-2.5">
                    <Upload className="h-4 w-4" />
                    <span>{importLabel}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onOpenDeleteFaturaDialog}
                    disabled={cartoesCount === 0}
                    className="rounded-xl py-2.5"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Excluir fatura</span>
                  </DropdownMenuItem>
                  {smartImportLiberado && lastImportLogId ? (
                    <DropdownMenuItem
                      onSelect={onRollbackLastImport}
                      disabled={rollbackImportPending}
                      className="rounded-xl py-2.5"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>{rollbackImportPending ? "Revertendo..." : "Desfazer Ultima Importacao"}</span>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              {!smartImportLiberado ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] shadow-sm"
                >
                  Premium
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
            <CardViewOptions view={view} onViewChange={onViewChange} onClearSearch={onClearSearch} />
            <div className="flex min-w-0 items-center gap-1.5 rounded-[22px] border border-border/60 bg-background/80 p-1.5 shadow-sm backdrop-blur">
              <Button
                className="h-10 rounded-xl px-4 shadow-none touch-feedback"
                data-testid="button-add-cartao"
                onClick={onOpenNewCardDialog}
              >
                <Plus className="mr-2 h-4 w-4" /> Novo cartao
              </Button>
              <Button
                variant="ghost"
                onClick={onOpenImportDialog}
                className="h-10 min-w-0 rounded-xl px-3.5 text-sm font-medium text-muted-foreground touch-feedback hover:text-foreground"
                data-testid="button-importar-fatura"
              >
                <Upload className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="truncate">{importLabel}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={onOpenDeleteFaturaDialog}
                disabled={cartoesCount === 0}
                className="h-10 min-w-0 rounded-xl px-3.5 text-sm font-medium text-muted-foreground touch-feedback hover:text-foreground"
                data-testid="button-excluir-fatura"
              >
                <Trash2 className="mr-2 h-4 w-4 flex-shrink-0" />
                Excluir fatura
              </Button>
            </div>
            {!smartImportLiberado ? (
              <Badge
                variant="secondary"
                className="rounded-full border border-border/60 bg-background/80 px-3 py-1 whitespace-nowrap shadow-sm"
                data-testid="badge-smart-import-premium"
              >
                Premium
              </Badge>
            ) : null}
            {smartImportLiberado && lastImportLogId ? (
              <Button
                variant="outline"
                className="h-10 min-w-0 rounded-2xl border-border/60 bg-background/80 px-4 text-sm shadow-sm touch-feedback whitespace-nowrap"
                onClick={onRollbackLastImport}
                disabled={rollbackImportPending}
                data-testid="button-rollback-import"
              >
                <RefreshCw className="mr-2 h-4 w-4 flex-shrink-0" />
                {rollbackImportPending ? "Revertendo..." : "Desfazer Ultima Importacao"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}
