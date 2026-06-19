import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePremiumAccess } from "@/hooks/use-premium-access";
import { useLocation } from "wouter";
import { useUIPreferences } from "@/context/ui-preferences";
import { queryClient } from "@/lib/queryClient";
import type { Cartao, CompraCartao, ParcelaCompra } from "@shared/schema";
import {
  findCardInvoiceSnapshot,
  getInstallmentEffectivePaidAmount,
  getInstallmentInvoicePaymentStatus,
} from "@shared/card-invoice-payments";
import { format } from "date-fns";
import {
  detectItauInvoiceText,
  detectMercadoPagoInvoiceText,
  buildIgnoredDetails,
  countIgnoredRows,
  detectNubankInvoiceText,
  detectRecurringServiceCandidate,
  findVencimentoFatura,
  parseCsv,
  parseOfx,
  parsePdf,
  type ParseResult,
  type ParsedItem,
} from "@/pages/cartoes/import-parser";
import { extractPdfTextVariantsFromPdfBuffer, isExtractedPdfTextUsable } from "@/pages/cartoes/import-pdf-utils";
import { buildCompraAliasDraft } from "@/pages/cartoes/import-existing-purchase-match";
import {
  applyServiceSuggestionMetadata,
  extractCardLast4FromName,
  extractItauDebugSectionLines,
  formatImportFileSize,
  getImportFileExtension,
  getImportItemEffectiveStatus,
  isImportItemStructurallyInvalid,
  isImportMimeAllowed,
  isItauCardLikeName,
  isMercadoPagoCardLikeName,
  isNubankCardLikeName,
  listToHumanReadable,
  mergePreviewItemsWithLocalSignals,
  normalizeCartoesTab,
  toIndexedImportDebugLines,
} from "@/pages/cartoes/cartoes-import.utils";
import {
  CartaoFaturaPaymentDialog,
  CartaoFaturaSection,
  CartoesListSection,
  CartoesPageLoadingState,
  CartoesPageToolbar,
  ImportFaturaDialog,
} from "@/pages/cartoes/components";
import { formatImportCardOptionLabel, suggestImportCardByText } from "@/pages/cartoes/import-card-matching";
import { useCartoes } from "@/hooks/useCartoes";
import { CartoesSummarySection } from "@/components/cartoes/CartoesSummarySection";
import { CartoesFilterBar } from "@/components/cartoes/CartoesFilterBar";
import { CartoesInsights } from "@/components/cartoes/CartoesInsights";
import { ParcelasTab } from "@/components/cartoes/ParcelasTab";
import {
  CartaoCreateEditDialogs,
  DeleteCompraFaturaDialogs,
  EditCompraDialog,
  NewCompraDialog,
} from "@/pages/cartoes/dialogs";
import {
  useCartoesDeleteDialogState,
  useCartoesFilters,
  useCartoesSelectionState,
} from "@/pages/cartoes/hooks";
import {
  deleteFaturaCartaoMes,
  deleteFaturasMes,
  deleteCompraCartaoComEscopo,
  createCompraAlias,
  fetchCompraAliases,
  fetchImportLogs,
  type ImportConfirmResponse,
  type ImportLogEntry,
  deleteParcelaComprovante,
  getParcelaComprovanteDownloadUrl,
  previewImportCompras,
  reconcileImportedPurchase,
  type ParcelaComprovanteResumo,
  type DeleteCompraScope,
  uploadParcelaComprovante,
} from "@/services/api/cartoes";
import { createIconMatchRules, fetchIconMatchRules, type IconMatchRuleApiModel } from "@/services/api/icon-match-rules";
import { fetchUserIconLibrary, type UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";
import { matchPurchaseIconByDescription, type UserIconMatchRule } from "@/lib/purchase-icon-matching";
import { LIBRARY_ICONS } from "@/lib/brand-icons";
import {
  resolveEntityIconIdForSave,
  resolveEntityIconReference,
  resolveEntityIconSuggestion,
} from "@/lib/entity-icon-suggestion";
import {
  buildInvoiceTrackingInstallmentsForCard,
  getInvoiceCompetency,
  groupParcelasCompraByCompraId,
  isParcelaComprometendoLimite,
} from "@/lib/card-limit-usage";
import { parseMoney } from "@/lib/money";
import {
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import {
  formatCartaoCurrency,
  getDaysUntilInvoice,
  getNextInvoiceDate,
  isParcelaVencida,
} from "@/pages/cartoes/cartoes.utils";
import {
  formatInvoiceCompetencyLabel,
  formatMesExibicao,
  getErrorMessage,
} from "@/pages/cartoes/cartoes-page.utils";
import { buildCartoesInsightsItems } from "@/pages/cartoes/cartoes-page-insights";
import {
  buildEditCompraIconUpdatePatch,
  resolveEditCompraIconPresentation,
  resolvePersistableCompraIconId,
  resolveEditCompraIconRuleTarget,
} from "@/pages/cartoes/edit-compra-icon.utils";
import type { CartoesTab } from "@/pages/cartoes/types";

const DELETE_MODAL_TIMEOUT_MS = 20_000;
const IS_DEV = import.meta.env.DEV;
const IMPORT_FILE_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const IMPORT_ALLOWED_EXTENSIONS = new Set(["csv", "ofx", "qfx", "txt", "pdf"]);
type CompraReembolsoModo = "total" | "metade" | "valor_custom" | "percentual_custom";

function isImportPdfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("debugImportPdf") === "1";
  } catch {
    return false;
  }
}

