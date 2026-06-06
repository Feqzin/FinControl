import type { Cartao, CompraCartao } from "@shared/schema";
import { CartoesDialogs } from "@/components/cartoes/CartoesDialogs";
import type { DeleteCompraResponse, DeleteCompraScope, DeleteFaturaResponse } from "@/services/api/cartoes";

type DeleteCompraFaturaDialogsProps = {
  openDeleteFaturaDialog: boolean;
  setOpenDeleteFaturaDialog: (open: boolean) => void;
  deleteFaturaScope: "cartao" | "todos";
  setDeleteFaturaScope: (scope: "cartao" | "todos") => void;
  deleteFaturaMes: string;
  setDeleteFaturaMes: (value: string) => void;
  deleteFaturaCartaoId: string;
  setDeleteFaturaCartaoId: (value: string) => void;
  deleteFaturaImpact: DeleteFaturaResponse | null;
  setDeleteFaturaImpact: (impact: DeleteFaturaResponse | null) => void;
  deleteFaturaImpactLoading: boolean;
  deleteFaturaImpactError: string | null;
  setDeleteFaturaImpactError: (message: string | null) => void;
  onRetryDeleteFaturaImpact: () => void;
  setDeleteFaturaImpactLoading: (value: boolean) => void;
  deleteFaturaCartaoPending: boolean;
  deleteFaturasMesPending: boolean;
  onConfirmDeleteFatura: () => void;
  formatMesExibicao: (mes: string) => string;
  formatCurrency: (value: number) => string;
  cartoes: Cartao[];
  openDeleteCompraDialog: boolean;
  setOpenDeleteCompraDialog: (open: boolean) => void;
  resetDeleteCompraDialog: () => void;
  deleteCompraTarget: CompraCartao | null;
  deleteCompraScope: DeleteCompraScope;
  setDeleteCompraScope: (scope: DeleteCompraScope) => void;
  deleteCompraImpact: DeleteCompraResponse | null;
  setDeleteCompraImpact: (impact: DeleteCompraResponse | null) => void;
  deleteCompraImpactLoading: boolean;
  deleteCompraImpactError: string | null;
  deleteCompraSubmitting: boolean;
  onRetryDeleteCompraImpact: () => void;
  onConfirmDeleteCompra: () => void;
};

export function DeleteCompraFaturaDialogs({
  openDeleteFaturaDialog,
  setOpenDeleteFaturaDialog,
  deleteFaturaScope,
  setDeleteFaturaScope,
  deleteFaturaMes,
  setDeleteFaturaMes,
  deleteFaturaCartaoId,
  setDeleteFaturaCartaoId,
  deleteFaturaImpact,
  setDeleteFaturaImpact,
  deleteFaturaImpactLoading,
  deleteFaturaImpactError,
  setDeleteFaturaImpactError,
  onRetryDeleteFaturaImpact,
  setDeleteFaturaImpactLoading,
  deleteFaturaCartaoPending,
  deleteFaturasMesPending,
  onConfirmDeleteFatura,
  formatMesExibicao,
  formatCurrency,
  cartoes,
  openDeleteCompraDialog,
  setOpenDeleteCompraDialog,
  resetDeleteCompraDialog,
  deleteCompraTarget,
  deleteCompraScope,
  setDeleteCompraScope,
  deleteCompraImpact,
  setDeleteCompraImpact,
  deleteCompraImpactLoading,
  deleteCompraImpactError,
  deleteCompraSubmitting,
  onRetryDeleteCompraImpact,
  onConfirmDeleteCompra,
}: DeleteCompraFaturaDialogsProps) {
  return (
    <CartoesDialogs
      openDeleteFaturaDialog={openDeleteFaturaDialog}
      setOpenDeleteFaturaDialog={setOpenDeleteFaturaDialog}
      deleteFaturaScope={deleteFaturaScope}
      setDeleteFaturaScope={setDeleteFaturaScope}
      deleteFaturaMes={deleteFaturaMes}
      setDeleteFaturaMes={setDeleteFaturaMes}
      deleteFaturaCartaoId={deleteFaturaCartaoId}
      setDeleteFaturaCartaoId={setDeleteFaturaCartaoId}
      deleteFaturaImpact={deleteFaturaImpact}
      setDeleteFaturaImpact={setDeleteFaturaImpact}
      deleteFaturaImpactLoading={deleteFaturaImpactLoading}
      deleteFaturaImpactError={deleteFaturaImpactError}
      setDeleteFaturaImpactError={setDeleteFaturaImpactError}
      onRetryDeleteFaturaImpact={onRetryDeleteFaturaImpact}
      setDeleteFaturaImpactLoading={setDeleteFaturaImpactLoading}
      deleteFaturaCartaoPending={deleteFaturaCartaoPending}
      deleteFaturasMesPending={deleteFaturasMesPending}
      onConfirmDeleteFatura={onConfirmDeleteFatura}
      formatMesExibicao={formatMesExibicao}
      formatCurrency={formatCurrency}
      cartoes={cartoes}
      openDeleteCompraDialog={openDeleteCompraDialog}
      setOpenDeleteCompraDialog={setOpenDeleteCompraDialog}
      resetDeleteCompraDialog={resetDeleteCompraDialog}
      deleteCompraTarget={deleteCompraTarget}
      deleteCompraScope={deleteCompraScope}
      setDeleteCompraScope={setDeleteCompraScope}
      deleteCompraImpact={deleteCompraImpact}
      setDeleteCompraImpact={setDeleteCompraImpact}
      deleteCompraImpactLoading={deleteCompraImpactLoading}
      deleteCompraImpactError={deleteCompraImpactError}
      deleteCompraSubmitting={deleteCompraSubmitting}
      onRetryDeleteCompraImpact={onRetryDeleteCompraImpact}
      onConfirmDeleteCompra={onConfirmDeleteCompra}
    />
  );
}
