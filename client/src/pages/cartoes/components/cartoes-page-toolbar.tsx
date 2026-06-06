import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, RefreshCw } from "lucide-react";
import { CartoesPageHeader } from "@/components/cartoes/CartoesPageHeader";

type CartoesPageToolbarProps = {
  smartImportLiberado: boolean;
  cartoesCount: number;
  lastImportLogId: string | null;
  rollbackImportPending: boolean;
  onOpenImportDialog: () => void;
  onOpenDeleteFaturaDialog: () => void;
  onRollbackLastImport: () => void;
  onOpenNewCardDialog: () => void;
};

export function CartoesPageToolbar({
  smartImportLiberado,
  cartoesCount,
  lastImportLogId,
  rollbackImportPending,
  onOpenImportDialog,
  onOpenDeleteFaturaDialog,
  onRollbackLastImport,
  onOpenNewCardDialog,
}: CartoesPageToolbarProps) {
  return (
    <CartoesPageHeader
      title="Cartoes de Credito"
      subtitle="Gerencie seus cartoes e compras parceladas"
      actions={(
        <>
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:col-span-2 md:flex-row md:items-center xl:col-span-1">
            <Button
              variant="outline"
              onClick={onOpenImportDialog}
              className="min-w-0 flex-1 justify-start text-left whitespace-normal break-words touch-feedback sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
              data-testid="button-importar-fatura"
            >
              <Upload className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="leading-tight">
                {smartImportLiberado ? "Importar Fatura" : "Importação inteligente (Premium)"}
              </span>
            </Button>
            {!smartImportLiberado ? (
              <Badge
                variant="secondary"
                className="w-fit shrink-0 whitespace-nowrap self-start sm:self-auto"
                data-testid="badge-smart-import-premium"
              >
                Premium
              </Badge>
            ) : null}
          </div>
          <Button
            variant="outline"
            onClick={onOpenDeleteFaturaDialog}
            disabled={cartoesCount === 0}
            className="min-w-0 w-full justify-start text-left whitespace-normal break-words touch-feedback sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
            data-testid="button-excluir-fatura"
          >
            <Trash2 className="mr-2 h-4 w-4 flex-shrink-0" />
            Excluir fatura
          </Button>
          {smartImportLiberado && lastImportLogId ? (
            <Button
              variant="outline"
              className="min-w-0 w-full justify-start text-left whitespace-normal break-words touch-feedback sm:col-span-2 sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
              onClick={onRollbackLastImport}
              disabled={rollbackImportPending}
              data-testid="button-rollback-import"
            >
              <RefreshCw className="mr-2 h-4 w-4 flex-shrink-0" />
              {rollbackImportPending ? "Revertendo..." : "Desfazer Ultima Importacao"}
            </Button>
          ) : null}
          <Button
            className="w-full touch-feedback sm:col-span-2 xl:w-auto xl:flex-none"
            data-testid="button-add-cartao"
            onClick={onOpenNewCardDialog}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo cartao
          </Button>
        </>
      )}
    />
  );
}