function logItauImportDebugSnapshot(debugData: {
  fileName: string;
  plainText: string;
  positionalText: string;
  mergedSignalText: string;
}): void {
  if (typeof console === "undefined") return;

  const plainSectionLines = extractItauDebugSectionLines(debugData.plainText);
  const positionalSectionLines = extractItauDebugSectionLines(debugData.positionalText);
  const mergedSectionLines = extractItauDebugSectionLines(debugData.mergedSignalText);

  console.groupCollapsed("[import-itau][debug] snapshot");
  console.info("file", debugData.fileName);
  console.info("plain.section.lines", toIndexedImportDebugLines(plainSectionLines));
  console.info("positional.section.lines", toIndexedImportDebugLines(positionalSectionLines));
  console.info("merged.section.lines", toIndexedImportDebugLines(mergedSectionLines));
  console.groupEnd();
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
  const [cardForm, setCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [compraForm, setCompraForm] = useState<{
    descricao: string;
    valorTotal: string;
    parcelas: string;
    dataCompra: string;
    pessoaId: string;
    reembolsoModo: CompraReembolsoModo;
    reembolsoValorTotal: string;
    reembolsoPercentual: string;
  }>({
    descricao: "",
    valorTotal: "",
    parcelas: "1",
    dataCompra: "",
    pessoaId: "",
    reembolsoModo: "total" as const,
    reembolsoValorTotal: "",
    reembolsoPercentual: "",
  });

  const [editingCard, setEditingCard] = useState<Cartao | null>(null);
  const [editCardForm, setEditCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [editCardIcone, setEditCardIcone] = useState<string | null>(null);
  const [editCardIconPersistableId, setEditCardIconPersistableId] = useState<string | null>(null);
  const [editCardIconManualSelection, setEditCardIconManualSelection] = useState(false);
  const [newCardIcone, setNewCardIcone] = useState<string | null>(null);
  const [newCardIconPersistableId, setNewCardIconPersistableId] = useState<string | null>(null);
  const [newCardIconManualSelection, setNewCardIconManualSelection] = useState(false);

  const [editingCompra, setEditingCompra] = useState<CompraCartao | null>(null);
  const [editCompraForm, setEditCompraForm] = useState<{
    descricao: string;
    valorTotal: string;
    parcelas: string;
    pessoaId: string;
    statusPessoa: string;
    reembolsoModo: CompraReembolsoModo;
    reembolsoValorTotal: string;
    reembolsoPercentual: string;
  }>({
    descricao: "",
    valorTotal: "",
    parcelas: "",
    pessoaId: "",
    statusPessoa: "",
    reembolsoModo: "total" as const,
    reembolsoValorTotal: "",
    reembolsoPercentual: "",
  });
  const [editCompraIcone, setEditCompraIcone] = useState<string | null>(null);
  const [editCompraIconDirty, setEditCompraIconDirty] = useState(false);
  const [editCompraIconPersistableId, setEditCompraIconPersistableId] = useState<string | null | undefined>(undefined);
  const [applyEditCompraIconRule, setApplyEditCompraIconRule] = useState(false);

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
  const [importSourceType, setImportSourceType] = useState<"texto" | "csv" | "ofx" | "qfx" | "pdf" | "manual">("manual");
  const [importSourceName, setImportSourceName] = useState("");
  const [importIssuerMismatchWarning, setImportIssuerMismatchWarning] = useState("");
  const [importIssuerMismatchMustAcknowledge, setImportIssuerMismatchMustAcknowledge] = useState(false);
  const [importIssuerMismatchAcknowledged, setImportIssuerMismatchAcknowledged] = useState(false);
  const [lastImportLogId, setLastImportLogId] = useState<string | null>(null);
  const [importConfirmResult, setImportConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [historyRollbackLogId, setHistoryRollbackLogId] = useState<string | null>(null);
  const [isReconcilingImport, setIsReconcilingImport] = useState(false);
  const [rememberingCompraAliasByItemId, setRememberingCompraAliasByItemId] = useState<Record<string, boolean>>({});
  const [savedCompraAliasByItemId, setSavedCompraAliasByItemId] = useState<Record<string, boolean>>({});
  const {
    selectedCartao,
    setSelectedCartao,
    cartoesTab,
    setCartoesTab,
    selectedInvoiceMonth,
    setSelectedInvoiceMonth,
    compraSearch,
    setCompraSearch,
    comprasCartaoFocadoId,
    setComprasCartaoFocadoId,
    handleCartoesTabChange,
  } = useCartoesSelectionState({
    initialCartoesTab: () => {
      if (typeof window === "undefined") return "resumo";
      const params = new URLSearchParams(window.location.search);
      return normalizeCartoesTab(params.get("tab"));
    },
    initialInvoiceMonth: () => format(new Date(), "yyyy-MM"),
  });
  const [importEditForm, setImportEditForm] = useState({
    descricao: "", valor: "", dataCompra: "", parcelas: "", parcelaAtual: "", vencimentoFatura: "",
  });
  const {
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
  } = useCartoesDeleteDialogState();
  const [parcelaSubmittingId, setParcelaSubmittingId] = useState<string | null>(null);
  const [comprovanteUploadParcelaId, setComprovanteUploadParcelaId] = useState<string | null>(null);
  const [comprovanteDeleteParcelaId, setComprovanteDeleteParcelaId] = useState<string | null>(null);
  const [parcelaComprovantesById, setParcelaComprovantesById] = useState<Record<string, ParcelaComprovanteResumo | null>>({});
  const [invoicePaymentTarget, setInvoicePaymentTarget] = useState<{ cartaoId: string; monthReference: string } | null>(null);

  const {
    cartoes,
    cartaoFaturaPagamentos,
    compras,
    servicos,
    servicoPessoas,
    pessoas,
    pessoaSaldoMovimentacoes,
    parcelasCompraByUser,
    parcelasCompraData,
    isParcelasCompraLoading,
    isParcelasCompraError,
    parcelasCompraError,
    refetchParcelas,
    isLoading,
    getCardCompras,
    getCardUsedLimit,
    getCardAvailableLimit,
    totalAguardandoReembolso,
    createCardMutation,
    updateCardMutation,
    deleteCardMutation,
    createCompraMutation,
    updateCompraMutation,
    deleteCompraMutation,
    deleteFaturaCartaoMutation,
    deleteFaturasMesMutation,
    registerInvoicePaymentMutation,
    cancelInvoicePaymentMutation,
    marcarReembolsoMutation,
    payParcelaMutation,
    payParcelaPessoaMutation,
    editParcelaMutation,
    moveParcelaCompetenciaMutation,
    abaterSaldoParcelaMutation,
    batchImportMutation,
    rollbackImportMutation,
  } = useCartoes(viewingCompra?.id);

  const {
    data: importLogs = [],
    isLoading: isImportLogsLoading,
  } = useQuery<ImportLogEntry[]>({
    queryKey: ["/api/imports/logs", "modal", 20],
    queryFn: () => fetchImportLogs(20),
    enabled: smartImportLiberado && openImport,
    staleTime: 30_000,
  });
  const {
    data: compraAliases = [],
    isLoading: isCompraAliasesLoading,
  } = useQuery({
    queryKey: ["/api/compra-aliases", "import", importCartaoId || "all"],
    queryFn: fetchCompraAliases,
    enabled: smartImportLiberado && openImport && importItems.length > 0,
    staleTime: 5 * 60_000,
  });
  const { data: iconMatchRules = [] } = useQuery<IconMatchRuleApiModel[]>({
    queryKey: ["/api/icon-match-rules"],
    queryFn: fetchIconMatchRules,
    staleTime: 5 * 60_000,
  });
  const { data: userIconLibrary = [] } = useQuery<UserIconLibraryItemApiModel[]>({
    queryKey: ["/api/user-icon-library", "edit-compra"],
    queryFn: fetchUserIconLibrary,
    staleTime: 5 * 60_000,
  });
  const saveIconMatchRuleMutation = useMutation({
    mutationFn: async ({ descricao, iconId }: { descricao: string; iconId: string }) =>
      createIconMatchRules({
        iconId,
        terms: [descricao],
      }),
    onSuccess: () => {
      toast({
        title: "Reconhecimento salvo",
        description: "Compras com nome parecido vão usar esse ícone automaticamente.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] });
    },
  });

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
  useEffect(() => {
    const validIds = new Set(importItems.map((item) => item.id));
    setRememberingCompraAliasByItemId((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [itemId, isSaving] of Object.entries(current)) {
        if (validIds.has(itemId)) {
          next[itemId] = isSaving;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setSavedCompraAliasByItemId((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [itemId, isSaved] of Object.entries(current)) {
        if (validIds.has(itemId)) {
          next[itemId] = isSaved;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [importItems]);
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

  const normalizedIconMatchRules = useMemo<UserIconMatchRule[]>(
    () => iconMatchRules.map((rule) => ({
      id: rule.id,
      iconId: rule.iconId,
      normalizedTerm: rule.normalizedTerm,
      originalTerm: rule.originalTerm,
    })),
    [iconMatchRules],
  );
  const iconLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const icon of LIBRARY_ICONS) {
      map.set(icon.key, icon.label);
    }
    for (const icon of userIconLibrary) {
      map.set(icon.id, icon.name || "Ícone personalizado");
      if (icon.imageUrl) {
        map.set(icon.imageUrl, icon.name || "Ícone personalizado");
      }
    }
    return map;
  }, [userIconLibrary]);

  const resolveIconLabel = (iconId: string | null | undefined): string => {
    if (!iconId) return "Ícone automático";
    if (iconLabelById.has(iconId)) return iconLabelById.get(iconId) ?? "Ícone personalizado";
    if (iconId.startsWith("data:")) return "Ícone personalizado";
    return "Ícone da biblioteca";
  };

  const resolveDisplayIconId = (iconId: string | null | undefined): string | null =>
    resolveEntityIconReference(iconId, userIconLibrary).displayIconId;

  const resolveStrongAutoIconSuggestion = (text: string) =>
    resolveEntityIconSuggestion({
      name: text,
      userRules: normalizedIconMatchRules,
      userIcons: userIconLibrary,
    });

  const resolveCompraIconSuggestion = (compra: CompraCartao) =>
    compra.iconeId
      ? {
        matched: true,
        iconId: resolveDisplayIconId(compra.iconeId) ?? compra.iconeId,
        label: resolveIconLabel(resolveDisplayIconId(compra.iconeId) ?? compra.iconeId),
        confidenceScore: 1,
        confidenceLevel: "alta" as const,
        shouldAutoApply: true,
        shouldSuggest: false,
        source: null,
        matchedTerm: null,
      }
      : matchPurchaseIconByDescription(compra.descricao, normalizedIconMatchRules, {
        userIcons: userIconLibrary,
      });
  const resolveStrongAutoIconId = (text: string, explicitIconId?: string | null) => {
    if (explicitIconId) return explicitIconId;
    const suggestion = resolveStrongAutoIconSuggestion(text);
    if (!suggestion.shouldAutoApply) return null;
    return suggestion.displayIconId;
  };
  const resolveCardAutoIconId = (cartao: Cartao) => {
    const explicitDisplay = resolveDisplayIconId(cartao.iconeId);
    if (explicitDisplay) return explicitDisplay;
    const suggestion = resolveStrongAutoIconSuggestion(cartao.nome);
    return suggestion.shouldAutoApply ? suggestion.displayIconId : null;
  };
  const newCardStrongIconSuggestion = useMemo(
    () => resolveStrongAutoIconSuggestion(cardForm.nome),
    [cardForm.nome, normalizedIconMatchRules, userIconLibrary],
  );
  const editCardStrongIconSuggestion = useMemo(
    () => resolveStrongAutoIconSuggestion(editCardForm.nome),
    [editCardForm.nome, normalizedIconMatchRules, userIconLibrary],
  );
  const newCardPreviewIconId = newCardIconManualSelection
    ? newCardIcone
    : (newCardStrongIconSuggestion.shouldAutoApply ? newCardStrongIconSuggestion.displayIconId : null);
  const editCardPreviewIconId = editCardIconManualSelection
    ? editCardIcone
    : (editCardStrongIconSuggestion.shouldAutoApply ? editCardStrongIconSuggestion.displayIconId : null);
  const showNewCardMediumSuggestion = !newCardIconManualSelection
    && !newCardStrongIconSuggestion.shouldAutoApply
    && newCardStrongIconSuggestion.shouldSuggest
    && Boolean(newCardStrongIconSuggestion.persistableIconId);
  const showEditCardMediumSuggestion = !editCardIconManualSelection
    && !editCardStrongIconSuggestion.shouldAutoApply
    && editCardStrongIconSuggestion.shouldSuggest
    && Boolean(editCardStrongIconSuggestion.persistableIconId);
  const handleSaveCompraIconRule = async (descricao: string, iconId: string) => {
    await saveIconMatchRuleMutation.mutateAsync({ descricao, iconId });
  };
  const editCompraPersistedIconeId = editingCompra?.iconeId ?? null;
  const editCompraAutoSuggestedIconId = editingCompra
    ? resolveStrongAutoIconId(editCompraForm.descricao || editingCompra.descricao, null)
    : null;
  const editCompraIconPresentation = resolveEditCompraIconPresentation({
    persistedIconId: editCompraPersistedIconeId,
    editedIconId: editCompraIcone,
    iconDirty: editCompraIconDirty,
    autoSuggestedIconId: editCompraAutoSuggestedIconId,
  });
  const editCompraIconPreviewId = editCompraIconPresentation.previewIconId;
  const editCompraIconPreviewLabel = resolveIconLabel(editCompraIconPreviewId);
  const editCompraIconPreviewHint = editCompraIconPresentation.hint;
  const activeCartoesTab: CartoesTab = cartoesTab;
  const currentInvoiceMonthReference = format(new Date(), "yyyy-MM");
  const parcelasCompraByCompraId = useMemo(
    () => groupParcelasCompraByCompraId(parcelasCompraByUser),
    [parcelasCompraByUser],
  );
  const getCompraParcelas = useCallback(
    (compraId: string) => parcelasCompraByCompraId.get(compraId) ?? [],
    [parcelasCompraByCompraId],
  );
  const cartoesById = useMemo(
    () => new Map(cartoes.map((cartao) => [cartao.id, cartao])),
    [cartoes],
  );
  const invoicePaymentsByCardMonthKey = useMemo(() => {
    const grouped = new Map<string, typeof cartaoFaturaPagamentos>();
    for (const payment of cartaoFaturaPagamentos) {
      const monthReference = `${String(payment.competenciaAno).padStart(4, "0")}-${String(payment.competenciaMes).padStart(2, "0")}`;
      const key = `${payment.cartaoId}:${monthReference}`;
      const rows = grouped.get(key) ?? [];
      rows.push(payment);
      grouped.set(key, rows);
    }
    return grouped;
  }, [cartaoFaturaPagamentos]);
  const getInvoicePaymentsForCompetency = useCallback(
    (cartaoId: string, monthReference: string) =>
      invoicePaymentsByCardMonthKey.get(`${cartaoId}:${monthReference}`) ?? [],
    [invoicePaymentsByCardMonthKey],
  );
  const getInvoiceSnapshotForCompetency = useCallback((cartaoId: string, monthReference: string) => {
    const cartao = cartoesById.get(cartaoId);
    if (!cartao) return null;
    return findCardInvoiceSnapshot({
      cartaoId,
      monthReference,
      installments: buildInvoiceTrackingInstallmentsForCard(
        cartaoId,
        compras,
        parcelasCompraByCompraId,
      ),
      payments: getInvoicePaymentsForCompetency(cartaoId, monthReference),
      getDueDayForCard: () => cartao.diaVencimento,
      referenceDate: format(new Date(), "yyyy-MM-dd"),
    });
  }, [cartoesById, compras, getInvoicePaymentsForCompetency, parcelasCompraByCompraId]);
  const selectedInvoiceSnapshotsByCardId = useMemo(
    () => new Map(
      cartoes.map((cartao) => [cartao.id, getInvoiceSnapshotForCompetency(cartao.id, selectedInvoiceMonth)]),
    ),
    [cartoes, getInvoiceSnapshotForCompetency, selectedInvoiceMonth],
  );
  const {
    invoiceMonthOptions,
    selectedInvoiceMonthLabel,
    getFilteredCardFaturaCompras,
  } = useCartoesFilters({
    cartoes,
    compras,
    parcelasCompraByUser,
    parcelasCompraByCompraId,
    selectedInvoiceMonth,
    setSelectedInvoiceMonth,
    currentInvoiceMonthReference,
    compraSearch,
    getCardCompras,
    formatInvoiceCompetencyLabel,
  });
  const getCardTotalForSelectedMonth = (cartaoId: string) =>
    selectedInvoiceSnapshotsByCardId.get(cartaoId)?.remainingAmount ?? 0;
  const canOpenInvoicePaymentDialog = (cartaoId: string) => {
    const snapshot = selectedInvoiceSnapshotsByCardId.get(cartaoId);
    const payments = getInvoicePaymentsForCompetency(cartaoId, selectedInvoiceMonth);
    return Boolean((snapshot && snapshot.originalTotal > 0) || payments.length > 0);
  };
  const getInvoicePaymentActionLabel = (cartaoId: string) => {
    const snapshot = selectedInvoiceSnapshotsByCardId.get(cartaoId);
    const payments = getInvoicePaymentsForCompetency(cartaoId, selectedInvoiceMonth);
    if ((snapshot?.remainingAmount ?? 0) > 0) return "Pagar fatura";
    if (payments.length > 0) return "Ver pagamentos";
    return "Pagamentos";
  };
  const totalFaturasForSelectedMonth = useMemo(
    () => cartoes.reduce((sum, cartao) => sum + getCardTotalForSelectedMonth(cartao.id), 0),
    [cartoes, selectedInvoiceSnapshotsByCardId],
  );
  const selectedInvoicePaymentCartao = invoicePaymentTarget
    ? (cartoesById.get(invoicePaymentTarget.cartaoId) ?? null)
    : null;
  const selectedInvoicePaymentSnapshot = invoicePaymentTarget
    ? getInvoiceSnapshotForCompetency(invoicePaymentTarget.cartaoId, invoicePaymentTarget.monthReference)
    : null;
  const selectedInvoicePaymentHistory = invoicePaymentTarget
    ? getInvoicePaymentsForCompetency(invoicePaymentTarget.cartaoId, invoicePaymentTarget.monthReference)
    : [];
  const selectedInvoiceInstallments = useMemo(() => {
    if (!invoicePaymentTarget) return [];
    const comprasDaFatura = getFilteredCardFaturaCompras(invoicePaymentTarget.cartaoId);
    const pagamentosDaCompetencia = getInvoicePaymentsForCompetency(
      invoicePaymentTarget.cartaoId,
      invoicePaymentTarget.monthReference,
    );

    return comprasDaFatura.flatMap((compra) => (
      getCompraParcelas(compra.id)
        .filter((parcela) => getInvoiceCompetency(parcela.dataVencimento) === invoicePaymentTarget.monthReference)
        .map((parcela) => {
          const valorPagoAtual = getInstallmentEffectivePaidAmount({
            id: parcela.id,
            valor: parcela.valor,
            statusCartao: parcela.statusCartao,
          }, pagamentosDaCompetencia);
          const valorParcela = Number(parcela.valor);

          return {
            parcelaCompraId: parcela.id,
            compraCartaoId: compra.id,
            descricao: compra.descricao,
            numero: parcela.numero,
            valor: valorParcela,
            valorPagoAtual,
            valorPendente: Math.max(0, valorParcela - valorPagoAtual),
            status: getInstallmentInvoicePaymentStatus({
              id: parcela.id,
              valor: parcela.valor,
              statusCartao: parcela.statusCartao,
            }, pagamentosDaCompetencia),
          };
        })
    ));
  }, [
    getCompraParcelas,
    getFilteredCardFaturaCompras,
    getInvoicePaymentsForCompetency,
    invoicePaymentTarget,
  ]);
  const getCompraInvoicePaymentStatus = useCallback((compraId: string, cartaoId: string) => {
    const compra = compras.find((item) => item.id === compraId);
    if (!compra) return null;
    const pagamentosDaCompetencia = getInvoicePaymentsForCompetency(cartaoId, selectedInvoiceMonth);
    const parcelasDaCompetencia = getCompraParcelas(compraId)
      .filter((parcela) => getInvoiceCompetency(parcela.dataVencimento) === selectedInvoiceMonth);

    if (parcelasDaCompetencia.length === 0) return null;

    let hasPaid = false;
    let hasPartial = false;
    let hasPending = false;

    for (const parcela of parcelasDaCompetencia) {
      const status = getInstallmentInvoicePaymentStatus({
        id: parcela.id,
        valor: parcela.valor,
        statusCartao: parcela.statusCartao,
      }, pagamentosDaCompetencia);

      if (status === "pago") hasPaid = true;
      else if (status === "parcialmente_pago") hasPartial = true;
      else hasPending = true;
    }

    if (hasPartial || (hasPaid && hasPending)) return "parcialmente_pago";
    if (hasPaid) return "pago";
    return "pendente";
  }, [compras, getCompraParcelas, getInvoicePaymentsForCompetency, selectedInvoiceMonth]);

  const parcelaComprovanteMutation = useMutation({
    mutationFn: async ({ parcelaId, file }: { parcelaId: string; file: File }) => {
      const comprovante = await uploadParcelaComprovante(parcelaId, file);
      return { parcelaId, comprovante };
    },
    onMutate: ({ parcelaId }) => {
      setComprovanteUploadParcelaId(parcelaId);
    },
    onSuccess: async ({ parcelaId, comprovante }) => {
      setParcelaComprovantesById((prev) => ({
        ...prev,
        [parcelaId]: comprovante,
      }));
      toast({ title: "Comprovante anexado" });

      const keys: Array<ReadonlyArray<unknown>> = [
        ["/api/parcelas-compra"],
        ["/api/compras-cartao"],
        ["/api/cartoes"],
        ["/api/cartoes/resumo"],
        ["/api/dashboard/overview"],
        ["/api/financial/summary"],
        ["/api/financial/score"],
        ["/api/financial/insights"],
      ];

      if (viewingCompra?.id) {
        keys.push(["/api/parcelas-compra", viewingCompra.id]);
      }

      await Promise.all(
        keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      await refetchParcelas();
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

  const deleteParcelaComprovanteMutation = useMutation({
    mutationFn: async ({ parcelaId }: { parcelaId: string }) => {
      await deleteParcelaComprovante(parcelaId);
      return { parcelaId };
    },
    onMutate: ({ parcelaId }) => {
      setComprovanteDeleteParcelaId(parcelaId);
    },
    onSuccess: async ({ parcelaId }) => {
      setParcelaComprovantesById((prev) => ({
        ...prev,
        [parcelaId]: null,
      }));
      toast({ title: "Comprovante excluido" });

      const keys: Array<ReadonlyArray<unknown>> = [
        ["/api/parcelas-compra"],
        ["/api/compras-cartao"],
        ["/api/cartoes"],
        ["/api/cartoes/resumo"],
        ["/api/dashboard/overview"],
        ["/api/financial/summary"],
        ["/api/financial/score"],
        ["/api/financial/insights"],
      ];

      if (viewingCompra?.id) {
        keys.push(["/api/parcelas-compra", viewingCompra.id]);
      }

      await Promise.all(
        keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      await refetchParcelas();
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir comprovante",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setComprovanteDeleteParcelaId(null);
    },
  });

  const getParcelaComprovante = (parcela: ParcelaCompra): ParcelaComprovanteResumo | null => {
    if (Object.prototype.hasOwnProperty.call(parcelaComprovantesById, parcela.id)) {
      return parcelaComprovantesById[parcela.id] ?? null;
    }

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
    setImportIssuerMismatchWarning("");
    setImportIssuerMismatchMustAcknowledge(false);
    setImportIssuerMismatchAcknowledged(false);
    setImportConfirmResult(null);
    setHistoryRollbackLogId(null);
    setRememberingCompraAliasByItemId({});
    setSavedCompraAliasByItemId({});
  };

  const handleImportCartaoChange = (value: string) => {
    const changed = value !== importCartaoId;
    setImportCartaoId(value);
    setImportCartaoHint("");
    setImportIssuerMismatchWarning("");
    setImportIssuerMismatchMustAcknowledge(false);
    setImportIssuerMismatchAcknowledged(false);

    if (changed && (importItems.length > 0 || importPreviewLogId)) {
      setImportItems([]);
      setImportPreviewLogId(null);
      setImportEditingId(null);
      setImportSourceType("manual");
      setImportSourceName("");
      setImportIssuerMismatchWarning("");
      setImportIssuerMismatchMustAcknowledge(false);
      setImportIssuerMismatchAcknowledged(false);
      setImportConfirmResult(null);
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

  const applyPdfIssuerMismatchGuard = (
    sourceText: string,
    selectedCartaoId: string,
    parsedItems: ParsedItem[] = [],
  ) => {
    setImportIssuerMismatchWarning("");
    setImportIssuerMismatchMustAcknowledge(false);
    setImportIssuerMismatchAcknowledged(false);

    const selectedCartao = cartoes.find((item) => item.id === selectedCartaoId);
    if (!selectedCartao) return;

    const applyStrongMismatchReview = (warning: string) => {
      setImportItems((items) =>
        items.map((item) => {
          const isMercadoPagoItem = item.invoiceIssuerDetected === "mercado_pago"
            || item.parserUsed === "mercado_pago_textual_pdf"
            || /^\d{4}$/.test((item.cardLast4 ?? "").trim());
          if (!isMercadoPagoItem) return item;

          const issues = item.validationIssues ?? [];
          const nextIssues = issues.includes(warning) ? issues : [...issues, warning];
          const nextConfidenceScore = Math.max(
            0,
            Math.min(typeof item.confidenceScore === "number" ? item.confidenceScore : 80, 70),
          );

          return {
            ...item,
            reviewRequired: true,
            validationIssues: nextIssues,
            confidenceScore: nextConfidenceScore,
            confidenceLevel: nextConfidenceScore >= 65 ? "media" : "baixa",
          };
        }),
      );
    };

    const mercadoPagoLast4 = Array.from(new Set(
      parsedItems
        .map((item) => item.cardLast4?.trim() ?? "")
        .filter((value) => /^\d{4}$/.test(value)),
    ));
    const isMercadoPagoInvoice = detectMercadoPagoInvoiceText(sourceText) || mercadoPagoLast4.length > 0;

    if (isMercadoPagoInvoice) {
      const selectedLooksMercadoPago = isMercadoPagoCardLikeName(selectedCartao.nome);
      const selectedCardLast4 = extractCardLast4FromName(selectedCartao.nome);

      if (!selectedLooksMercadoPago) {
        const warning = `Esta fatura parece ser Mercado Pago, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`;
        setImportIssuerMismatchWarning(warning);
        setImportIssuerMismatchMustAcknowledge(true);
        applyStrongMismatchReview(warning);
        return;
      }

      if (
        selectedCardLast4
        && mercadoPagoLast4.length > 0
        && !mercadoPagoLast4.includes(selectedCardLast4)
      ) {
        const warning = `Esta fatura contém compras dos cartões finais ${listToHumanReadable(mercadoPagoLast4)}, mas o cartão selecionado não parece corresponder a esses finais.`;
        setImportIssuerMismatchWarning(warning);
        setImportIssuerMismatchMustAcknowledge(true);
        applyStrongMismatchReview(warning);
        return;
      }

      if (mercadoPagoLast4.length > 1) {
        setImportIssuerMismatchWarning(
          `Esta fatura contém compras de mais de um cartão Mercado Pago: finais ${listToHumanReadable(mercadoPagoLast4)}. Confira se deseja importar todos neste cartão.`,
        );
      }
      return;
    }

    const isNubankInvoice = detectNubankInvoiceText(sourceText);
    if (isNubankInvoice && !isNubankCardLikeName(selectedCartao.nome)) {
      setImportIssuerMismatchWarning(
        `Esta fatura parece ser Nubank, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    const isItauInvoice = detectItauInvoiceText(sourceText);
    if (isItauInvoice && !isItauCardLikeName(selectedCartao.nome)) {
      setImportIssuerMismatchWarning(
        `Esta fatura parece ser Itaú, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    const suggestion = suggestImportCardByText(sourceText, cartoes);

    if (suggestion.kind === "single_match" && suggestion.card.id !== selectedCartaoId) {
      setImportIssuerMismatchWarning(
        `Esta fatura parece ser ${suggestion.issuerLabel}, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    if (
      suggestion.kind === "multiple_cards" &&
      !suggestion.cards.some((card) => card.id === selectedCartaoId)
    ) {
      setImportIssuerMismatchWarning(
        `Detectamos ${suggestion.issuerLabel} no PDF, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    if (suggestion.kind === "issuer_without_card") {
      setImportIssuerMismatchWarning(
        `Detectamos emissor ${suggestion.issuerLabel} no PDF. Confirme se o cartão selecionado (${selectedCartao.nome}) é o destino correto.`,
      );
    }
  };

  const handleCreateCard = () => {
    const nextIconeId = resolveEntityIconIdForSave({
      isManualSelection: newCardIconManualSelection,
      manualPersistableIconId: newCardIconPersistableId
        ?? resolveEntityIconReference(newCardIcone, userIconLibrary).persistableIconId,
      autoSuggestion: newCardStrongIconSuggestion,
    });
    createCardMutation.mutate(
      {
        ...cardForm,
        iconeId: nextIconeId,
      },
      {
        onSuccess: () => {
          setOpenCard(false);
          setCardForm({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
          setNewCardIcone(null);
          setNewCardIconPersistableId(null);
          setNewCardIconManualSelection(false);
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
    const nextIconeId = resolveEntityIconIdForSave({
      isManualSelection: editCardIconManualSelection,
      manualPersistableIconId: editCardIconPersistableId
        ?? resolveEntityIconReference(editCardIcone, userIconLibrary).persistableIconId,
      autoSuggestion: editCardStrongIconSuggestion,
    });
    updateCardMutation.mutate(
      {
        id: editingCard.id,
        data: { ...editCardForm, iconeId: nextIconeId },
      },
      {
        onSuccess: () => {
          setEditingCard(null);
          setEditCardIcone(null);
          setEditCardIconPersistableId(null);
          setEditCardIconManualSelection(false);
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
        reembolsoModo: compraForm.pessoaId ? compraForm.reembolsoModo : null,
        reembolsoValorTotal: compraForm.pessoaId ? compraForm.reembolsoValorTotal : null,
        reembolsoPercentual: compraForm.pessoaId ? compraForm.reembolsoPercentual : null,
      },
      {
        onSuccess: () => {
          setOpenCompra(false);
          setCompraForm({
            descricao: "",
            valorTotal: "",
            parcelas: "1",
            dataCompra: "",
            pessoaId: "",
            reembolsoModo: "total",
            reembolsoValorTotal: "",
            reembolsoPercentual: "",
          });
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
    const resolvedPersistableIcon = resolvePersistableCompraIconId({
      iconDirty: editCompraIconDirty,
      editedDisplayIconId: editCompraIcone,
      explicitPersistableIconId: editCompraIconPersistableId,
      userIcons: userIconLibrary,
    });
    if (!resolvedPersistableIcon.ok) {
      toast({
        title: "Não foi possível salvar",
        description: "Não foi possível resolver uma referência válida do ícone selecionado. Selecione novamente em “Alterar ícone”.",
        variant: "destructive",
      });
      logDev("update-compra:icon-reference-invalid", {
        compraId: editingCompra.id,
        iconDirty: editCompraIconDirty,
        iconPreviewKind: editCompraIcone
          ? (editCompraIcone.startsWith("data:")
            ? "data_url"
            : (editCompraIcone.startsWith("http://") || editCompraIcone.startsWith("https://"))
              ? "remote_url"
              : "library_key")
          : "null",
      });
      return;
    }

    const iconRuleTarget = resolveEditCompraIconRuleTarget({
      applyRule: applyEditCompraIconRule,
      iconDirty: editCompraIconDirty,
      editedIconId: editCompraIcone,
      persistedIconId: editingCompra.iconeId ?? null,
    });
    const updateIconPatch = buildEditCompraIconUpdatePatch({
      iconDirty: editCompraIconDirty,
      editedIconId: resolvedPersistableIcon.value ?? null,
    });
    logDev("update-compra:start", {
      compraId: editingCompra.id,
      cartaoId: editingCompra.cartaoId,
      valorTotal: editCompraForm.valorTotal,
      parcelas: editCompraForm.parcelas,
      pessoaId: editCompraForm.pessoaId || null,
      hasIconOverride: editCompraIconDirty,
      iconPreviewKind: editCompraIconDirty
        ? (editCompraIcone
          ? (editCompraIcone.startsWith("data:")
          ? "data_url"
          : (editCompraIcone.startsWith("http://") || editCompraIcone.startsWith("https://"))
            ? "remote_url"
            : "library_key")
          : "null")
        : "unchanged",
      iconPersistableKind: editCompraIconDirty
        ? (resolvedPersistableIcon.value
          ? (resolvedPersistableIcon.value.startsWith("data:")
            ? "data_url"
            : (resolvedPersistableIcon.value.startsWith("http://") || resolvedPersistableIcon.value.startsWith("https://"))
              ? "remote_url"
              : "library_key")
          : "null")
        : "unchanged",
      iconPreviewLength: editCompraIconDirty ? (editCompraIcone?.length ?? 0) : 0,
      iconPersistableLength: editCompraIconDirty ? (resolvedPersistableIcon.value?.length ?? 0) : 0,
    });
    updateCompraMutation.mutate(
      {
        id: editingCompra.id,
        data: {
          ...editCompraForm,
          ...updateIconPatch,
          reembolsoModo: editCompraForm.pessoaId ? editCompraForm.reembolsoModo : null,
          reembolsoValorTotal: editCompraForm.pessoaId ? editCompraForm.reembolsoValorTotal : null,
          reembolsoPercentual: editCompraForm.pessoaId ? editCompraForm.reembolsoPercentual : null,
        },
      },
      {
        onSuccess: async () => {
          if (iconRuleTarget && editCompraForm.descricao.trim().length > 0) {
            try {
              await handleSaveCompraIconRule(editCompraForm.descricao, iconRuleTarget);
              toast({
                title: "Reconhecimento salvo",
                description: "Compras parecidas podem usar esse ícone automaticamente.",
              });
            } catch (error) {
              logDev("icon-match-rule:create-from-compra:error", {
                compraId: editingCompra.id,
                hasManualIcon: Boolean(iconRuleTarget),
                iconKind: iconRuleTarget.startsWith("data:")
                  ? "data_url"
                  : (iconRuleTarget.startsWith("http://") || iconRuleTarget.startsWith("https://"))
                    ? "remote_url"
                    : "library_key",
                message: error instanceof Error ? error.message : String(error),
              });
              toast({
                title: "Compra atualizada",
                description:
                  "Ícone salvo na compra, mas não foi possível salvar o reconhecimento automático agora. Você pode tentar novamente depois.",
              });
            }
          }
          setEditingCompra(null);
          setEditCompraIcone(null);
          setEditCompraIconDirty(false);
          setEditCompraIconPersistableId(undefined);
          setApplyEditCompraIconRule(false);
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

  const handleOpenInvoicePaymentDialog = (cartaoId: string) => {
    setInvoicePaymentTarget({
      cartaoId,
      monthReference: selectedInvoiceMonth,
    });
  };

  const handleRegisterInvoicePayment = (payload: {
    valorPago: string | number;
    dataPagamento: string;
    observacao?: string | null;
    modoAlocacao?: "ordem_fatura" | "menores_primeiro" | "maiores_primeiro" | "manual";
    aplicarRestanteAutomaticamente?: boolean;
    alocacoesManuais?: Array<{ parcelaCompraId: string; valorAplicado?: string | number }>;
  }) => {
    if (!invoicePaymentTarget || !selectedInvoicePaymentSnapshot) {
      toast({
        title: "Fatura indisponível",
        description: "Não foi possível localizar a fatura selecionada.",
        variant: "destructive",
      });
      return;
    }

    const valorSolicitado = parseMoney(payload.valorPago) ?? 0;
    const vaiQuitarFatura = valorSolicitado >= selectedInvoicePaymentSnapshot.remainingAmount;
    const faturaVencida =
      selectedInvoicePaymentSnapshot.status === "vencida"
      || selectedInvoicePaymentSnapshot.status === "vencida_parcialmente_paga";

    if (
      vaiQuitarFatura
      && faturaVencida
      && typeof window !== "undefined"
      && !window.confirm("Isso marcará todas as parcelas desta fatura como pagas. Deseja continuar?")
    ) {
      return;
    }

    registerInvoicePaymentMutation.mutate(
      {
        cartaoId: invoicePaymentTarget.cartaoId,
        monthReference: invoicePaymentTarget.monthReference,
        data: payload,
      },
      {
        onSuccess: (result) => {
          const pagamentoLimitado = result.valorAplicado < result.valorSolicitado;
          const titulo = result.saldoRestante <= 0
            ? "Fatura quitada"
            : result.statusFatura === "parcialmente_paga" || result.statusFatura === "vencida_parcialmente_paga"
              ? "Pagamento parcial registrado"
              : "Pagamento registrado";
          const descricaoBase = pagamentoLimitado
            ? `Pagamento aplicado até o saldo restante: ${formatCartaoCurrency(result.valorAplicado)}.`
            : `Pagamento aplicado: ${formatCartaoCurrency(result.valorAplicado)}.`;
          toast({
            title: titulo,
            description: `${descricaoBase} Saldo restante: ${formatCartaoCurrency(result.saldoRestante)}.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Erro ao registrar pagamento",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const cancelInvoicePaymentPendingId = cancelInvoicePaymentMutation.isPending
    ? (cancelInvoicePaymentMutation.variables?.pagamentoId ?? null)
    : null;

  const handleCancelInvoicePayment = (pagamentoId: string) => {
    if (!invoicePaymentTarget) {
      toast({
        title: "Pagamento indisponível",
        description: "Não foi possível localizar a fatura selecionada para desfazer o pagamento.",
        variant: "destructive",
      });
      return;
    }

    cancelInvoicePaymentMutation.mutate(
      {
        cartaoId: invoicePaymentTarget.cartaoId,
        monthReference: invoicePaymentTarget.monthReference,
        pagamentoId,
      },
      {
        onSuccess: (result) => {
          toast({
            title: "Pagamento desfeito com sucesso",
            description: `Saldo restante da fatura atualizado para ${formatCartaoCurrency(result.saldoRestante)}.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Não foi possível desfazer o pagamento",
            description: getErrorMessage(error),
            variant: "destructive",
          });
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

  const handleMoveParcelaCompetencia = async (id: string, competencia: string): Promise<void> => {
    setParcelaSubmittingId(id);
    try {
      await moveParcelaCompetenciaMutation.mutateAsync({ id, competencia });
      toast({
        title: "Fatura da parcela atualizada",
        description: `Competência ajustada para ${formatInvoiceCompetencyLabel(competencia)}.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao mover parcela de fatura",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      throw error;
    } finally {
      setParcelaSubmittingId((current) => (current === id ? null : current));
    }
  };

  const handleConfirmImport = async () => {
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

    if (importIssuerMismatchMustAcknowledge && !importIssuerMismatchAcknowledged) {
      toast({
        title: "Confirme o alerta de emissor antes de importar",
        description: "Marque que está ciente do cartão de destino para continuar.",
        variant: "destructive",
      });
      return;
    }

    const itemsForConfirm = importItems.map((item) => {
      if (item.reconcileAction !== "replace_existing") return item;
      return {
        ...item,
        action: "skip" as const,
        forceImport: false,
        serviceSuggestionAction: "ignore" as const,
        linkedServiceId: null,
        replaceExistingServiceLink: false,
        serviceAction: { type: "none" as const },
      };
    });
    const reconcileItems = itemsForConfirm.filter((item) => item.reconcileAction === "replace_existing");

    const reconcileItemsMissingTarget = reconcileItems.filter((item) => !item.reconcileExistingCompraCartaoId);
    if (reconcileItemsMissingTarget.length > 0) {
      toast({
        title: "Reconciliação incompleta",
        description: "Há itens para vincular/substituir sem compra existente selecionada.",
        variant: "destructive",
      });
      return;
    }

    const invalidSelectedItems = itemsForConfirm.filter((item) => (
      item.action === "import" && getImportItemEffectiveStatus(item) === "invalido"
    ));
    if (invalidSelectedItems.length > 0) {
      toast({
        title: "Itens inválidos não podem ser importados",
        description: "Revise os itens marcados como inválidos antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    const duplicateExactWithoutForce = itemsForConfirm.filter((item) => (
      item.action === "import"
      && getImportItemEffectiveStatus(item) === "duplicata_exata"
      && item.forceImport !== true
    ));
    if (duplicateExactWithoutForce.length > 0) {
      toast({
        title: "Duplicata exata exige confirmação explícita",
        description: "Marque a opção de forçar importação nos itens de duplicata exata.",
        variant: "destructive",
      });
      return;
    }

    const reconcileInvalidItems = reconcileItems.filter((item) => getImportItemEffectiveStatus(item) === "invalido");
    if (reconcileInvalidItems.length > 0) {
      toast({
        title: "Itens inválidos não podem ser reconciliados",
        description: "Revise os itens com vínculo/substituição antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    const reconcileDuplicateExactWithoutForce = reconcileItems.filter((item) => (
      getImportItemEffectiveStatus(item) === "duplicata_exata" && item.forceImport !== true
    ));
    if (reconcileDuplicateExactWithoutForce.length > 0) {
      toast({
        title: "Duplicata exata exige confirmação explícita",
        description: "Marque a opção de forçar importação nos itens de duplicata exata antes de reconciliar.",
        variant: "destructive",
      });
      return;
    }

    const reconcileMissingValueConfirmation = reconcileItems.filter((item) => {
      const existingCompraId = item.reconcileExistingCompraCartaoId;
      if (!existingCompraId) return true;
      const existingCompra = compras.find((compra) => compra.id === existingCompraId);
      if (!existingCompra) return true;
      const existingValorParcela = Number(existingCompra.valorParcela) || 0;
      const existingValorTotal = Number(existingCompra.valorTotal) || 0;
      const valueChanged = Math.abs(existingValorParcela - item.valorParcela) > 0.01
        || Math.abs(existingValorTotal - item.valor) > 0.01;
      if (!valueChanged) return false;
      return item.reconcileConfirmValueChange !== true;
    });
    if (reconcileMissingValueConfirmation.length > 0) {
      toast({
        title: "Confirme alteração de valor",
        description: "Há itens de vincular/substituir com diferença de valor sem confirmação explícita.",
        variant: "destructive",
      });
      return;
    }

    const missingLinkedServiceItems = itemsForConfirm.filter((item) => (
      item.action === "import"
      && item.serviceSuggestionAction === "link_existing"
      && !item.linkedServiceId
    ));
    if (missingLinkedServiceItems.length > 0) {
      toast({
        title: "Selecione o serviço para concluir o vínculo",
        description: "Há itens marcados para vincular serviço existente sem serviço selecionado.",
        variant: "destructive",
      });
      return;
    }

    const replaceNotConfirmedItems = itemsForConfirm.filter((item) => {
      if (item.action !== "import" || item.serviceSuggestionAction !== "link_existing" || !item.linkedServiceId) {
        return false;
      }
      const selectedService = servicos.find((servico) => servico.id === item.linkedServiceId);
      if (!selectedService?.compraCartaoId) return false;
      return item.replaceExistingServiceLink !== true;
    });
    if (replaceNotConfirmedItems.length > 0) {
      toast({
        title: "Confirme a substituição do vínculo",
        description: "Há serviços já vinculados a outra compra. Marque que deseja substituir o vínculo para continuar.",
        variant: "destructive",
      });
      return;
    }

    let reconcileAppliedCount = 0;
    try {
      if (reconcileItems.length > 0) {
        setIsReconcilingImport(true);
        for (const item of reconcileItems) {
          const existingCompraId = item.reconcileExistingCompraCartaoId;
          if (!existingCompraId) {
            throw new Error("Compra existente não encontrada para reconciliação.");
          }
          const existingCompra = compras.find((compra) => compra.id === existingCompraId);
          if (!existingCompra) {
            throw new Error("Compra existente não encontrada para reconciliação.");
          }
          const existingValorParcela = Number(existingCompra.valorParcela) || 0;
          const existingValorTotal = Number(existingCompra.valorTotal) || 0;
          const valueChanged = Math.abs(existingValorParcela - item.valorParcela) > 0.01
            || Math.abs(existingValorTotal - item.valor) > 0.01;

          await reconcileImportedPurchase({
            importLogId: importPreviewLogId ?? undefined,
            itemId: item.id,
            existingCompraCartaoId: existingCompraId,
            importItem: item,
            confirmValueChange: valueChanged ? item.reconcileConfirmValueChange === true : false,
            updateNameFromImport: item.reconcileUpdateNameFromImport === true,
          });
          reconcileAppliedCount += 1;
        }
        toast({
          title: "Reconciliação aplicada",
          description: `${reconcileItems.length} compra(s) existente(s) foram atualizadas sem criar duplicidade.`,
        });
      }

      const result = await batchImportMutation.mutateAsync({
        items: itemsForConfirm,
        cartaoId,
        previewLogId: importPreviewLogId,
        sourceType: importSourceType,
        sourceName: importSourceName || undefined,
      });

      const resultSummary = result.summary ?? {
        totalProcessed: result.createdCount + result.skippedCount,
        createdCount: result.createdCount,
        ignoredCount: result.skippedCount,
        blockedExactDuplicates: 0,
        forcedExactDuplicates: 0,
        invalidCount: 0,
        errorCount: 0,
        servicesCreatedCount: 0,
        servicesSkippedCount: 0,
        servicesLinkedCount: 0,
        servicesLinkSkippedCount: 0,
      };

      setLastImportLogId(result.importLogId);
      setImportConfirmResult({
        ...result,
        summary: {
          ...resultSummary,
          reconciledExistingCount: reconcileItems.length,
        },
      });
      setImportPreviewLogId(null);
      setImportItems([]);
      setImportTexto("");
      setImportVencimento("");
      setImportEditingId(null);
      setImportSourceType("manual");
      setImportSourceName("");
      setImportCartaoHint("");
      setRememberingCompraAliasByItemId({});
      setSavedCompraAliasByItemId({});
    } catch (error) {
      if (reconcileAppliedCount > 0) {
        void queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      }
      toast({ title: "Erro na importacao", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsReconcilingImport(false);
    }
  };

  const handleRememberCompraAlias = async (
    params: { item: ParsedItem; existingCompra: CompraCartao },
  ): Promise<void> => {
    const { item, existingCompra } = params;
    const itemId = item.id;
    setRememberingCompraAliasByItemId((current) => ({ ...current, [itemId]: true }));

    try {
      const aliasDraft = buildCompraAliasDraft(item, existingCompra);
      if (!aliasDraft.compraCartaoId || !aliasDraft.nomeImportado) {
        throw new Error("Dados da compra existente incompletos.");
      }
      if (IS_DEV) {
        logDev("compra-alias:payload:sanitized", {
          compraCartaoId: aliasDraft.compraCartaoId,
          hasCartaoId: Boolean(aliasDraft.cartaoId),
          issuer: aliasDraft.issuer,
          parserUsed: aliasDraft.parserUsed,
          hasCardLast4: Boolean(aliasDraft.cardLast4),
          hasValorParcela: aliasDraft.valorParcela != null,
          hasTotalParcelas: aliasDraft.totalParcelas != null,
        });
      }
      const response = await createCompraAlias(aliasDraft);

      setImportItems((currentItems) => currentItems.map((current) => {
        if (current.id !== itemId) return current;
        return {
          ...current,
          action: "skip",
          forceImport: false,
          reconcileAction: "none",
          reconcileExistingCompraCartaoId: existingCompra.id,
          reconcileConfirmValueChange: false,
          reconcileUpdateNameFromImport: false,
          serviceSuggestionAction: "ignore",
          linkedServiceId: null,
          replaceExistingServiceLink: false,
        };
      }));
      setSavedCompraAliasByItemId((current) => ({ ...current, [itemId]: true }));
      toast({
        title: response.reusedExisting
          ? "Equivalência já existente"
          : "Equivalência salva",
        description: "Equivalência salva. Este item foi marcado como Ignorar para evitar duplicidade.",
      });
    } catch (error) {
      const message = getErrorMessage(error);
      const isValidationError = /obrigatorio|inválid|incomplet|cart[aã]o inválido|não correspondem/i.test(message);
      toast({
        title: "Não foi possível salvar equivalência",
        description: isValidationError
          ? "Não foi possível salvar: dados da compra existente incompletos."
          : message,
        variant: "destructive",
      });
    } finally {
      setRememberingCompraAliasByItemId((current) => ({ ...current, [itemId]: false }));
    }
  };

  const requestRollbackConfirmation = (): boolean => {
    if (typeof window === "undefined") return true;
    return window.confirm(
      "Deseja desfazer esta importação? Compras do lote e vínculos de serviço associados poderão ser revertidos com segurança.",
    );
  };

  const handleRollbackImportById = (importLogId: string, options?: { requireConfirm?: boolean }) => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }
    const shouldConfirm = options?.requireConfirm !== false;
    if (shouldConfirm && !requestRollbackConfirmation()) {
      return;
    }

    setHistoryRollbackLogId(importLogId);

    rollbackImportMutation.mutate(importLogId, {
      onSuccess: (result) => {
        if (lastImportLogId === importLogId) {
          setLastImportLogId(null);
        }
        setImportConfirmResult((current) => (
          current?.importLogId === importLogId ? null : current
        ));
        const servicesRemoved = result.servicesRemovedCount ?? 0;
        const servicesUnlinked = result.servicesUnlinkedCount ?? 0;
        const servicesRestored = result.servicesRestoredCount ?? 0;
        const warnings = result.serviceRollbackWarnings ?? [];
        toast({
          title: "Importação desfeita com sucesso.",
          description: [
            `${result.deletedCount} compra(s) removida(s) do lote ${result.importLogId.slice(0, 8)}.`,
            `Serviços removidos: ${servicesRemoved}.`,
            `Serviços desvinculados: ${servicesUnlinked}.`,
            `Vínculos restaurados: ${servicesRestored}.`,
          ].join(" "),
        });
        if (warnings.length > 0) {
          toast({
            title: "Rollback concluído com avisos",
            description: "Alguns vínculos/ajustes não foram restaurados automaticamente por segurança. Revise manualmente os itens sinalizados.",
            variant: "default",
          });
        }
      },
      onError: (error) => {
        toast({
          title: "Não foi possível desfazer a importação",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      },
      onSettled: () => {
        setHistoryRollbackLogId((current) => (current === importLogId ? null : current));
      },
    });
  };

  const handleRollbackLastImport = () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    if (!lastImportLogId) return;

    handleRollbackImportById(lastImportLogId);
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
      setImportConfirmResult(null);
      try {
      const result = parseCsv(importTexto, compras, cartaoId, {
        referenceBillingDate: importVencimento || undefined,
      });
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

      const mergedItems = mergePreviewItemsWithLocalSignals(preview.items, result.items, servicos);

      setImportItems(mergedItems);
      setImportEditingId(null);
      setImportPreviewLogId(preview.importLogId);
      setImportSourceType("texto");
      setImportSourceName("texto-livre");
      setImportIssuerMismatchWarning("");
      setImportIssuerMismatchMustAcknowledge(false);
      setImportIssuerMismatchAcknowledged(false);

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
    const nextItems = importItems.map((item) => {
      if (item.id !== importEditingId) return item;

      const nextItem: ParsedItem = {
        ...item,
        descricao: importEditForm.descricao || item.descricao,
        valor: vp > 0 ? vt : item.valor,
        valorParcela: vp > 0 ? vp : item.valorParcela,
        parcelas: p,
        parcelaAtual: pa,
        parcelasRestantes: Math.max(p - pa + 1, 0),
        dataCompra: importEditForm.dataCompra || item.dataCompra,
        vencimentoFatura: importEditForm.vencimentoFatura || null,
      };
      const nextStatus = getImportItemEffectiveStatus(nextItem);
      const validationIssues = isImportItemStructurallyInvalid(nextItem)
        ? ["Item requer revisão após edição."]
        : [];
      const canImport = nextStatus !== "invalido";

      const recurringServiceCandidate = detectRecurringServiceCandidate(nextItem.descricao);
      const createServiceSuggestion = recurringServiceCandidate.isServiceCandidate
        ? {
          nome: recurringServiceCandidate.matchedProvider ?? nextItem.descricao,
          valorMensal: nextItem.valorParcela,
          dataCobranca: Number((nextItem.vencimentoFatura ?? nextItem.dataCompra).slice(-2)) || 1,
          categoria: recurringServiceCandidate.categorySuggestion ?? "outro",
        }
        : null;

      return {
        ...nextItem,
        status: nextStatus,
        canImport,
        reviewRequired: nextStatus !== "novo",
        validationIssues,
        forceImport: nextStatus === "duplicata_exata" ? (nextItem.forceImport === true) : false,
        action: canImport ? nextItem.action : "skip",
        recurringServiceCandidate,
        createServiceSuggestion,
        serviceSuggestionAction: recurringServiceCandidate.isServiceCandidate
          ? (item.serviceSuggestionAction ?? "ignore")
          : "ignore",
        linkedServiceId: recurringServiceCandidate.isServiceCandidate ? item.linkedServiceId ?? null : null,
        replaceExistingServiceLink: recurringServiceCandidate.isServiceCandidate
          ? item.replaceExistingServiceLink === true
          : false,
        serviceSuggestionWarning: null,
      };
    });
    setImportItems(applyServiceSuggestionMetadata(nextItems, servicos));
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

    const extension = getImportFileExtension(file.name);
    if (!extension || !IMPORT_ALLOWED_EXTENSIONS.has(extension)) {
      toast({
        title: "Arquivo não suportado",
        description: "Use arquivos .csv, .ofx, .qfx, .txt ou .pdf (texto).",
        variant: "destructive",
      });
      return;
    }

    if (file.size <= 0) {
      toast({
        title: "Arquivo vazio",
        description: "Selecione um arquivo com conteúdo para continuar.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > IMPORT_FILE_MAX_SIZE_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: `Limite de ${formatImportFileSize(IMPORT_FILE_MAX_SIZE_BYTES)} por arquivo.`,
        variant: "destructive",
      });
      return;
    }

    if (!isImportMimeAllowed(extension, file.type ?? "")) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "O tipo do arquivo não corresponde à extensão informada.",
        variant: "destructive",
      });
      return;
    }

    setImportLoading(true);
    setImportConfirmResult(null);
    try {
      let content = "";
      let pdfSignalText = "";
      let pdfPlainFallbackText = "";
      let pdfIssuerHint: "itau" | "mercado_pago" | undefined;
      const debugImportPdf = isImportPdfDebugEnabled();
      if (extension === "pdf") {
        const pdfBuffer = await file.arrayBuffer();
        const extractedPdf = await extractPdfTextVariantsFromPdfBuffer(pdfBuffer);
        const combinedPdfText = [extractedPdf.plainText, extractedPdf.positionalText]
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .join("\n");

        if (!isExtractedPdfTextUsable(combinedPdfText)) {
          toast({
            title: "PDF sem texto extraível",
            description: "Este PDF parece ser imagem/escaneado. A importação por imagem será liberada em uma etapa futura.",
            variant: "destructive",
          });
          setImportItems([]);
          setImportPreviewLogId(null);
          return;
        }

        pdfSignalText = combinedPdfText;
        pdfPlainFallbackText = extractedPdf.plainText || combinedPdfText;
        const itauDetectedFromSignals = detectItauInvoiceText(combinedPdfText);
        const mercadoPagoDetectedFromSignals = detectMercadoPagoInvoiceText(combinedPdfText);
        if (debugImportPdf && typeof console !== "undefined") {
          const detectedIssuer = itauDetectedFromSignals
            ? "itau"
            : mercadoPagoDetectedFromSignals
              ? "mercado_pago"
              : "unknown";
          console.info("[import-itau][debug] issuer.detected", detectedIssuer);
        }
        if (itauDetectedFromSignals) {
          if (debugImportPdf) {
            logItauImportDebugSnapshot({
              fileName: file.name,
              plainText: extractedPdf.plainText,
              positionalText: extractedPdf.positionalText,
              mergedSignalText: combinedPdfText,
            });
          }
          pdfIssuerHint = "itau";
          content = extractedPdf.positionalText || extractedPdf.plainText;
        } else if (mercadoPagoDetectedFromSignals) {
          pdfIssuerHint = "mercado_pago";
          content = extractedPdf.positionalText || extractedPdf.plainText;
        } else {
          content = extractedPdf.plainText || extractedPdf.positionalText;
        }
      } else {
        content = await file.text();
      }

      const detectionContent = extension === "pdf" && pdfSignalText ? pdfSignalText : content;
      const cartaoId = resolveImportCartaoId(`${file.name}\n${detectionContent}`);
      if (!cartaoId) {
        toast({ title: "Selecione um cartao para importar", variant: "destructive" });
        return;
      }
      let result: ParseResult;
      const name = file.name.toLowerCase();
      let sourceType: "csv" | "ofx" | "qfx" | "texto" | "pdf";
      if (name.endsWith(".ofx")) {
        result = parseOfx(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "ofx";
      } else if (name.endsWith(".qfx")) {
        result = parseOfx(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "qfx";
      } else if (name.endsWith(".txt")) {
        result = parseCsv(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "texto";
      } else if (name.endsWith(".pdf")) {
        const selectedCard = cartoes.find((item) => item.id === cartaoId);
        result = parsePdf(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
          selectedCardName: selectedCard?.nome ?? "",
          issuerHint: pdfIssuerHint,
          debugImportPdf,
          itauFallbackContent: pdfPlainFallbackText,
        });
        sourceType = "pdf";
      } else {
        result = parseCsv(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "csv";
      }
      const venc = findVencimentoFatura(detectionContent);
      if (venc) setImportVencimento(venc);
      const ignoredDetails = buildIgnoredDetails(result.stats);
      const hasIgnoredRows = countIgnoredRows(result.stats) > 0;
      const parserWarning = result.parserWarnings?.[0] ?? "";
      if (result.items.length === 0) {
        toast({
          title: "Nenhuma compra detectada no arquivo.",
          description: parserWarning
            ? `${parserWarning}${ignoredDetails ? ` ${ignoredDetails}` : ""}`
            : ignoredDetails,
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

      const mergedItems = mergePreviewItemsWithLocalSignals(preview.items, result.items, servicos);

      setImportItems(mergedItems);
      setImportEditingId(null);
      setImportPreviewLogId(preview.importLogId);
      setImportSourceType(sourceType);
      setImportSourceName(file.name);
      if (sourceType === "pdf") {
        applyPdfIssuerMismatchGuard(`${file.name}\n${detectionContent}`, cartaoId, mergedItems);
      } else {
        setImportIssuerMismatchWarning("");
        setImportIssuerMismatchMustAcknowledge(false);
        setImportIssuerMismatchAcknowledged(false);
      }

      toast({
        title: `${preview.summary.importItems} item(ns) pronto(s) para importar`,
        description:
          `Confianca media ${Math.round(preview.summary.averageConfidence)}%. ` +
          `${preview.summary.reviewItems} item(ns) requer(em) revisao.` +
          (hasIgnoredRows && ignoredDetails ? ` ${ignoredDetails}` : ""),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const normalizedMessage = errorMessage.toLowerCase();
      const isPdfSignatureError = extension === "pdf" && error instanceof Error && error.message === "INVALID_PDF_SIGNATURE";
      const isPdfParsingError = extension === "pdf" && (
        normalizedMessage.includes("invalidpdf")
        || normalizedMessage.includes("unexpectedresponse")
        || normalizedMessage.includes("formaterror")
        || normalizedMessage.includes("malformed")
      );

      toast({
        title: "Erro ao ler arquivo",
        description: isPdfSignatureError
          ? "Arquivo PDF inválido ou corrompido."
          : isPdfParsingError
            ? "Não foi possível ler este PDF. Envie um PDF textual válido."
            : errorMessage,
        variant: "destructive",
      });
      setImportPreviewLogId(null);
      setImportIssuerMismatchWarning("");
      setImportIssuerMismatchMustAcknowledge(false);
      setImportIssuerMismatchAcknowledged(false);
    } finally { setImportLoading(false); }
  };

  const showCompraSearch = activeCartoesTab === "compras";
  const cartoesInsightsItems = buildCartoesInsightsItems({
    cartoes,
    compras,
    getCardUsedLimit,
    getCardAvailableLimit,
  });
  const handleEditCartaoFromFatura = (cartao: Cartao) => {
    const resolvedIcon = resolveEntityIconReference(cartao.iconeId ?? null, userIconLibrary);
    setEditingCard(cartao);
    setEditCardForm({
      nome: cartao.nome,
      limite: String(cartao.limite),
      melhorDiaCompra: String(cartao.melhorDiaCompra),
      diaVencimento: String(cartao.diaVencimento),
    });
    setEditCardIcone(resolvedIcon.displayIconId);
    setEditCardIconPersistableId(resolvedIcon.persistableIconId);
    setEditCardIconManualSelection(Boolean(cartao.iconeId));
  };
  const handleAddCompraFromFatura = (cartaoId: string) => {
    setSelectedCartao(cartaoId);
    setOpenCompra(true);
  };
  const handleEditCompraFromFatura = (compra: CompraCartao) => {
    setEditingCompra(compra);
    setEditCompraIcone(compra.iconeId ?? null);
    setEditCompraIconDirty(false);
    setEditCompraIconPersistableId(undefined);
    setApplyEditCompraIconRule(false);
    setEditCompraForm({
      descricao: compra.descricao,
      valorTotal: String(compra.valorTotal),
      parcelas: String(compra.parcelas),
      pessoaId: compra.pessoaId ?? "",
      statusPessoa: compra.statusPessoa ?? "pendente",
      reembolsoModo: (compra.reembolsoModo as "total" | "metade" | "valor_custom" | "percentual_custom" | null | undefined) ?? "total",
      reembolsoValorTotal: compra.reembolsoValorTotal ? String(compra.reembolsoValorTotal) : "",
      reembolsoPercentual: compra.reembolsoPercentual ? String(compra.reembolsoPercentual) : "",
    });
  };
  const handleMarcarReembolsoFromFatura = (compraId: string) => {
    handleMarcarReembolso(compraId, true);
  };
  if (isLoading) {
    return <CartoesPageLoadingState />;
  }

  return (
    <div className="app-page-shell app-section-stack" data-testid="cartoes-page">
      <CartoesPageToolbar
        smartImportLiberado={smartImportLiberado}
        cartoesCount={cartoes.length}
        lastImportLogId={lastImportLogId}
        rollbackImportPending={rollbackImportMutation.isPending}
        onOpenImportDialog={openImportDialog}
        onOpenDeleteFaturaDialog={handleOpenDeleteFaturaDialog}
        onRollbackLastImport={handleRollbackLastImport}
        onOpenNewCardDialog={() => setOpenCard(true)}
      />

      <CartoesSummarySection
        hasCartoes={cartoes.length > 0}
        totalFaturas={totalFaturasForSelectedMonth}
        totalAguardandoReembolso={totalAguardandoReembolso}
        formatCurrency={formatCartaoCurrency}
        showInsights={false}
        insights={<CartoesInsights items={cartoesInsightsItems} />}
        filterBar={(
          <CartoesFilterBar
            cartoesTab={activeCartoesTab}
            onTabChange={handleCartoesTabChange}
            compraSearch={compraSearch}
            onCompraSearchChange={setCompraSearch}
            showSearch={showCompraSearch}
            invoiceMonth={selectedInvoiceMonth}
            invoiceMonthOptions={invoiceMonthOptions}
            currentInvoiceMonth={currentInvoiceMonthReference}
            onInvoiceMonthChange={setSelectedInvoiceMonth}
          />
        )}
      />

      <NewCompraDialog
        openCompra={openCompra}
        setOpenCompra={setOpenCompra}
        compraForm={compraForm}
        setCompraForm={setCompraForm}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        onCreateCompra={handleCreateCompra}
        createCompraPending={createCompraMutation.isPending}
      />

      <CartaoCreateEditDialogs
        openCard={openCard}
        setOpenCard={setOpenCard}
        cardForm={cardForm}
        setCardForm={setCardForm}
        newCardPreviewIconId={newCardPreviewIconId}
        setNewCardIcone={setNewCardIcone}
        setNewCardIconPersistableId={setNewCardIconPersistableId}
        setNewCardIconManualSelection={setNewCardIconManualSelection}
        newCardIconManualSelection={newCardIconManualSelection}
        newCardStrongIconSuggestion={newCardStrongIconSuggestion}
        showNewCardMediumSuggestion={showNewCardMediumSuggestion}
        onCreateCard={handleCreateCard}
        createCardPending={createCardMutation.isPending}
        editingCard={editingCard}
        setEditingCard={setEditingCard}
        editCardForm={editCardForm}
        setEditCardForm={setEditCardForm}
        editCardPreviewIconId={editCardPreviewIconId}
        setEditCardIcone={setEditCardIcone}
        setEditCardIconPersistableId={setEditCardIconPersistableId}
        setEditCardIconManualSelection={setEditCardIconManualSelection}
        editCardIconManualSelection={editCardIconManualSelection}
        editCardStrongIconSuggestion={editCardStrongIconSuggestion}
        showEditCardMediumSuggestion={showEditCardMediumSuggestion}
        onUpdateCard={handleUpdateCard}
        updateCardPending={updateCardMutation.isPending}
      />

      <EditCompraDialog
        editingCompra={editingCompra}
        setEditingCompra={setEditingCompra}
        editCompraForm={editCompraForm}
        setEditCompraForm={setEditCompraForm}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        editCompraIconPreviewId={editCompraIconPreviewId}
        editCompraIconPreviewLabel={editCompraIconPreviewLabel}
        editCompraIconPreviewHint={editCompraIconPreviewHint}
        applyEditCompraIconRule={applyEditCompraIconRule}
        setApplyEditCompraIconRule={setApplyEditCompraIconRule}
        setEditCompraIconDirty={setEditCompraIconDirty}
        setEditCompraIcone={setEditCompraIcone}
        setEditCompraIconPersistableId={setEditCompraIconPersistableId}
        onUpdateCompra={handleUpdateCompra}
        updateCompraPending={updateCompraMutation.isPending}
      />

      <DeleteCompraFaturaDialogs
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

      <CartaoFaturaPaymentDialog
        open={!!invoicePaymentTarget}
        onOpenChange={(open) => {
          if (!open) {
            setInvoicePaymentTarget(null);
          }
        }}
        cartao={selectedInvoicePaymentCartao}
        monthReference={invoicePaymentTarget?.monthReference ?? selectedInvoiceMonth}
        snapshot={selectedInvoicePaymentSnapshot}
        payments={selectedInvoicePaymentHistory}
        installments={selectedInvoiceInstallments}
        isPending={registerInvoicePaymentMutation.isPending}
        cancelPendingPaymentId={cancelInvoicePaymentPendingId}
        formatCurrency={formatCartaoCurrency}
        formatMonthLabel={formatInvoiceCompetencyLabel}
        onSubmit={handleRegisterInvoicePayment}
        onCancelPayment={handleCancelInvoicePayment}
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
        parcelasLoading={!!viewingCompra && isParcelasCompraLoading}
        parcelasErrorMessage={
          viewingCompra && isParcelasCompraError
            ? getErrorMessage(parcelasCompraError)
            : null
        }
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
        onMoveParcelaCompetencia={handleMoveParcelaCompetencia}
        onPayParcela={handlePayParcela}
        onPayParcelaPessoa={handlePayParcelaPessoa}
        parcelaActionLoadingId={parcelaSubmittingId}
        isParcelaActionPending={
          payParcelaMutation.isPending
          || editParcelaMutation.isPending
          || moveParcelaCompetenciaMutation.isPending
        }
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
        onDeleteParcelaComprovante={async (parcelaId) => {
          await deleteParcelaComprovanteMutation.mutateAsync({ parcelaId });
        }}
        comprovanteDeleteLoadingId={comprovanteDeleteParcelaId}
        cartaoFaturaPagamentos={cartaoFaturaPagamentos}
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
            setImportIssuerMismatchWarning("");
            setImportIssuerMismatchMustAcknowledge(false);
            setImportIssuerMismatchAcknowledged(false);
            setImportConfirmResult(null);
            setRememberingCompraAliasByItemId({});
            setSavedCompraAliasByItemId({});
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
        compras={compras}
        importCartaoId={importCartaoId}
        setImportCartaoId={handleImportCartaoChange}
        servicos={servicos}
        servicoPessoas={servicoPessoas}
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
        isBatchImportPending={batchImportMutation.isPending || isReconcilingImport}
        issuerMismatchWarning={importIssuerMismatchWarning}
        issuerMismatchRequiresAcknowledgement={importIssuerMismatchMustAcknowledge}
        issuerMismatchAcknowledged={importIssuerMismatchAcknowledged}
        onIssuerMismatchAcknowledgedChange={setImportIssuerMismatchAcknowledged}
        onConfirmImport={handleConfirmImport}
        confirmResult={importConfirmResult}
        onRollbackImport={
          importConfirmResult
            ? () => handleRollbackImportById(importConfirmResult.importLogId)
            : undefined
        }
        isRollbackPending={rollbackImportMutation.isPending && !!historyRollbackLogId}
        importLogs={importLogs}
        isImportLogsLoading={isImportLogsLoading}
        rollbackImportLogLoadingId={historyRollbackLogId}
        onRollbackImportLog={(importLogId) => handleRollbackImportById(importLogId)}
        onRememberCompraAlias={handleRememberCompraAlias}
        rememberingCompraAliasByItemId={rememberingCompraAliasByItemId}
        savedCompraAliasByItemId={savedCompraAliasByItemId}
        compraAliases={compraAliases}
        isCompraAliasesLoading={isCompraAliasesLoading}
        onStartNewImport={() => {
          setImportConfirmResult(null);
          setImportItems([]);
          setImportPreviewLogId(null);
          setImportTexto("");
          setImportVencimento("");
          setImportEditingId(null);
          setImportSourceType("manual");
          setImportSourceName("");
          setImportCartaoHint("");
          setImportIssuerMismatchWarning("");
          setImportIssuerMismatchMustAcknowledge(false);
          setImportIssuerMismatchAcknowledged(false);
          setRememberingCompraAliasByItemId({});
          setSavedCompraAliasByItemId({});
        }}
      />

      <CartoesListSection
        activeCartoesTab={activeCartoesTab}
        cartoes={cartoes}
        getCardTotal={getCardTotalForSelectedMonth}
        getCardUsedLimit={getCardUsedLimit}
        getCardAvailableLimit={getCardAvailableLimit}
        getCardCompras={getCardCompras}
        formatCartaoCurrency={formatCartaoCurrency}
        onOpenCompras={(cartaoId) => {
          setCartoesTab("compras");
          setSelectedCartao(cartaoId);
          setComprasCartaoFocadoId(cartaoId);
        }}
        resolveCardIconId={resolveCardAutoIconId}
      />

      <CartaoFaturaSection
        activeCartoesTab={activeCartoesTab}
        cartoes={cartoes}
        mobileMode={prefs.mobileMode}
        selectedCartao={selectedCartao}
        setSelectedCartao={setSelectedCartao}
        setOpenCompra={setOpenCompra}
        totalFaturasForSelectedMonth={totalFaturasForSelectedMonth}
        formatCartaoCurrency={formatCartaoCurrency}
        getCardTotalForSelectedMonth={getCardTotalForSelectedMonth}
        getCardUsedLimit={getCardUsedLimit}
        getCardAvailableLimit={getCardAvailableLimit}
        getFilteredCardFaturaCompras={getFilteredCardFaturaCompras}
        getCompraParcelas={getCompraParcelas}
        getCompraInvoicePaymentStatus={getCompraInvoicePaymentStatus}
        selectedInvoiceMonthLabel={selectedInvoiceMonthLabel}
        servicos={servicos}
        pessoas={pessoas}
        onOpenParcelas={setViewingCompra}
        onDeleteCompra={openDeleteCompraConfirm}
        onEditCompra={handleEditCompraFromFatura}
        onMarcarReembolso={handleMarcarReembolsoFromFatura}
        onSaveCompraIconRule={handleSaveCompraIconRule}
        resolveCompraIconSuggestion={resolveCompraIconSuggestion}
        resolveCardIconId={resolveCardAutoIconId}
        comprasCartaoFocadoId={comprasCartaoFocadoId}
        onEditCartao={handleEditCartaoFromFatura}
        onDeleteCartao={handleDeleteCard}
        onAddCompra={handleAddCompraFromFatura}
        canOpenInvoicePaymentDialog={canOpenInvoicePaymentDialog}
        getInvoicePaymentActionLabel={getInvoicePaymentActionLabel}
        onOpenInvoicePaymentDialog={handleOpenInvoicePaymentDialog}
        getDaysUntilInvoice={getDaysUntilInvoice}
        getNextInvoiceDate={getNextInvoiceDate}
      />
    </div>
  );
}






