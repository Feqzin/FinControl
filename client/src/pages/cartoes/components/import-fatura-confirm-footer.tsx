import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ImportFaturaConfirmFooterProps = {
  children?: ReactNode;
  totalImportar: number;
  totalItems: number;
  totalReconciliar: number;
  totalMensalImportarLabel: string;
  hasReconcileWithoutTarget: boolean;
  hasReconcilePendingValueConfirmation: boolean;
  hasInvalidImportAttempt: boolean;
  hasDuplicateExactWithoutForce: boolean;
  isConfirmDisabled: boolean;
  isBatchImportPending: boolean;
  onConfirmImport: () => void;
};

export function ImportFaturaConfirmFooter({
  children,
  totalImportar,
  totalItems,
  totalReconciliar,
  totalMensalImportarLabel,
  hasReconcileWithoutTarget,
  hasReconcilePendingValueConfirmation,
  hasInvalidImportAttempt,
  hasDuplicateExactWithoutForce,
  isConfirmDisabled,
  isBatchImportPending,
  onConfirmImport,
}: ImportFaturaConfirmFooterProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        {children}
        <p className="text-sm text-muted-foreground">
          {totalImportar} de {totalItems} serão importadas
          {totalReconciliar > 0 ? ` · ${totalReconciliar} serão reconciliadas` : ""}
          {" · "}Total: {totalMensalImportarLabel}/mês
        </p>
        {hasReconcileWithoutTarget ? (
          <p className="text-xs text-red-600">Há item de reconciliação sem compra existente vinculada.</p>
        ) : null}
        {hasReconcilePendingValueConfirmation ? (
          <p className="text-xs text-amber-700">Confirme alterações de valor antes de concluir a reconciliação.</p>
        ) : null}
        {hasInvalidImportAttempt ? (
          <p className="text-xs text-red-600">Itens inválidos não podem ser confirmados para importação.</p>
        ) : null}
        {hasDuplicateExactWithoutForce ? (
          <p className="text-xs text-orange-700">Duplicatas exatas exigem ação de "Forçar" para confirmar.</p>
        ) : null}
      </div>
      <Button
        className="w-full sm:w-auto"
        data-testid="button-confirmar-importacao"
        disabled={isConfirmDisabled}
        onClick={onConfirmImport}
      >
        {isBatchImportPending ? "Importando..." : "Confirmar importação"}
      </Button>
    </div>
  );
}
