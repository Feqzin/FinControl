import type { ImportConfirmResponse } from "@/services/api/cartoes";
import { Button } from "@/components/ui/button";

type ImportFaturaConfirmSummaryProps = {
  batchId?: string;
  summary: NonNullable<ImportConfirmResponse["summary"]>;
  onStartNewImport?: () => void;
  onRollbackImport?: () => void;
  isRollbackPending?: boolean;
  onClose: () => void;
};

export function ImportFaturaConfirmSummary({
  batchId,
  summary,
  onStartNewImport,
  onRollbackImport,
  isRollbackPending = false,
  onClose,
}: ImportFaturaConfirmSummaryProps) {
  return (
    <div className="space-y-4" data-testid="import-confirm-summary">
      <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 px-4 py-3">
        <p className="text-base font-semibold text-emerald-700">Importação concluída</p>
        <p className="text-sm text-muted-foreground mt-1">
          Lote {batchId} processado.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Compras criadas</p>
          <p className="text-lg font-semibold">{summary.createdCount}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Compras reconciliadas</p>
          <p className="text-lg font-semibold">{summary.reconciledExistingCount ?? 0}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Itens ignorados</p>
          <p className="text-lg font-semibold">{summary.ignoredCount}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Duplicatas bloqueadas</p>
          <p className="text-lg font-semibold">{summary.blockedExactDuplicates}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Duplicatas forçadas</p>
          <p className="text-lg font-semibold">{summary.forcedExactDuplicates}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Itens inválidos</p>
          <p className="text-lg font-semibold">{summary.invalidCount}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Itens com erro</p>
          <p className="text-lg font-semibold">{summary.errorCount}</p>
        </div>
        <div className="rounded-md border p-3 sm:col-span-2">
          <p className="text-muted-foreground">Serviços criados</p>
          <p className="text-lg font-semibold">{summary.servicesCreatedCount ?? 0}</p>
        </div>
        <div className="rounded-md border p-3 sm:col-span-2">
          <p className="text-muted-foreground">Serviços vinculados</p>
          <p className="text-lg font-semibold">{summary.servicesLinkedCount ?? 0}</p>
        </div>
      </div>

      <div className="rounded-md border px-4 py-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Total processado:</span>{" "}
          <span className="font-semibold">{summary.totalProcessed}</span>
        </p>
        {summary.createdCount === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            Nenhuma compra foi criada. Revise itens ignorados, inválidos ou duplicatas exatas bloqueadas.
          </p>
        ) : null}
        {summary.blockedExactDuplicates > 0 ? (
          <p className="text-xs text-amber-700 mt-1">
            Há duplicatas exatas bloqueadas. Use "Forçar" no preview apenas quando necessário.
          </p>
        ) : null}
        {summary.invalidCount > 0 ? (
          <p className="text-xs text-red-600 mt-1">
            Há itens inválidos que precisam de revisão antes de nova confirmação.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onStartNewImport ? (
          <Button variant="outline" onClick={onStartNewImport}>
            Nova importação
          </Button>
        ) : null}
        {onRollbackImport ? (
          <Button
            variant="outline"
            onClick={onRollbackImport}
            disabled={isRollbackPending}
            data-testid="button-rollback-import-summary"
          >
            {isRollbackPending ? "Desfazendo..." : "Desfazer importação"}
          </Button>
        ) : null}
        <Button onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
