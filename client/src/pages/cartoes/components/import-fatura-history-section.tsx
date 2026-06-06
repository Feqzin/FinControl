import { Button } from "@/components/ui/button";

type ImportFaturaHistoryItem = {
  id: string;
  createdAtLabel: string;
  batchId: string;
  cartaoNome: string;
  statusLabel: string;
  statusClassName: string;
  importedItems: number;
  skippedItems: number;
  canRollback: boolean;
  isRollbackPending: boolean;
  isRolledBack: boolean;
  rollbackServicesRemovedCount: number;
  rollbackServicesUnlinkedCount: number;
  rollbackServicesRestoredCount: number;
  rollbackWarningsCount: number;
};

type ImportFaturaHistorySectionProps = {
  showHistory: boolean;
  onToggleHistory: () => void;
  isImportLogsLoading: boolean;
  items: ImportFaturaHistoryItem[];
  onRollbackImportLog?: (importLogId: string) => void;
};

export function ImportFaturaHistorySection({
  showHistory,
  onToggleHistory,
  isImportLogsLoading,
  items,
  onRollbackImportLog,
}: ImportFaturaHistorySectionProps) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">Histórico</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs sm:w-auto"
          onClick={onToggleHistory}
          data-testid="button-toggle-import-history"
        >
          {showHistory ? "Ocultar" : "Ver importações anteriores"}
        </Button>
      </div>
      {showHistory ? (
        <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
          {isImportLogsLoading ? (
            <p className="text-xs text-muted-foreground">Carregando histórico...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma importação anterior encontrada.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-md border px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {item.createdAtLabel} · Lote {item.batchId}
                    </p>
                    <p className="text-sm font-medium truncate">
                      {item.cartaoNome}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${item.statusClassName}`}>
                    {item.statusLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    Criadas: {item.importedItems} · Ignoradas: {item.skippedItems}
                  </p>
                  {item.canRollback ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={item.isRollbackPending}
                      onClick={() => onRollbackImportLog?.(item.id)}
                      data-testid={`button-rollback-log-${item.id}`}
                    >
                      {item.isRollbackPending ? "Desfazendo..." : "Desfazer"}
                    </Button>
                  ) : null}
                </div>
                {item.isRolledBack ? (
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <p>
                      Serviços removidos: {item.rollbackServicesRemovedCount}
                      {" · "}
                      Desvinculados: {item.rollbackServicesUnlinkedCount}
                      {" · "}
                      Restaurados: {item.rollbackServicesRestoredCount}
                    </p>
                    {item.rollbackWarningsCount > 0 ? (
                      <p className="text-amber-700">
                        Avisos de segurança: {item.rollbackWarningsCount}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
