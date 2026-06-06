import { useState } from "react";
import { format } from "date-fns";
import type { CompraCartao } from "@shared/schema";
import type {
  DeleteCompraResponse,
  DeleteCompraScope,
  DeleteFaturaResponse,
} from "@/services/api/cartoes";

const getCurrentDeleteFaturaMes = () => format(new Date(), "yyyy-MM");

export function useCartoesDeleteDialogState() {
  const [openDeleteFaturaDialog, setOpenDeleteFaturaDialog] = useState(false);
  const [deleteFaturaScope, setDeleteFaturaScope] = useState<"cartao" | "todos">("cartao");
  const [deleteFaturaMes, setDeleteFaturaMes] = useState(getCurrentDeleteFaturaMes);
  const [deleteFaturaCartaoId, setDeleteFaturaCartaoId] = useState("");
  const [deleteFaturaImpact, setDeleteFaturaImpact] = useState<DeleteFaturaResponse | null>(null);
  const [deleteFaturaImpactLoading, setDeleteFaturaImpactLoading] = useState(false);
  const [deleteFaturaImpactError, setDeleteFaturaImpactError] = useState<string | null>(null);

  const [openDeleteCompraDialog, setOpenDeleteCompraDialog] = useState(false);
  const [deleteCompraTarget, setDeleteCompraTarget] = useState<CompraCartao | null>(null);
  const [deleteCompraScope, setDeleteCompraScope] = useState<DeleteCompraScope>("all_parcelas");
  const [deleteCompraImpact, setDeleteCompraImpact] = useState<DeleteCompraResponse | null>(null);
  const [deleteCompraImpactLoading, setDeleteCompraImpactLoading] = useState(false);
  const [deleteCompraImpactError, setDeleteCompraImpactError] = useState<string | null>(null);
  const [deleteCompraSubmitting, setDeleteCompraSubmitting] = useState(false);

  const resetDeleteCompraDialog = () => {
    setOpenDeleteCompraDialog(false);
    setDeleteCompraTarget(null);
    setDeleteCompraScope("all_parcelas");
    setDeleteCompraImpact(null);
    setDeleteCompraImpactLoading(false);
    setDeleteCompraImpactError(null);
    setDeleteCompraSubmitting(false);
  };

  const openDeleteCompraConfirm = (compra: CompraCartao) => {
    setDeleteCompraTarget(compra);
    setDeleteCompraScope(Number(compra.parcelas) > 1 ? "single_parcela" : "all_parcelas");
    setDeleteCompraImpact(null);
    setDeleteCompraImpactError(null);
    setOpenDeleteCompraDialog(true);
  };

  const handleOpenDeleteFaturaDialog = () => {
    setDeleteFaturaScope("cartao");
    setDeleteFaturaMes(getCurrentDeleteFaturaMes());
    setDeleteFaturaImpact(null);
    setDeleteFaturaImpactError(null);
    setOpenDeleteFaturaDialog(true);
  };

  return {
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
    setDeleteFaturaImpactLoading,
    deleteFaturaImpactError,
    setDeleteFaturaImpactError,
    openDeleteCompraDialog,
    setOpenDeleteCompraDialog,
    deleteCompraTarget,
    setDeleteCompraTarget,
    deleteCompraScope,
    setDeleteCompraScope,
    deleteCompraImpact,
    setDeleteCompraImpact,
    deleteCompraImpactLoading,
    setDeleteCompraImpactLoading,
    deleteCompraImpactError,
    setDeleteCompraImpactError,
    deleteCompraSubmitting,
    setDeleteCompraSubmitting,
    resetDeleteCompraDialog,
    openDeleteCompraConfirm,
    handleOpenDeleteFaturaDialog,
  };
}
