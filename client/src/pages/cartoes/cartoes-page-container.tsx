import { useState, lazy, Suspense, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePremiumAccess } from "@/hooks/use-premium-access";
import { useLocation } from "wouter";
import {
  Plus, Trash2, Upload, ChevronRight, RefreshCw,
} from "lucide-react";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Cartao, CompraCartao, ParcelaCompra } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildIgnoredDetails, countIgnoredRows, findVencimentoFatura, parseCsv, parseOfx, type ParseResult, type ParsedItem } from "@/pages/cartoes/import-parser";
import { ImportFaturaDialog } from "@/pages/cartoes/components/import-fatura-dialog";
import { formatImportCardOptionLabel, suggestImportCardByText } from "@/pages/cartoes/import-card-matching";
import { useCartoes } from "@/hooks/useCartoes";
import { CartoesPageHeader } from "@/components/cartoes/CartoesPageHeader";
import { CartoesSummarySection } from "@/components/cartoes/CartoesSummarySection";
import { CartoesFilterBar } from "@/components/cartoes/CartoesFilterBar";
import { CartoesGrid } from "@/components/cartoes/CartoesGrid";
import { CartoesEmptyState } from "@/components/cartoes/CartoesEmptyState";
import { CartoesDialogs } from "@/components/cartoes/CartoesDialogs";
import { CartoesInsights, type CartaoInsightItem } from "@/components/cartoes/CartoesInsights";
import { CartaoFormDialog } from "@/components/cartoes/CartaoFormDialog";
import { EditarCompraCartaoDialog, NovaCompraCartaoDialog } from "@/components/cartoes/CompraCartaoDialog";
import { CartoesMobileTabs } from "@/components/cartoes/CartoesMobileTabs";
import { CartoesComprasGrid } from "@/components/cartoes/CartoesComprasGrid";
import { ParcelasTab } from "@/components/cartoes/ParcelasTab";
import {
  deleteFaturaCartaoMes,
  deleteFaturasMes,
  deleteCompraCartaoComEscopo,
  getParcelaComprovanteDownloadUrl,
  previewImportCompras,
  type ParcelaComprovanteResumo,
  type DeleteCompraScope,
  type DeleteCompraResponse,
  type DeleteFaturaResponse,
  uploadParcelaComprovante,
} from "@/services/api/cartoes";
import { isParcelaComprometendoLimite } from "@/lib/card-limit-usage";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import {
  buildPremiumFeatureFriendlyMessage,
  parsePremiumFeatureError,
} from "@/lib/subscription-premium-feature";
import {
  formatCartaoCurrency,
  getDaysUntilInvoice,
  getNextInvoiceDate,
  isParcelaVencida,
} from "@/pages/cartoes/cartoes.utils";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const DELETE_MODAL_TIMEOUT_MS = 20_000;
const IS_DEV = import.meta.env.DEV;
type CartoesTab = "resumo" | "fatura" | "compras";

function normalizeCartoesTab(value: string | null | undefined): CartoesTab {
  if (value === "fatura" || value === "compras" || value === "resumo") {
    return value;
  }
  if (value === "parcelas") {
    return "compras";
  }
  if (value === "limite") {
    return "resumo";
  }
  return "resumo";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });
  });
}

export default function CartoesPage() {
  const { toast } = useToast();
  const premiumAccess = usePremiumAccess();
  const { prefs } = useUIPreferences();
  const [location, setLocation] = useLocation();
  const smartImportLiberado = premiumAccess.hasFeature("smartImport");

  const [openCard, setOpenCard] = useState(false);
  const [openCompra, setOpenCompra] = useState(false);
  const [selectedCartao, setSelectedCartao] = useState<string>("");
  const [cardForm, setCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [compraForm, setCompraForm] = useState({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });

  const [editingCard, setEditingCard] = useState<Cartao | null>(null);
  const [editCardForm, setEditCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [editCardIcone, setEditCardIcone] = useState<string | null>(null);
  const [newCardIcone, setNewCardIcone] = useState<string | null>(null);

  const [editingCompra, setEditingCompra] = useState<CompraCartao | null>(null);
  const [editCompraForm, setEditCompraForm] = useState({ descricao: "", valorTotal: "", parcelas: "", pessoaId: "", statusPessoa: "" });

  const [viewingCompra, setViewingCompra] = useState<CompraCartao | null>(null);
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);
  const [editingParcelaValor, setEditingParcelaValor] = useState("");
  const [editingParcelaData, setEditingParcelaData] = useState("");
  const [payingParcelaId, setPayingParcelaId] = useState<string | null>(null);
  const [payParcelaData, setPayParcelaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [abaterSaldoParcelaId, setAbaterSaldoParcelaId] = useState<string | null>(null);
  const [abaterSaldoParcelaForm, setAbaterSaldoParcelaForm] = useState({
    valor: "",
    data: format(new Date(), "yyyy-MM-dd"),
    observacao: "",
  });

  const [openImport, setOpenImport] = useState(false);
  const [importCartaoId, setImportCartaoId] = useState<string>("");
  const [importCartaoHint, setImportCartaoHint] = useState("");
  const [importTexto, setImportTexto] = useState("");
  const [importItems, setImportItems] = useState<ParsedItem[]>([]);
  const [importTab, setImportTab] = useState<"texto" | "arquivo">("texto");
  const [importLoading, setImportLoading] = useState(false);
  const [importVencimento, setImportVencimento] = useState("");
  const [importEditingId, setImportEditingId] = useState<string | null>(null);
  const [importPreviewLogId, setImportPreviewLogId] = useState<string | null>(null);
  const [importSourceType, setImportSourceType] = useState<"texto" | "csv" | "ofx" | "qfx" | "manual">("manual");
  const [importSourceName, setImportSourceName] = useState("");
  const [lastImportLogId, setLastImportLogId] = useState<string | null>(null);
  const [cartoesTab, setCartoesTab] = useState<CartoesTab>(() => {
    if (typeof window === "undefined") return "resumo";
    const params = new URLSearchParams(window.location.search);
    return normalizeCartoesTab(params.get("tab"));
  });
  const [compraSearch, setCompraSearch] = useState("");
  const [importEditForm, setImportEditForm] = useState({
    descricao: "", valor: "", dataCompra: "", parcelas: "", parcelaAtual: "", vencimentoFatura: "",
  });
  const [openDeleteFaturaDialog, setOpenDeleteFaturaDialog] = useState(false);
  const [deleteFaturaScope, setDeleteFaturaScope] = useState<"cartao" | "todos">("cartao");
  const [deleteFaturaMes, setDeleteFaturaMes] = useState(format(new Date(), "yyyy-MM"));
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
  const [parcelaSubmittingId, setParcelaSubmittingId] = useState<string | null>(null);
  const [comprovanteUploadParcelaId, setComprovanteUploadParcelaId] = useState<string | null>(null);
  const [parcelaComprovantesById, setParcelaComprovantesById] = useState<Record<string, ParcelaComprovanteResumo>>({});

  const {
    cartoes,
    compras,
    servicos,
    pessoas,
    pessoaSaldoMovimentacoes,
    parcelasCompraByUser,
    parcelasCompraData,
    refetchParcelas,
    isLoading,
    getCardCompras,
    getCardTotal,
    getCardUsedLimit,
    getCardAvailableLimit,
    totalFaturas,
    totalAguardandoReembolso,
    createCardMutation,
    updateCardMutation,
    deleteCardMutation,
    createCompraMutation,
    updateCompraMutation,
    deleteCompraMutation,
    deleteFaturaCartaoMutation,
    deleteFaturasMesMutation,
    marcarReembolsoMutation,
    payParcelaMutation,
    payParcelaPessoaMutation,
    editParcelaMutation,
    abaterSaldoParcelaMutation,
    batchImportMutation,
    rollbackImportMutation,
  } = useCartoes(viewingCompra?.id);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const compraId = params.get("compraId");
    const cartaoId = params.get("cartaoId");
    if (!compraId && !cartaoId) return;

    if (cartaoId) {
      setSelectedCartao(cartaoId);
      const cardElement = document.querySelector(`[data-testid="card-cartao-${cartaoId}"]`) as HTMLElement | null;
      cardElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (!compraId) {
      params.delete("cartaoId");
      params.delete("origem");
      const nextPath = params.toString().length > 0 ? `/cartoes?${params.toString()}` : "/cartoes";
      if (location !== nextPath) {
        setLocation(nextPath);
      }
      return;
    }

    const compra = compras.find((item) => item.id === compraId);
    if (!compra) return;

    setViewingCompra(compra);
    if (cartaoId) {
      const cardElement = document.querySelector(`[data-testid="card-cartao-${cartaoId}"]`) as HTMLElement | null;
      cardElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    params.delete("compraId");
    params.delete("cartaoId");
    params.delete("origem");
    const nextPath = params.toString().length > 0 ? `/cartoes?${params.toString()}` : "/cartoes";
    if (location !== nextPath) {
      setLocation(nextPath);
    }
  }, [compras, location, setLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get("tab");
    const normalizedTab = normalizeCartoesTab(rawTab);
    if (rawTab !== null && normalizedTab !== rawTab) {
      params.set("tab", normalizedTab);
      const nextPath = params.toString().length > 0 ? `/cartoes?${params.toString()}` : "/cartoes";
      if (location !== nextPath) {
        setLocation(nextPath);
      }
      setCartoesTab(normalizedTab);
    }
  }, [location, setLocation]);

  useEffect(() => {
    if (!openDeleteFaturaDialog) return;
    if (deleteFaturaScope === "cartao") {
      const fallbackCartaoId = selectedCartao || cartoes[0]?.id || "";
      if (!deleteFaturaCartaoId && fallbackCartaoId) {
        setDeleteFaturaCartaoId(fallbackCartaoId);
      }
    }
  }, [openDeleteFaturaDialog, deleteFaturaScope, deleteFaturaCartaoId, selectedCartao, cartoes]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!openDeleteFaturaDialog) return;
      if (!deleteFaturaMes) return;
      if (deleteFaturaScope === "cartao" && !deleteFaturaCartaoId) return;

      setDeleteFaturaImpactLoading(true);
      setDeleteFaturaImpactError(null);
      try {
        logDev("delete-fatura:preview:start", {
          scope: deleteFaturaScope,
          mes: deleteFaturaMes,
          cartaoId: deleteFaturaScope === "cartao" ? deleteFaturaCartaoId : undefined,
        });
        const response = await withTimeout(
          deleteFaturaScope === "cartao"
            ? deleteFaturaCartaoMes(deleteFaturaCartaoId, deleteFaturaMes, { dryRun: true })
            : deleteFaturasMes(deleteFaturaMes, { dryRun: true }),
          DELETE_MODAL_TIMEOUT_MS,
          "Tempo limite ao calcular impacto. Tente novamente.",
        );
        if (active) {
          setDeleteFaturaImpact(response);
          setDeleteFaturaImpactError(null);
        }
        logDev("delete-fatura:preview:success", {
          comprasRemovidas: response.impact.comprasRemovidas,
          parcelasRemovidas: response.impact.parcelasRemovidas,
          valorTotalRemovido: response.impact.valorTotalRemovido,
        });
      } catch (error) {
        if (active) {
          setDeleteFaturaImpact(null);
          const message = getErrorMessage(error);
          setDeleteFaturaImpactError(message);
          toast({
            title: "Erro ao calcular impacto",
            description: message,
            variant: "destructive",
          });
        }
        logDev("delete-fatura:preview:error", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (active) {
          setDeleteFaturaImpactLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [
    openDeleteFaturaDialog,
    deleteFaturaScope,
    deleteFaturaMes,
    deleteFaturaCartaoId,
  ]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!openDeleteCompraDialog || !deleteCompraTarget) return;
      try {
        await loadDeleteCompraImpact(deleteCompraTarget, deleteCompraScope, { isActive: () => active });
      } catch {
        // Erro ja tratado dentro do calculo de impacto.
      }
      if (!active) {
        return;
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [
    openDeleteCompraDialog,
    deleteCompraTarget,
    deleteCompraScope,
  ]);
  const getErrorMessage = (error: unknown) => {
    const planLimitError = parsePlanLimitError(error);
    if (planLimitError) {
      return buildPlanLimitFriendlyMessage(planLimitError);
    }
    const premiumFeatureError = parsePremiumFeatureError(error);
    if (premiumFeatureError) {
      return buildPremiumFeatureFriendlyMessage(premiumFeatureError);
    }
    return error instanceof Error ? error.message : "Erro inesperado";
  };

  const logDev = (event: string, payload?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.info("[cartoes][dev]", event, payload ?? {});
  };

  const showSmartImportPremiumToast = () => {
    toast({
      title: "Importação inteligente é Premium",
      description:
        "Faça upgrade para Premium para usar preview, confirmação e rollback de importação de faturas/extratos.",
    });
  };

  const openImportDialog = () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }
    if (cartoes.length === 0) {
      toast({
        title: "Cadastre um cartao antes de importar",
        description: "A importacao de fatura precisa de um cartao de destino.",
        variant: "destructive",
      });
      return;
    }
    setImportCartaoId("");
    setImportCartaoHint("");
    setOpenImport(true);
  };

  const getPessoaSaldoDisponivel = (pessoaId: string): number => {
    const { creditos, debitos } = pessoaSaldoMovimentacoes.reduce(
      (acc, mov) => {
        if (mov.pessoaId !== pessoaId) return acc;
        const valor = Number(mov.valor) || 0;
        if (mov.tipo === "credito") acc.creditos += valor;
        else acc.debitos += valor;
        return acc;
      },
      { creditos: 0, debitos: 0 },
    );
    return Math.max(0, Number((creditos - debitos).toFixed(2)));
  };

  const getParcelaSaldoAbatido = (parcelaId: string): number => {
    const total = pessoaSaldoMovimentacoes.reduce((sum, mov) => {
      if (mov.tipo !== "debito") return sum;
      if (mov.parcelaCompraId !== parcelaId) return sum;
      if ((mov.origem ?? "").toLowerCase() !== "abatimento_parcela_cartao") return sum;
      return sum + (Number(mov.valor) || 0);
    }, 0);
    return Number(total.toFixed(2));
  };

  const getParcelaSaldoPendente = (parcela: ParcelaCompra): number => {
    const valor = Number(parcela.valor) || 0;
    const abatido = getParcelaSaldoAbatido(parcela.id);
    return Math.max(0, Number((valor - abatido).toFixed(2)));
  };

  const compraSearchNormalized = compraSearch.trim().toLowerCase();
  const activeCartoesTab: CartoesTab = cartoesTab;

  const parcelaComprovanteMutation = useMutation({
    mutationFn: async ({ parcelaId, file }: { parcelaId: string; file: File }) => {
      const comprovante = await uploadParcelaComprovante(parcelaId, file);
      return { parcelaId, comprovante };
    },
    onMutate: ({ parcelaId }) => {
      setComprovanteUploadParcelaId(parcelaId);
    },
    onSuccess: ({ parcelaId, comprovante }) => {
      setParcelaComprovantesById((prev) => ({
        ...prev,
        [parcelaId]: comprovante,
      }));
      toast({ title: "Comprovante anexado" });
      refetchParcelas();
    },
    onError: (error) => {
      toast({
        title: "Erro ao anexar comprovante",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setComprovanteUploadParcelaId(null);
    },
  });

  const getParcelaComprovante = (parcela: ParcelaCompra): ParcelaComprovanteResumo | null => {
    const override = parcelaComprovantesById[parcela.id];
    if (override) return override;

    const raw = parcela as unknown as Record<string, unknown>;
    const nome = typeof raw.comprovanteNome === "string" ? raw.comprovanteNome : null;
    const mimeType = typeof raw.comprovanteMimeType === "string" ? raw.comprovanteMimeType : null;
    const tamanhoRaw = raw.comprovanteTamanho;
    const tamanho = typeof tamanhoRaw === "number"
      ? tamanhoRaw
      : typeof tamanhoRaw === "string"
        ? Number(tamanhoRaw)
        : NaN;
    const enviadoEmRaw = raw.comprovanteEnviadoEm;
    const enviadoEm = typeof enviadoEmRaw === "string"
      ? enviadoEmRaw
      : enviadoEmRaw instanceof Date
        ? enviadoEmRaw.toISOString()
        : null;

    if (!nome || !mimeType || !Number.isFinite(tamanho)) {
      return null;
    }

    return {
      nome,
      mimeType,
      tamanho,
      enviadoEm,
      downloadUrl: getParcelaComprovanteDownloadUrl(parcela.id),
    };
  };

  const getFilteredCardCompras = (cartaoId: string) => {
    const card = cartoes.find((item) => item.id === cartaoId);
    return getCardCompras(cartaoId).filter((compra) => {
      if (!compraSearchNormalized) return true;
      const texto = [
        compra.descricao,
        card?.nome,
        compra.dataCompra,
        String(compra.valorParcela),
        String(compra.valorTotal),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return texto.includes(compraSearchNormalized);
    });
  };

  const formatMesExibicao = (mes: string) => {
    const [ano, mesNumero] = mes.split("-");
    const parsedMonth = Number(mesNumero);
    if (!ano || !Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return mes;
    const data = new Date(Number(ano), parsedMonth - 1, 1);
    return format(data, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, (char) => char.toUpperCase());
  };

  const retryDeleteFaturaImpact = async () => {
    if (!deleteFaturaMes) return;
    if (deleteFaturaScope === "cartao" && !deleteFaturaCartaoId) return;
    setDeleteFaturaImpact(null);
    setDeleteFaturaImpactError(null);
    setDeleteFaturaImpactLoading(true);
    try {
      const response = await withTimeout(
        deleteFaturaScope === "cartao"
          ? deleteFaturaCartaoMes(deleteFaturaCartaoId, deleteFaturaMes, { dryRun: true })
          : deleteFaturasMes(deleteFaturaMes, { dryRun: true }),
        DELETE_MODAL_TIMEOUT_MS,
        "Tempo limite ao calcular impacto. Tente novamente.",
      );
      setDeleteFaturaImpact(response);
      logDev("delete-fatura:preview:retry-success", {
        comprasRemovidas: response.impact.comprasRemovidas,
        parcelasRemovidas: response.impact.parcelasRemovidas,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setDeleteFaturaImpactError(message);
      toast({
        title: "Erro ao calcular impacto",
        description: message,
        variant: "destructive",
      });
      logDev("delete-fatura:preview:retry-error", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDeleteFaturaImpactLoading(false);
    }
  };

  const getCurrentParcelaIdForCompra = (compra: CompraCartao): string | null => {
    const rows = parcelasCompraByUser
      .filter((parcela) => parcela.compraCartaoId === compra.id)
      .sort((a, b) => a.numero - b.numero);
    if (rows.length === 0) return null;
    const byNumero = rows.find((parcela) => parcela.numero === compra.parcelaAtual);
    if (byNumero) return byNumero.id;
    const firstPendente = rows.find((parcela) => isParcelaComprometendoLimite(parcela.statusCartao));
    return firstPendente?.id ?? rows[0].id;
  };

  const loadDeleteCompraImpact = async (
    compra: CompraCartao,
    scope: DeleteCompraScope,
    options?: { isActive?: () => boolean },
  ) => {
    const canUpdate = () => (options?.isActive ? options.isActive() : true);
    const parcelaId = scope === "single_parcela"
      ? getCurrentParcelaIdForCompra(compra) ?? undefined
      : undefined;

    if (scope === "single_parcela" && !parcelaId) {
      if (!canUpdate()) return;
      setDeleteCompraImpact(null);
      setDeleteCompraImpactError("Nao foi possivel identificar a parcela alvo para esta compra.");
      return;
    }

    if (!canUpdate()) return;
    setDeleteCompraImpactLoading(true);
    setDeleteCompraImpactError(null);
    try {
      const response = await withTimeout(
        deleteCompraCartaoComEscopo(compra.id, {
          scope,
          parcelaId,
          dryRun: true,
        }),
        DELETE_MODAL_TIMEOUT_MS,
        "Tempo limite ao calcular impacto. Tente novamente.",
      );
      if (!canUpdate()) return;
      setDeleteCompraImpact(response);
    } catch (error) {
      if (!canUpdate()) return;
      setDeleteCompraImpact(null);
      const message = getErrorMessage(error);
      setDeleteCompraImpactError(message);
      toast({
        title: "Erro ao calcular impacto",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (!canUpdate()) return;
      setDeleteCompraImpactLoading(false);
    }
  };

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

  const openAbaterSaldoParcelaDialog = (parcelaId: string, pessoaId: string) => {
    const parcela = parcelasCompraData.find((item) => item.id === parcelaId);
    if (!parcela) return;

    const saldoDisponivel = getPessoaSaldoDisponivel(pessoaId);
    const pendente = getParcelaSaldoPendente(parcela);
    const sugestao = Math.min(saldoDisponivel, pendente);

    setAbaterSaldoParcelaId(parcelaId);
    setAbaterSaldoParcelaForm({
      valor: sugestao > 0 ? sugestao.toFixed(2) : "",
      data: format(new Date(), "yyyy-MM-dd"),
      observacao: "",
    });
  };

  const resetImportState = () => {
    setOpenImport(false);
    setImportCartaoId("");
    setImportCartaoHint("");
    setImportItems([]);
    setImportTexto("");
    setImportVencimento("");
    setImportEditingId(null);
    setImportPreviewLogId(null);
    setImportSourceType("manual");
    setImportSourceName("");
  };

  const handleImportCartaoChange = (value: string) => {
    const changed = value !== importCartaoId;
    setImportCartaoId(value);
    setImportCartaoHint("");

    if (changed && (importItems.length > 0 || importPreviewLogId)) {
      setImportItems([]);
      setImportPreviewLogId(null);
      setImportEditingId(null);
      setImportSourceType("manual");
      setImportSourceName("");
      toast({
        title: "Cartao de destino alterado",
        description: "Gere o preview novamente para importar no cartao selecionado.",
      });
    }
  };

  const resolveImportCartaoId = (sourceText: string): string | null => {
    if (importCartaoId) return importCartaoId;

    const suggestion = suggestImportCardByText(sourceText, cartoes);
    if (suggestion.kind === "single_match") {
      setImportCartaoId(suggestion.card.id);
      setImportCartaoHint(
        `Cartao sugerido automaticamente: ${suggestion.issuerLabel} -> ${formatImportCardOptionLabel(suggestion.card)}`,
      );
      return suggestion.card.id;
    }

    if (suggestion.kind === "multiple_cards") {
      setImportCartaoHint(
        `Detectamos ${suggestion.issuerLabel}, mas existem ${suggestion.cards.length} cartoes compatíveis. Selecione manualmente.`,
      );
      return null;
    }

    if (suggestion.kind === "issuer_without_card") {
      setImportCartaoHint(
        `Detectamos ${suggestion.issuerLabel}, mas nao encontramos cartao cadastrado correspondente. Selecione manualmente.`,
      );
      return null;
    }

    if (suggestion.kind === "multiple_issuers") {
      setImportCartaoHint(
        `Detectamos mais de um emissor (${suggestion.issuerLabels.join(", ")}). Selecione o cartao manualmente.`,
      );
      return null;
    }

    setImportCartaoHint("Nao foi possivel detectar o emissor. Selecione manualmente o cartao de destino.");
    return null;
  };

  const handleCreateCard = () => {
    createCardMutation.mutate(
      {
        ...cardForm,
        iconeId: newCardIcone,
      },
      {
        onSuccess: () => {
          setOpenCard(false);
          setCardForm({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
          setNewCardIcone(null);
          toast({ title: "Cartao adicionado" });
        },
        onError: (error) => {
          const planLimitError = parsePlanLimitError(error);
          toast({
            title: planLimitError ? "Limite do plano Free atingido" : "Erro",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleUpdateCard = () => {
    if (!editingCard) return;
    updateCardMutation.mutate(
      {
        id: editingCard.id,
        data: { ...editCardForm, iconeId: editCardIcone },
      },
      {
        onSuccess: () => {
          setEditingCard(null);
          toast({ title: "Cartao atualizado" });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
        },
      },
    );
  };

  const handleCreateCompra = () => {
    createCompraMutation.mutate(
      {
        cartaoId: selectedCartao,
        descricao: compraForm.descricao,
        valorTotal: compraForm.valorTotal,
        parcelas: compraForm.parcelas,
        dataCompra: compraForm.dataCompra,
        pessoaId: compraForm.pessoaId || null,
      },
      {
        onSuccess: () => {
          setOpenCompra(false);
          setCompraForm({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });
          toast({ title: "Compra registrada" });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
        },
      },
    );
  };

  const handleUpdateCompra = () => {
    if (!editingCompra) return;
    logDev("update-compra:start", {
      compraId: editingCompra.id,
      cartaoId: editingCompra.cartaoId,
      valorTotal: editCompraForm.valorTotal,
      parcelas: editCompraForm.parcelas,
      pessoaId: editCompraForm.pessoaId || null,
    });
    updateCompraMutation.mutate(
      {
        id: editingCompra.id,
        data: editCompraForm,
      },
      {
        onSuccess: () => {
          setEditingCompra(null);
          toast({ title: "Compra atualizada" });
          logDev("update-compra:success", { compraId: editingCompra.id });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
          logDev("update-compra:error", {
            compraId: editingCompra.id,
            message: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  };

  const handleMarcarReembolso = (id: string, pago: boolean) => {
    marcarReembolsoMutation.mutate(
      { id, pago },
      {
        onSuccess: () => {
          toast({ title: "Status de reembolso atualizado" });
        },
      },
    );
  };

  const handleDeleteCard = (id: string) => {
    deleteCardMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Cartao removido" });
      },
    });
  };

  const handleConfirmDeleteFatura = () => {
    if (!deleteFaturaMes) {
      toast({ title: "Selecione o mês da fatura", variant: "destructive" });
      return;
    }
    if (deleteFaturaScope === "cartao" && !deleteFaturaCartaoId) {
      toast({ title: "Selecione o cartão", variant: "destructive" });
      return;
    }

    logDev("delete-fatura:confirm:start", {
      scope: deleteFaturaScope,
      mes: deleteFaturaMes,
      cartaoId: deleteFaturaScope === "cartao" ? deleteFaturaCartaoId : undefined,
    });

    const mutation = deleteFaturaScope === "cartao"
      ? deleteFaturaCartaoMutation.mutateAsync({
        cartaoId: deleteFaturaCartaoId,
        mes: deleteFaturaMes,
      })
      : deleteFaturasMesMutation.mutateAsync({ mes: deleteFaturaMes });

    void withTimeout(
      mutation,
      DELETE_MODAL_TIMEOUT_MS,
      "Tempo limite ao excluir fatura. Tente novamente.",
    ).then((response) => {
      setOpenDeleteFaturaDialog(false);
      setDeleteFaturaImpact(null);
      setDeleteFaturaImpactError(null);
      toast({
        title: "Fatura excluída com sucesso",
        description: `${response.impact.comprasRemovidas} compra(s) e ${response.impact.parcelasRemovidas} parcela(s) removidas.`,
      });
      logDev("delete-fatura:confirm:success", {
        comprasRemovidas: response.impact.comprasRemovidas,
        parcelasRemovidas: response.impact.parcelasRemovidas,
        valorTotalRemovido: response.impact.valorTotalRemovido,
      });
    }).catch((error) => {
      toast({
        title: "Erro ao excluir fatura",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      logDev("delete-fatura:confirm:error", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const handleConfirmDeleteCompra = () => {
    if (!deleteCompraTarget) return;
    const parcelaId = deleteCompraScope === "single_parcela"
      ? getCurrentParcelaIdForCompra(deleteCompraTarget) ?? undefined
      : undefined;

    if (deleteCompraScope === "single_parcela" && !parcelaId) {
      toast({
        title: "Não foi possível localizar a parcela",
        description: "Abra as parcelas da compra para sincronizar e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setDeleteCompraSubmitting(true);
    void withTimeout(
      deleteCompraMutation.mutateAsync({
        compraId: deleteCompraTarget.id,
        scope: deleteCompraScope,
        parcelaId,
      }),
      DELETE_MODAL_TIMEOUT_MS,
      "Tempo limite ao excluir compra/parcela. Tente novamente.",
    ).then(() => {
      const scopeLabel = deleteCompraScope === "single_parcela"
        ? "Parcela removida"
        : "Compra removida";
      toast({ title: scopeLabel });
      resetDeleteCompraDialog();
    }).catch((error) => {
      toast({
        title: "Erro ao excluir",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }).finally(() => {
      setDeleteCompraSubmitting(false);
    });
  };

  const handlePayParcela = (id: string, pago: boolean, dataPagamento?: string) => {
    setParcelaSubmittingId(id);
    logDev("pay-parcela:start", { parcelaId: id, pago, dataPagamento: dataPagamento ?? null });
    payParcelaMutation.mutate(
      { id, pago, dataPagamento },
      {
        onSuccess: () => {
          setPayingParcelaId(null);
          toast({ title: "Status da parcela atualizado" });
          logDev("pay-parcela:success", { parcelaId: id, pago });
        },
        onError: (error) => {
          toast({ title: "Erro ao atualizar parcela", description: getErrorMessage(error), variant: "destructive" });
          logDev("pay-parcela:error", {
            parcelaId: id,
            pago,
            message: error instanceof Error ? error.message : String(error),
          });
        },
        onSettled: () => {
          setParcelaSubmittingId((current) => (current === id ? null : current));
        },
      },
    );
  };

  const handlePayParcelaPessoa = (id: string, pago: boolean) => {
    payParcelaPessoaMutation.mutate(
      { id, pago },
      {
        onSuccess: () => {
          toast({ title: "Reembolso atualizado" });
        },
      },
    );
  };

  const handleEditParcela = (id: string) => {
    editParcelaMutation.mutate(
      { id, valor: editingParcelaValor, dataVencimento: editingParcelaData },
      {
        onSuccess: () => {
          setEditingParcelaId(null);
          toast({ title: "Parcela atualizada" });
        },
      },
    );
  };

  const handleConfirmImport = () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    const cartaoId = importCartaoId;
    if (!cartaoId) {
      toast({ title: "Selecione um cartao para importar", variant: "destructive" });
      return;
    }
    if (!importPreviewLogId) {
      toast({ title: "Gere o preview antes de confirmar a importacao", variant: "destructive" });
      return;
    }

    batchImportMutation.mutate(
      {
        items: importItems,
        cartaoId,
        previewLogId: importPreviewLogId,
        sourceType: importSourceType,
        sourceName: importSourceName || undefined,
      },
      {
        onSuccess: (result) => {
          setLastImportLogId(result.importLogId);
          resetImportState();
          toast({
            title: "Compras importadas com sucesso",
            description: `Lote ${result.importLogId.slice(0, 8)} confirmado (${result.createdCount} item(ns))`,
          });
        },
        onError: (error) => {
          toast({ title: "Erro na importacao", description: getErrorMessage(error), variant: "destructive" });
        },
      },
    );
  };

  const handleRollbackLastImport = () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    if (!lastImportLogId) return;

    rollbackImportMutation.mutate(lastImportLogId, {
      onSuccess: (result) => {
        setLastImportLogId(null);
        toast({
          title: "Importacao revertida",
          description: `${result.deletedCount} compra(s) removida(s) do lote ${result.importLogId.slice(0, 8)}.`,
        });
      },
      onError: (error) => {
        toast({
          title: "Falha ao reverter importacao",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      },
    });
  };

  const handleParseTexto = async () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    if (!importTexto.trim()) {
      toast({ title: "Cole ou escreva o texto da fatura", variant: "destructive" });
      return;
    }

    const cartaoId = resolveImportCartaoId(importTexto);
    if (!cartaoId) {
      toast({ title: "Selecione um cartao para importar", variant: "destructive" });
      return;
    }

    setImportLoading(true);
    try {
      const result = parseCsv(importTexto, compras, cartaoId);
      const venc = findVencimentoFatura(importTexto);
      if (venc) setImportVencimento(venc);

      const ignoredDetails = buildIgnoredDetails(result.stats);
      const hasIgnoredRows = countIgnoredRows(result.stats) > 0;
      if (result.items.length === 0) {
        toast({
          title: "Nenhuma compra detectada. Verifique o formato do texto.",
          description: ignoredDetails,
          variant: "destructive",
        });
        setImportItems([]);
        setImportPreviewLogId(null);
        return;
      }

      const preview = await previewImportCompras({
        cartaoId,
        sourceType: "texto",
        sourceName: "texto-livre",
        items: result.items,
      });

      const rawById = new Map(result.items.map((item) => [item.id, item]));
      const mergedItems = preview.items.map((item) => ({
        ...item,
        duplicata: rawById.get(item.id)?.duplicata ?? null,
      }));

      setImportItems(mergedItems);
      setImportEditingId(null);
      setImportPreviewLogId(preview.importLogId);
      setImportSourceType("texto");
      setImportSourceName("texto-livre");

      toast({
        title: `${preview.summary.importItems} item(ns) pronto(s) para importar`,
        description:
          `Confianca media ${Math.round(preview.summary.averageConfidence)}%. ` +
          `${preview.summary.reviewItems} item(ns) requer(em) revisao.` +
          (hasIgnoredRows && ignoredDetails ? ` ${ignoredDetails}` : ""),
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar preview da importacao",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setImportPreviewLogId(null);
    } finally {
      setImportLoading(false);
    }
  };

  const applyImportEdit = () => {
    if (!importEditingId) return;
    const p = Math.max(1, parseInt(importEditForm.parcelas) || 1);
    const pa = Math.min(Math.max(1, parseInt(importEditForm.parcelaAtual) || 1), p);
    const vp = parseFloat(importEditForm.valor) || 0; // valor da parcela
    const vt = Number((vp * p).toFixed(2)); // valorTotal = parcela × total
    setImportItems(importItems.map((item) => item.id === importEditingId ? {
      ...item,
      descricao: importEditForm.descricao || item.descricao,
      valor: vp > 0 ? vt : item.valor,
      valorParcela: vp > 0 ? vp : item.valorParcela,
      parcelas: p,
      parcelaAtual: pa,
      parcelasRestantes: Math.max(p - pa + 1, 0),
      dataCompra: importEditForm.dataCompra || item.dataCompra,
      vencimentoFatura: importEditForm.vencimentoFatura || null,
    } : item));
    setImportEditingId(null);
  };

  const applyVencimentoToAll = () => {
    if (!importVencimento) return;
    setImportItems(importItems.map((item) => ({ ...item, vencimentoFatura: importVencimento })));
  };

  const handleFileUpload = async (file: File) => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    setImportLoading(true);
    try {
      const content = await file.text();
      const cartaoId = resolveImportCartaoId(`${file.name}\n${content}`);
      if (!cartaoId) {
        toast({ title: "Selecione um cartao para importar", variant: "destructive" });
        return;
      }
      let result: ParseResult;
      const name = file.name.toLowerCase();
      let sourceType: "csv" | "ofx" | "qfx";
      if (name.endsWith(".ofx")) {
        result = parseOfx(content, compras, cartaoId);
        sourceType = "ofx";
      } else if (name.endsWith(".qfx")) {
        result = parseOfx(content, compras, cartaoId);
        sourceType = "qfx";
      } else {
        result = parseCsv(content, compras, cartaoId);
        sourceType = "csv";
      }
      const venc = findVencimentoFatura(content);
      if (venc) setImportVencimento(venc);
      const ignoredDetails = buildIgnoredDetails(result.stats);
      const hasIgnoredRows = countIgnoredRows(result.stats) > 0;
      if (result.items.length === 0) {
        toast({
          title: "Nenhuma compra detectada no arquivo.",
          description: ignoredDetails,
          variant: "destructive",
        });
        setImportItems([]);
        setImportPreviewLogId(null);
        return;
      }

      const preview = await previewImportCompras({
        cartaoId,
        sourceType,
        sourceName: file.name,
        items: result.items,
      });

      const rawById = new Map(result.items.map((item) => [item.id, item]));
      const mergedItems = preview.items.map((item) => ({
        ...item,
        duplicata: rawById.get(item.id)?.duplicata ?? null,
      }));

      setImportItems(mergedItems);
      setImportEditingId(null);
      setImportPreviewLogId(preview.importLogId);
      setImportSourceType(sourceType);
      setImportSourceName(file.name);

      toast({
        title: `${preview.summary.importItems} item(ns) pronto(s) para importar`,
        description:
          `Confianca media ${Math.round(preview.summary.averageConfidence)}%. ` +
          `${preview.summary.reviewItems} item(ns) requer(em) revisao.` +
          (hasIgnoredRows && ignoredDetails ? ` ${ignoredDetails}` : ""),
      });
    } catch (error) {
      toast({
        title: "Erro ao ler arquivo",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setImportPreviewLogId(null);
    } finally { setImportLoading(false); }
  };

  const showCompraSearch = activeCartoesTab === "compras" || activeCartoesTab === "fatura";
  const cartoesInsightsItems = (() => {
    if (cartoes.length === 0) return [] as CartaoInsightItem[];

    const items: CartaoInsightItem[] = [];
    const rankedByUtil = cartoes
      .map((cartao) => {
        const limite = Number(cartao.limite) || 0;
        const comprometido = getCardUsedLimit(cartao.id);
        const percentual = limite > 0 ? (comprometido / limite) * 100 : 0;
        return { cartao, percentual };
      })
      .sort((a, b) => b.percentual - a.percentual);

    const critical = rankedByUtil.find((item) => item.percentual >= 85);
    if (critical) {
      items.push({
        id: `critical-${critical.cartao.id}`,
        severity: "critical",
        title: `${critical.cartao.nome} quase comprometido`,
        description: `${critical.percentual.toFixed(0)}% do limite já utilizado.`,
      });
    }

    const warning = rankedByUtil.find((item) => item.percentual >= 65 && item.percentual < 85);
    if (warning) {
      items.push({
        id: `warning-${warning.cartao.id}`,
        severity: "warning",
        title: `${warning.cartao.nome} exige atenção`,
        description: `Uso de limite em ${warning.percentual.toFixed(0)}%.`,
      });
    }

    const compraLonga = compras.find((compra) => Number(compra.parcelas) >= 24);
    if (compraLonga) {
      items.push({
        id: `long-${compraLonga.id}`,
        severity: "info",
        title: "Parcelamento longo identificado",
        description: `${compraLonga.descricao} em ${compraLonga.parcelas} parcelas.`,
      });
    }

    const bestAvailable = cartoes
      .map((cartao) => ({ cartao, disponivel: getCardAvailableLimit(cartao.id) }))
      .sort((a, b) => b.disponivel - a.disponivel)[0];
    if (bestAvailable && bestAvailable.disponivel > 0) {
      items.push({
        id: `best-${bestAvailable.cartao.id}`,
        severity: "info",
        title: "Melhor disponibilidade atual",
        description: `${bestAvailable.cartao.nome} com ${formatCartaoCurrency(bestAvailable.disponivel)} disponível.`,
      });
    }

    return items.slice(0, 4);
  })();

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack" data-testid="cartoes-page">
      <CartoesPageHeader
        title="Cartoes de Credito"
        subtitle="Gerencie seus cartoes e compras parceladas"
        actions={(
          <>
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:col-span-2 md:flex-row md:items-center xl:col-span-1">
              <Button
                variant="outline"
                onClick={openImportDialog}
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
              onClick={() => {
                setDeleteFaturaScope("cartao");
                setDeleteFaturaMes(format(new Date(), "yyyy-MM"));
                setDeleteFaturaImpact(null);
                setDeleteFaturaImpactError(null);
                setOpenDeleteFaturaDialog(true);
              }}
              disabled={cartoes.length === 0}
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
                onClick={handleRollbackLastImport}
                disabled={rollbackImportMutation.isPending}
                data-testid="button-rollback-import"
              >
                <RefreshCw className="mr-2 h-4 w-4 flex-shrink-0" />
                {rollbackImportMutation.isPending ? "Revertendo..." : "Desfazer Ultima Importacao"}
              </Button>
            ) : null}
            <Button
              className="w-full touch-feedback sm:col-span-2 xl:w-auto xl:flex-none"
              data-testid="button-add-cartao"
              onClick={() => setOpenCard(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo cartao
            </Button>
          </>
        )}
      />

      <CartoesSummarySection
        hasCartoes={cartoes.length > 0}
        totalFaturas={totalFaturas}
        totalAguardandoReembolso={totalAguardandoReembolso}
        formatCurrency={formatCartaoCurrency}
        showInsights={false}
        insights={<CartoesInsights items={cartoesInsightsItems} />}
        filterBar={(
          <CartoesFilterBar
            cartoesTab={activeCartoesTab}
            onTabChange={setCartoesTab}
            compraSearch={compraSearch}
            onCompraSearchChange={setCompraSearch}
            showSearch={showCompraSearch}
          />
        )}
      />

      <NovaCompraCartaoDialog
        open={openCompra}
        onOpenChange={setOpenCompra}
        form={compraForm}
        setForm={setCompraForm}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        onSubmit={handleCreateCompra}
        isPending={createCompraMutation.isPending}
      />

      <CartaoFormDialog
        open={openCard}
        onOpenChange={setOpenCard}
        title="Novo Cartao"
        form={cardForm}
        setForm={setCardForm}
        iconPicker={(
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <IconPicker value={newCardIcone} name={cardForm.nome} onChange={setNewCardIcone} size="md" />
          </Suspense>
        )}
        onSubmit={handleCreateCard}
        isPending={createCardMutation.isPending}
        pendingLabel="Salvando..."
        submitLabel="Salvar"
        testIds={{
          nome: "input-cartao-nome",
          limite: "input-cartao-limite",
          melhorDiaCompra: "input-cartao-melhordia",
          diaVencimento: "input-cartao-vencimento",
          submit: "button-save-cartao",
        }}
      />

      <CartaoFormDialog
        open={!!editingCard}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCard(null);
            setEditCardIcone(null);
          }
        }}
        title="Editar Cartao"
        form={editCardForm}
        setForm={setEditCardForm}
        iconPicker={(
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <IconPicker value={editCardIcone} name={editCardForm.nome} onChange={setEditCardIcone} size="md" />
          </Suspense>
        )}
        onSubmit={handleUpdateCard}
        isPending={updateCardMutation.isPending}
        pendingLabel="Salvando..."
        submitLabel="Salvar alteracoes"
        testIds={{
          nome: "input-edit-cartao-nome",
          limite: "input-edit-cartao-limite",
          melhorDiaCompra: "input-edit-cartao-melhordia",
          diaVencimento: "input-edit-cartao-vencimento",
          submit: "button-save-edit-cartao",
        }}
      />

      <EditarCompraCartaoDialog
        open={!!editingCompra}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCompra(null);
          }
        }}
        form={editCompraForm}
        setForm={setEditCompraForm}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        onSubmit={handleUpdateCompra}
        isPending={updateCompraMutation.isPending}
      />

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
        onRetryDeleteFaturaImpact={() => {
          void retryDeleteFaturaImpact();
        }}
        setDeleteFaturaImpactLoading={setDeleteFaturaImpactLoading}
        deleteFaturaCartaoPending={deleteFaturaCartaoMutation.isPending}
        deleteFaturasMesPending={deleteFaturasMesMutation.isPending}
        onConfirmDeleteFatura={handleConfirmDeleteFatura}
        formatMesExibicao={formatMesExibicao}
        formatCurrency={formatCartaoCurrency}
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
        onRetryDeleteCompraImpact={() => {
          if (!deleteCompraTarget) return;
          void loadDeleteCompraImpact(deleteCompraTarget, deleteCompraScope);
        }}
        onConfirmDeleteCompra={handleConfirmDeleteCompra}
      />

      <ParcelasTab
        open={!!viewingCompra}
        onOpenChange={(open) => {
          if (!open) {
            setViewingCompra(null);
            setAbaterSaldoParcelaId(null);
            setParcelaSubmittingId(null);
            setComprovanteUploadParcelaId(null);
          }
        }}
        viewingCompra={viewingCompra}
        parcelasCompraData={parcelasCompraData}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        getParcelaSaldoPendente={getParcelaSaldoPendente}
        getParcelaSaldoAbatido={getParcelaSaldoAbatido}
        getPessoaSaldoDisponivel={getPessoaSaldoDisponivel}
        isParcelaVencida={isParcelaVencida}
        isParcelaComprometendoLimite={isParcelaComprometendoLimite}
        editingParcelaId={editingParcelaId}
        setEditingParcelaId={setEditingParcelaId}
        editingParcelaValor={editingParcelaValor}
        setEditingParcelaValor={setEditingParcelaValor}
        editingParcelaData={editingParcelaData}
        setEditingParcelaData={setEditingParcelaData}
        payingParcelaId={payingParcelaId}
        setPayingParcelaId={setPayingParcelaId}
        payParcelaData={payParcelaData}
        setPayParcelaData={setPayParcelaData}
        onEditParcela={handleEditParcela}
        onPayParcela={handlePayParcela}
        onPayParcelaPessoa={handlePayParcelaPessoa}
        parcelaActionLoadingId={parcelaSubmittingId}
        isParcelaActionPending={payParcelaMutation.isPending}
        onOpenAbaterSaldoParcela={openAbaterSaldoParcelaDialog}
        abaterSaldoParcelaId={abaterSaldoParcelaId}
        setAbaterSaldoParcelaId={setAbaterSaldoParcelaId}
        abaterSaldoParcelaForm={abaterSaldoParcelaForm}
        setAbaterSaldoParcelaForm={setAbaterSaldoParcelaForm}
        onSubmitAbaterSaldo={() => {
          if (!viewingCompra?.pessoaId || !abaterSaldoParcelaId) return;
          abaterSaldoParcelaMutation.mutate(
            {
              pessoaId: viewingCompra.pessoaId,
              parcelaId: abaterSaldoParcelaId,
              valor: abaterSaldoParcelaForm.valor,
              data: abaterSaldoParcelaForm.data,
              observacao: abaterSaldoParcelaForm.observacao || null,
            },
            {
              onSuccess: (result) => {
                setAbaterSaldoParcelaId(null);
                toast({
                  title: result.quitada ? "Parcela quitada com saldo" : "Abatimento parcial registrado",
                  description: `Saldo utilizado: ${formatCartaoCurrency(result.valorAbatido)}`,
                });
                refetchParcelas();
              },
              onError: (error) => {
                toast({
                  title: "Erro ao abater saldo",
                  description: getErrorMessage(error),
                  variant: "destructive",
                });
              },
            },
          );
        }}
        isAbaterSaldoPending={abaterSaldoParcelaMutation.isPending}
        getParcelaComprovante={getParcelaComprovante}
        onUploadParcelaComprovante={async (parcelaId, file) => {
          await parcelaComprovanteMutation.mutateAsync({ parcelaId, file });
        }}
        comprovanteUploadLoadingId={comprovanteUploadParcelaId}
      />

      <ImportFaturaDialog
        open={openImport}
        onOpenChange={(v) => {
          if (!v) {
            setOpenImport(false);
            setImportCartaoId("");
            setImportCartaoHint("");
            setImportItems([]);
            setImportTexto("");
            setImportVencimento("");
            setImportEditingId(null);
            setImportPreviewLogId(null);
            setImportSourceType("manual");
            setImportSourceName("");
            return;
          }
          if (!smartImportLiberado) {
            setOpenImport(false);
            showSmartImportPremiumToast();
            return;
          }
          setOpenImport(true);
        }}
        cartoes={cartoes}
        importCartaoId={importCartaoId}
        setImportCartaoId={handleImportCartaoChange}
        importCartaoHint={importCartaoHint}
        formatCartaoOptionLabel={formatImportCardOptionLabel}
        importTab={importTab}
        setImportTab={(value) => setImportTab(value)}
        importTexto={importTexto}
        setImportTexto={setImportTexto}
        onParseTexto={handleParseTexto}
        importLoading={importLoading}
        onFileUpload={handleFileUpload}
        importItems={importItems}
        setImportItems={setImportItems}
        importVencimento={importVencimento}
        setImportVencimento={setImportVencimento}
        onApplyVencimentoToAll={applyVencimentoToAll}
        importEditingId={importEditingId}
        setImportEditingId={setImportEditingId}
        importEditForm={importEditForm}
        setImportEditForm={setImportEditForm}
        onApplyImportEdit={applyImportEdit}
        formatCurrency={formatCartaoCurrency}
        isBatchImportPending={batchImportMutation.isPending}
        onConfirmImport={handleConfirmImport}
      />

      <div data-testid={`cartoes-tab-${activeCartoesTab}`}>
        <CartoesGrid
          cartoes={cartoes}
          cartoesTab={activeCartoesTab}
          getCardTotal={getCardTotal}
          getCardUsedLimit={getCardUsedLimit}
          getCardAvailableLimit={getCardAvailableLimit}
          getCardCompras={getCardCompras}
          getFilteredCardCompras={getFilteredCardCompras}
          formatCartaoCurrency={formatCartaoCurrency}
          onOpenCompras={(cartaoId) => {
            setCartoesTab("compras");
            setSelectedCartao(cartaoId);
          }}
          onDeleteCompra={openDeleteCompraConfirm}
        />
      </div>

      <div className={activeCartoesTab === "compras" || cartoes.length === 0 ? "" : "hidden"}>
      {cartoes.length === 0 ? (
        <CartoesEmptyState />
      ) : prefs.mobileMode ? (
        <CartoesMobileTabs
          cartoes={cartoes}
          selectedCartao={selectedCartao}
          setSelectedCartao={setSelectedCartao}
          setOpenCompra={setOpenCompra}
          totalFaturas={totalFaturas}
          formatCurrency={formatCartaoCurrency}
          getCardTotal={getCardTotal}
          getCardAvailableLimit={getCardAvailableLimit}
          getFilteredCardCompras={getFilteredCardCompras}
          servicos={servicos}
          onOpenParcelas={setViewingCompra}
          onDeleteCompra={openDeleteCompraConfirm}
        />
      ) : (
        <CartoesComprasGrid
          cartoes={cartoes}
          pessoas={pessoas}
          servicos={servicos}
          formatCurrency={formatCartaoCurrency}
          getCardTotal={getCardTotal}
          getCardUsedLimit={getCardUsedLimit}
          getCardAvailableLimit={getCardAvailableLimit}
          getFilteredCardCompras={getFilteredCardCompras}
          getDaysUntilInvoice={getDaysUntilInvoice}
          getNextInvoiceDate={getNextInvoiceDate}
          onEditCartao={(cartao) => {
            setEditingCard(cartao);
            setEditCardForm({
              nome: cartao.nome,
              limite: String(cartao.limite),
              melhorDiaCompra: String(cartao.melhorDiaCompra),
              diaVencimento: String(cartao.diaVencimento),
            });
            setEditCardIcone(cartao.iconeId || null);
          }}
          onDeleteCartao={handleDeleteCard}
          onAddCompra={(cartaoId) => {
            setSelectedCartao(cartaoId);
            setOpenCompra(true);
          }}
          onOpenParcelas={setViewingCompra}
          onEditCompra={(compra) => {
            setEditingCompra(compra);
            setEditCompraForm({
              descricao: compra.descricao,
              valorTotal: String(compra.valorTotal),
              parcelas: String(compra.parcelas),
              pessoaId: compra.pessoaId ?? "",
              statusPessoa: compra.statusPessoa ?? "pendente",
            });
          }}
          onDeleteCompra={openDeleteCompraConfirm}
          onMarcarReembolso={(compraId) => handleMarcarReembolso(compraId, true)}
        />
      )}
      </div>
    </div>
  );
}






