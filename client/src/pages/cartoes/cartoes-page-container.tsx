import { useState, lazy, Suspense, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { usePremiumAccess } from "@/hooks/use-premium-access";
import { useLocation } from "wouter";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, CreditCard, Trash2, CalendarClock, ShoppingBag, User, Pencil,
  RefreshCw, Upload, List, Check, X, ChevronRight, Search,
  Eye, Wallet,
} from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Cartao, CompraCartao, ParcelaCompra } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildIgnoredDetails, countIgnoredRows, findVencimentoFatura, parseCsv, parseOfx, type ParseResult, type ParsedItem } from "@/pages/cartoes/import-parser";
import { ImportFaturaDialog } from "@/pages/cartoes/components/import-fatura-dialog";
import { formatImportCardOptionLabel, suggestImportCardByText } from "@/pages/cartoes/import-card-matching";
import { useCartoes } from "@/hooks/useCartoes";
import { CartoesSummaryCards } from "@/pages/cartoes/components/cartoes-summary-cards";
import {
  deleteCompraCartaoComEscopo,
  previewImportCompras,
  type DeleteCompraScope,
  type DeleteCompraResponse,
  type DeleteFaturaResponse,
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
  const [cartoesTab, setCartoesTab] = useState<"resumo" | "fatura" | "compras" | "parcelas" | "limite">("resumo");
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

  const [openDeleteCompraDialog, setOpenDeleteCompraDialog] = useState(false);
  const [deleteCompraTarget, setDeleteCompraTarget] = useState<CompraCartao | null>(null);
  const [deleteCompraScope, setDeleteCompraScope] = useState<DeleteCompraScope>("all_parcelas");
  const [deleteCompraImpact, setDeleteCompraImpact] = useState<DeleteCompraResponse | null>(null);
  const [deleteCompraImpactLoading, setDeleteCompraImpactLoading] = useState(false);
  const [deleteCompraImpactError, setDeleteCompraImpactError] = useState<string | null>(null);
  const [deleteCompraSubmitting, setDeleteCompraSubmitting] = useState(false);

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
    if (!compraId) return;

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
      try {
        const response = deleteFaturaScope === "cartao"
          ? await deleteFaturaCartaoMutation.mutateAsync({
            cartaoId: deleteFaturaCartaoId,
            mes: deleteFaturaMes,
            dryRun: true,
          })
          : await deleteFaturasMesMutation.mutateAsync({
            mes: deleteFaturaMes,
            dryRun: true,
          });
        if (active) {
          setDeleteFaturaImpact(response);
        }
      } catch (error) {
        if (active) {
          setDeleteFaturaImpact(null);
          toast({
            title: "Erro ao calcular impacto",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        }
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
    deleteFaturaCartaoMutation,
    deleteFaturasMesMutation,
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
    updateCompraMutation.mutate(
      {
        id: editingCompra.id,
        data: editCompraForm,
      },
      {
        onSuccess: () => {
          setEditingCompra(null);
          toast({ title: "Compra atualizada" });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
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

    const mutation = deleteFaturaScope === "cartao"
      ? deleteFaturaCartaoMutation.mutateAsync({
        cartaoId: deleteFaturaCartaoId,
        mes: deleteFaturaMes,
      })
      : deleteFaturasMesMutation.mutateAsync({ mes: deleteFaturaMes });

    void mutation.then((response) => {
      setOpenDeleteFaturaDialog(false);
      setDeleteFaturaImpact(null);
      toast({
        title: "Fatura excluída com sucesso",
        description: `${response.impact.comprasRemovidas} compra(s) e ${response.impact.parcelasRemovidas} parcela(s) removidas.`,
      });
    }).catch((error) => {
      toast({
        title: "Erro ao excluir fatura",
        description: getErrorMessage(error),
        variant: "destructive",
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
    payParcelaMutation.mutate(
      { id, pago, dataPagamento },
      {
        onSuccess: () => {
          setPayingParcelaId(null);
          toast({ title: "Status da parcela atualizado" });
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
      <div className="fintech-surface border-border/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cartoes de Credito</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Gerencie seus cartoes e compras parceladas</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:items-center xl:justify-end">
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:col-span-2 md:flex-row md:items-center xl:col-span-1">
              <Button
                variant="outline"
                onClick={openImportDialog}
                className="min-w-0 flex-1 justify-start text-left whitespace-normal break-words touch-feedback sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
                data-testid="button-importar-fatura"
              >
                <Upload className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="leading-tight">
                  {smartImportLiberado ? "Importar Fatura" : "Importação inteligente (Premium)"}
                </span>
              </Button>
              {!smartImportLiberado && (
                <Badge
                  variant="secondary"
                  className="w-fit shrink-0 whitespace-nowrap self-start sm:self-auto"
                  data-testid="badge-smart-import-premium"
                >
                  Premium
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteFaturaScope("cartao");
                setDeleteFaturaMes(format(new Date(), "yyyy-MM"));
                setDeleteFaturaImpact(null);
                setOpenDeleteFaturaDialog(true);
              }}
              disabled={cartoes.length === 0}
              className="min-w-0 w-full justify-start text-left whitespace-normal break-words touch-feedback sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
              data-testid="button-excluir-fatura"
            >
              <Trash2 className="w-4 h-4 mr-2 flex-shrink-0" />
              Excluir fatura
            </Button>
            {smartImportLiberado && lastImportLogId && (
              <Button
                variant="outline"
                className="min-w-0 w-full justify-start text-left whitespace-normal break-words touch-feedback sm:col-span-2 sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
                onClick={handleRollbackLastImport}
                disabled={rollbackImportMutation.isPending}
                data-testid="button-rollback-import"
              >
                <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0" />
                {rollbackImportMutation.isPending ? "Revertendo..." : "Desfazer Ultima Importacao"}
              </Button>
            )}
            <Dialog open={openCard} onOpenChange={setOpenCard}>
              <DialogTrigger asChild>
                <Button
                  className="w-full touch-feedback sm:col-span-2 xl:w-auto xl:flex-none"
                  data-testid="button-add-cartao"
                >
                  <Plus className="w-4 h-4 mr-2" /> Novo cartao
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo Cartao</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); handleCreateCard(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Icone</Label>
                    <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                      <IconPicker value={newCardIcone} name={cardForm.nome} onChange={setNewCardIcone} size="md" />
                    </Suspense>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do cartao</Label>
                    <Input data-testid="input-cartao-nome" value={cardForm.nome}
                      onChange={(e) => setCardForm({ ...cardForm, nome: e.target.value })} placeholder="Ex: Nubank, Itau..." required />
                  </div>
                  <div className="space-y-2">
                    <Label>Limite total</Label>
                    <Input data-testid="input-cartao-limite" type="number" step="0.01" value={cardForm.limite}
                      onChange={(e) => setCardForm({ ...cardForm, limite: e.target.value })} placeholder="0,00" required />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Melhor dia de compra</Label>
                      <Input data-testid="input-cartao-melhordia" type="number" min="1" max="31" value={cardForm.melhorDiaCompra}
                        onChange={(e) => setCardForm({ ...cardForm, melhorDiaCompra: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Dia de vencimento</Label>
                      <Input data-testid="input-cartao-vencimento" type="number" min="1" max="31" value={cardForm.diaVencimento}
                        onChange={(e) => setCardForm({ ...cardForm, diaVencimento: e.target.value })} required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full touch-feedback" data-testid="button-save-cartao" disabled={createCardMutation.isPending}>
                    {createCardMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {cartoes.length > 0 && (
        <CartoesSummaryCards
          totalFaturas={totalFaturas}
          totalAguardandoReembolso={totalAguardandoReembolso}
          formatCurrency={formatCartaoCurrency}
        />
      )}

      {cartoes.length > 0 && (
        <div className="space-y-3">
          <Tabs value={cartoesTab} onValueChange={(value) => setCartoesTab(value as typeof cartoesTab)}>
            <TabsList className="mobile-tabs-scroll w-full justify-start bg-muted/30">
              <TabsTrigger value="resumo" data-testid="tab-cartoes-resumo">Resumo</TabsTrigger>
              <TabsTrigger value="fatura" data-testid="tab-cartoes-fatura">Fatura atual</TabsTrigger>
              <TabsTrigger value="compras" data-testid="tab-cartoes-compras">Compras</TabsTrigger>
              <TabsTrigger value="parcelas" data-testid="tab-cartoes-parcelas">Parcelas</TabsTrigger>
              <TabsTrigger value="limite" data-testid="tab-cartoes-limite">Limite</TabsTrigger>
            </TabsList>
          </Tabs>

          {(cartoesTab === "compras" || cartoesTab === "fatura" || cartoesTab === "parcelas") && (
            <div className="relative w-full max-w-md min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={compraSearch}
                onChange={(event) => setCompraSearch(event.target.value)}
                placeholder="Buscar compra, cartão, valor ou data"
                className="pl-9"
                data-testid="input-cartoes-busca-compras"
              />
            </div>
          )}
        </div>
      )}

      <Dialog open={openCompra} onOpenChange={setOpenCompra}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Compra Parcelada</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateCompra(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input data-testid="input-compra-descricao" value={compraForm.descricao}
                onChange={(e) => setCompraForm({ ...compraForm, descricao: e.target.value })} placeholder="O que comprou?" required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor total</Label>
                <Input data-testid="input-compra-valor" type="number" step="0.01" value={compraForm.valorTotal}
                  onChange={(e) => setCompraForm({ ...compraForm, valorTotal: e.target.value })} placeholder="0,00" required />
              </div>
              <div className="space-y-2">
                <Label>Parcelas</Label>
                <Input data-testid="input-compra-parcelas" type="number" min="1" max="48" value={compraForm.parcelas}
                  onChange={(e) => setCompraForm({ ...compraForm, parcelas: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data da compra</Label>
              <Input data-testid="input-compra-data" type="date" value={compraForm.dataCompra}
                onChange={(e) => setCompraForm({ ...compraForm, dataCompra: e.target.value })} required />
            </div>
            {pessoas.length > 0 && (
              <div className="space-y-2">
                <Label>Vincular a uma pessoa (opcional)</Label>
                <Select value={compraForm.pessoaId || "__none__"}
                  onValueChange={(v) => setCompraForm({ ...compraForm, pessoaId: v === "__none__" ? "" : v })}>
                  <SelectTrigger data-testid="select-compra-pessoa"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma (compra propria)</SelectItem>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {compraForm.valorTotal && compraForm.parcelas && (
              <div className="p-3 rounded-md bg-muted/50">
                <p className="text-sm">
                  <span className="text-muted-foreground">Parcela: </span>
                  <span className="font-semibold">{formatCartaoCurrency(parseFloat(compraForm.valorTotal) / parseInt(compraForm.parcelas || "1"))}</span>
                  <span className="text-muted-foreground"> x {compraForm.parcelas}x</span>
                </p>
              </div>
            )}
            <Button type="submit" className="w-full" data-testid="button-save-compra" disabled={createCompraMutation.isPending}>
              {createCompraMutation.isPending ? "Salvando..." : "Registrar compra"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCard} onOpenChange={(v) => { if (!v) { setEditingCard(null); setEditCardIcone(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Cartao</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateCard(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Ícone</Label>
              <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                <IconPicker value={editCardIcone} name={editCardForm.nome} onChange={setEditCardIcone} size="md" />
              </Suspense>
            </div>
            <div className="space-y-2">
              <Label>Nome do cartao</Label>
              <Input data-testid="input-edit-cartao-nome" value={editCardForm.nome}
                onChange={(e) => setEditCardForm({ ...editCardForm, nome: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Limite total</Label>
              <Input data-testid="input-edit-cartao-limite" type="number" step="0.01" value={editCardForm.limite}
                onChange={(e) => setEditCardForm({ ...editCardForm, limite: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Melhor dia de compra</Label>
                <Input data-testid="input-edit-cartao-melhordia" type="number" min="1" max="31" value={editCardForm.melhorDiaCompra}
                  onChange={(e) => setEditCardForm({ ...editCardForm, melhorDiaCompra: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Dia de vencimento</Label>
                <Input data-testid="input-edit-cartao-vencimento" type="number" min="1" max="31" value={editCardForm.diaVencimento}
                  onChange={(e) => setEditCardForm({ ...editCardForm, diaVencimento: e.target.value })} required />
              </div>
            </div>
            <Button type="submit" className="w-full" data-testid="button-save-edit-cartao" disabled={updateCardMutation.isPending}>
              {updateCardMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCompra} onOpenChange={(v) => { if (!v) setEditingCompra(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Compra</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateCompra(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input data-testid="input-edit-compra-descricao" value={editCompraForm.descricao}
                onChange={(e) => setEditCompraForm({ ...editCompraForm, descricao: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor total</Label>
                <Input data-testid="input-edit-compra-valor" type="number" step="0.01" value={editCompraForm.valorTotal}
                  onChange={(e) => setEditCompraForm({ ...editCompraForm, valorTotal: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Numero de parcelas</Label>
                <Input data-testid="input-edit-compra-parcelas" type="number" min="1" max="48" value={editCompraForm.parcelas}
                  onChange={(e) => setEditCompraForm({ ...editCompraForm, parcelas: e.target.value })} required />
              </div>
            </div>
            {editCompraForm.valorTotal && editCompraForm.parcelas && (
              <div className="p-3 rounded-md bg-muted/50 text-sm">
                <span className="text-muted-foreground">Nova parcela: </span>
                <span className="font-semibold">{formatCartaoCurrency(parseFloat(editCompraForm.valorTotal) / parseInt(editCompraForm.parcelas || "1"))}</span>
                <span className="text-muted-foreground"> x {editCompraForm.parcelas}x</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Pessoa vinculada (opcional)</Label>
              <Select value={editCompraForm.pessoaId || "__none__"}
                onValueChange={(v) => setEditCompraForm({ ...editCompraForm, pessoaId: v === "__none__" ? "" : v, statusPessoa: v === "__none__" ? "" : (editCompraForm.statusPessoa || "pendente") })}>
                <SelectTrigger data-testid="select-edit-compra-pessoa"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma (compra propria)</SelectItem>
                  {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editCompraForm.pessoaId && (
              <div className="space-y-2">
                <Label>Status do reembolso</Label>
                <Select value={editCompraForm.statusPessoa || "pendente"}
                  onValueChange={(v) => setEditCompraForm({ ...editCompraForm, statusPessoa: v })}>
                  <SelectTrigger data-testid="select-edit-compra-status-pessoa"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Aguardando reembolso</SelectItem>
                    <SelectItem value="pago">Reembolsado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" data-testid="button-save-edit-compra" disabled={updateCompraMutation.isPending}>
              {updateCompraMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDeleteFaturaDialog}
        onOpenChange={(open) => {
          setOpenDeleteFaturaDialog(open);
          if (!open) {
            setDeleteFaturaImpact(null);
            setDeleteFaturaImpactLoading(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Escopo da exclusão</Label>
              <Select
                value={deleteFaturaScope}
                onValueChange={(value) => {
                  if (value === "cartao" || value === "todos") {
                    setDeleteFaturaScope(value);
                    setDeleteFaturaImpact(null);
                  }
                }}
              >
                <SelectTrigger data-testid="select-delete-fatura-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cartao">Excluir fatura deste cartão</SelectItem>
                  <SelectItem value="todos">Excluir faturas de todos os cartões neste mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {deleteFaturaScope === "cartao" && (
              <div className="space-y-2">
                <Label>Cartão afetado</Label>
                <Select
                  value={deleteFaturaCartaoId}
                  onValueChange={(value) => {
                    setDeleteFaturaCartaoId(value);
                    setDeleteFaturaImpact(null);
                  }}
                >
                  <SelectTrigger data-testid="select-delete-fatura-cartao">
                    <SelectValue placeholder="Selecione um cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {cartoes.map((cartao) => (
                      <SelectItem key={cartao.id} value={cartao.id}>
                        {cartao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Mês da fatura</Label>
              <Input
                type="month"
                value={deleteFaturaMes}
                onChange={(event) => {
                  setDeleteFaturaMes(event.target.value);
                  setDeleteFaturaImpact(null);
                }}
                data-testid="input-delete-fatura-mes"
              />
            </div>

            <Card className="border-dashed">
              <CardContent className="p-3 space-y-2 text-sm">
                <p className="font-medium">Impacto da exclusão</p>
                {deleteFaturaImpactLoading && (
                  <p className="text-muted-foreground">Calculando impacto...</p>
                )}
                {!deleteFaturaImpactLoading && deleteFaturaImpact && (
                  <>
                    <p className="text-muted-foreground">
                      Mês: <span className="font-medium text-foreground">{formatMesExibicao(deleteFaturaImpact.impact.mes)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Compras: <span className="font-medium text-foreground">{deleteFaturaImpact.impact.comprasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Parcelas: <span className="font-medium text-foreground">{deleteFaturaImpact.impact.parcelasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Total removido:{" "}
                      <span className="font-medium text-foreground">
                        {formatCartaoCurrency(deleteFaturaImpact.impact.valorTotalRemovido)}
                      </span>
                    </p>
                    {deleteFaturaImpact.impact.cartoesAfetados.length > 0 && (
                      <div className="pt-1 space-y-1">
                        {deleteFaturaImpact.impact.cartoesAfetados.map((item) => (
                          <p key={item.cartaoId} className="text-xs text-muted-foreground">
                            {item.cartaoNome}: {item.comprasRemovidas} compra(s), {item.parcelasRemovidas} parcela(s),{" "}
                            {formatCartaoCurrency(item.valorTotalRemovido)}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {!deleteFaturaImpactLoading && !deleteFaturaImpact && (
                  <p className="text-muted-foreground">Selecione os dados para visualizar o impacto.</p>
                )}
              </CardContent>
            </Card>

            <Button
              type="button"
              className="w-full"
              variant="destructive"
              disabled={
                deleteFaturaImpactLoading
                || deleteFaturaCartaoMutation.isPending
                || deleteFaturasMesMutation.isPending
                || !deleteFaturaImpact
                || deleteFaturaImpact.impact.comprasRemovidas === 0
              }
              onClick={handleConfirmDeleteFatura}
              data-testid="button-confirm-delete-fatura"
            >
              {deleteFaturaCartaoMutation.isPending || deleteFaturasMesMutation.isPending
                ? "Excluindo..."
                : "Confirmar exclusão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDeleteCompraDialog}
        onOpenChange={(open) => {
          if (!open) {
            resetDeleteCompraDialog();
          } else {
            setOpenDeleteCompraDialog(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Compra: <span className="font-medium text-foreground">{deleteCompraTarget?.descricao ?? "-"}</span>
            </p>

            {deleteCompraTarget && Number(deleteCompraTarget.parcelas) > 1 && (
              <div className="space-y-2">
                <Label>Como deseja excluir?</Label>
                <Select
                  value={deleteCompraScope}
                  onValueChange={(value) => {
                    if (value === "all_parcelas" || value === "single_parcela") {
                      setDeleteCompraScope(value);
                      setDeleteCompraImpact(null);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-delete-compra-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_parcela">Excluir apenas esta parcela</SelectItem>
                    <SelectItem value="all_parcelas">Excluir todas as parcelas da compra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Card className="border-dashed">
              <CardContent className="p-3 space-y-2 text-sm">
                <p className="font-medium">Impacto da exclusão</p>
                {deleteCompraImpactLoading && <p className="text-muted-foreground">Calculando impacto...</p>}
                {!deleteCompraImpactLoading && deleteCompraImpactError && (
                  <div className="space-y-2">
                    <p className="text-red-700 text-sm">{deleteCompraImpactError}</p>
                    {deleteCompraTarget && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          void loadDeleteCompraImpact(deleteCompraTarget, deleteCompraScope);
                        }}
                        disabled={deleteCompraImpactLoading || deleteCompraSubmitting}
                        data-testid="button-retry-delete-compra-impact"
                      >
                        Tentar novamente
                      </Button>
                    )}
                  </div>
                )}
                {!deleteCompraImpactLoading && deleteCompraImpact && (
                  <>
                    <p className="text-muted-foreground">
                      Cartão afetado:{" "}
                      <span className="font-medium text-foreground">
                        {deleteCompraImpact.impact.cartao?.nome ?? "Não identificado"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Compras removidas:{" "}
                      <span className="font-medium text-foreground">{deleteCompraImpact.impact.comprasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Parcelas removidas:{" "}
                      <span className="font-medium text-foreground">{deleteCompraImpact.impact.parcelasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Total removido:{" "}
                      <span className="font-medium text-foreground">
                        {formatCartaoCurrency(deleteCompraImpact.impact.valorTotalRemovido)}
                      </span>
                    </p>
                    {deleteCompraImpact.impact.parcelaAlvo && (
                      <p className="text-xs text-muted-foreground">
                        Parcela alvo: {deleteCompraImpact.impact.parcelaAlvo.numero} -{" "}
                        {formatCartaoCurrency(deleteCompraImpact.impact.parcelaAlvo.valor)}
                      </p>
                    )}
                  </>
                )}
                {!deleteCompraImpactLoading && !deleteCompraImpact && (
                  <p className="text-muted-foreground">Não foi possível calcular o impacto com os dados atuais.</p>
                )}
              </CardContent>
            </Card>

            <Button
              type="button"
              className="w-full"
              variant="destructive"
              onClick={handleConfirmDeleteCompra}
              disabled={
                deleteCompraSubmitting
                || deleteCompraImpactLoading
                || !deleteCompraImpact
                || deleteCompraImpact.impact.parcelasRemovidas === 0
              }
              data-testid="button-confirm-delete-compra"
            >
              {deleteCompraSubmitting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewingCompra} onOpenChange={(v) => {
        if (!v) {
          setViewingCompra(null);
          setAbaterSaldoParcelaId(null);
        }
      }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {viewingCompra && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Parcelas — {viewingCompra.descricao}</SheetTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{viewingCompra.parcelas}x de {formatCartaoCurrency(Number(viewingCompra.valorParcela))}</span>
                  <span>Total: {formatCartaoCurrency(Number(viewingCompra.valorTotal))}</span>
                </div>
              </SheetHeader>

              <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                {(() => {
                  const pagas = parcelasCompraData.filter((p) => p.statusCartao === "pago").length;
                  const pendentes = parcelasCompraData.filter((p) => isParcelaComprometendoLimite(p.statusCartao)).length;
                  const vencidas = parcelasCompraData.filter(
                    (p) => isParcelaVencida(p) && getParcelaSaldoPendente(p) > 0,
                  ).length;
                  return (
                    <>
                      <div className="rounded-md bg-emerald-500/5 p-2 text-center">
                        <p className="text-xs text-muted-foreground">Pagas</p>
                        <p className="font-bold text-emerald-600">{pagas}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 p-2 text-center">
                        <p className="text-xs text-muted-foreground">Pendentes</p>
                        <p className="font-bold">{pendentes}</p>
                      </div>
                      <div className="rounded-md bg-red-500/5 p-2 text-center">
                        <p className="text-xs text-muted-foreground">Vencidas</p>
                        <p className="font-bold text-red-600">{vencidas}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="space-y-2">
                {parcelasCompraData.map((p) => {
                  const saldoPendente = getParcelaSaldoPendente(p);
                  const vencida = isParcelaVencida(p) && saldoPendente > 0;
                  const pago = p.statusCartao === "pago";
                  const isPaying = payingParcelaId === p.id;
                  const isEditing = editingParcelaId === p.id;
                  const pessoaVinculadaId = viewingCompra.pessoaId || null;
                  const saldoAbatido = getParcelaSaldoAbatido(p.id);
                  const parcialViaSaldo = !pago && saldoAbatido > 0;
                  const saldoPessoaDisponivel = pessoaVinculadaId ? getPessoaSaldoDisponivel(pessoaVinculadaId) : 0;
                  const podeAbaterSaldo = Boolean(pessoaVinculadaId) && !pago && p.statusCartao !== "cancelado"
                    && saldoPendente > 0 && saldoPessoaDisponivel > 0;
                  const aguardaReembolso = pago && viewingCompra.pessoaId && (!p.statusPessoa || p.statusPessoa === "pendente");
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-md border text-sm space-y-2 ${pago ? "bg-emerald-500/5 border-emerald-500/10" : vencida ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/40"}`}
                      data-testid={`row-parcela-compra-${p.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${pago ? "bg-emerald-500 text-white" : vencida ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
                            {pago ? <Check className="w-3 h-3" /> : p.numero}
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input type="number" step="0.01" className="h-6 w-20 text-xs px-1"
                                value={editingParcelaValor}
                                onChange={(e) => setEditingParcelaValor(e.target.value)} />
                              <Input type="date" className="h-6 text-xs px-1"
                                value={editingParcelaData}
                                onChange={(e) => setEditingParcelaData(e.target.value)} />
                              <Button variant="ghost" size="icon" className="h-5 w-5"
                                onClick={() => handleEditParcela(p.id)}>
                                <Check className="w-3 h-3 text-emerald-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingParcelaId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{formatCartaoCurrency(Number(p.valor))}</span>
                                {pago && (
                                  <span className="text-xs text-emerald-600">
                                    Pago {p.dataPagamentoCartao ? `em ${p.dataPagamentoCartao}` : ""}
                                  </span>
                                )}
                                {parcialViaSaldo && (
                                  <span className="text-xs text-blue-600">
                                    Parcial via saldo: abatido {formatCartaoCurrency(saldoAbatido)} · pendente {formatCartaoCurrency(saldoPendente)}
                                  </span>
                                )}
                                {!pago && p.dataVencimento && (
                                  <span className={`text-xs ${vencida ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                    Venc. {p.dataVencimento}{vencida ? " · VENCIDA" : ""}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                {saldoAbatido > 0 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">Saldo pessoa</span>
                                )}
                                {aguardaReembolso && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">Ag. reembolso</span>
                                )}
                                {p.statusPessoa === "pago" && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">Reembolsado</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!isEditing && !isPaying && !pago && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                title="Editar parcela"
                                onClick={() => { setEditingParcelaId(p.id); setEditingParcelaValor(String(p.valor)); setEditingParcelaData(p.dataVencimento || ""); }}
                                data-testid={`button-edit-parcela-compra-${p.id}`}>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                title="Marcar como pago"
                                onClick={() => setPayingParcelaId(p.id)}
                                data-testid={`button-pay-parcela-compra-${p.id}`}>
                                <Check className="w-3 h-3 text-emerald-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Abater com saldo da pessoa"
                                onClick={() => {
                                  if (!pessoaVinculadaId) return;
                                  openAbaterSaldoParcelaDialog(p.id, pessoaVinculadaId);
                                }}
                                data-testid={`button-abater-saldo-parcela-${p.id}`}
                                disabled={!podeAbaterSaldo}
                              >
                                <Wallet className="w-3 h-3 text-blue-600" />
                              </Button>
                            </>
                          )}
                          {pago && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title={saldoAbatido > 0 ? "Pago via saldo da pessoa" : "Desfazer pagamento"}
                              onClick={() => {
                                if (saldoAbatido > 0) return;
                                handlePayParcela(p.id, false);
                              }}
                              disabled={saldoAbatido > 0}
                              data-testid={`button-undo-parcela-compra-${p.id}`}>
                              <X className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          )}
                          {aguardaReembolso && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title="Marcar reembolso recebido"
                              onClick={() => handlePayParcelaPessoa(p.id, true)}
                              data-testid={`button-reembolso-parcela-${p.id}`}>
                              <RefreshCw className="w-3 h-3 text-amber-600" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {isPaying && (
                        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                          <Input type="date" className="h-7 text-xs flex-1" value={payParcelaData}
                            onChange={(e) => setPayParcelaData(e.target.value)} />
                          <Button size="sm" className="h-7 text-xs"
                            onClick={() => handlePayParcela(p.id, true, payParcelaData)}
                            data-testid={`button-confirm-pay-parcela-${p.id}`}>
                            Confirmar
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPayingParcelaId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Dialog open={!!abaterSaldoParcelaId} onOpenChange={(open) => { if (!open) setAbaterSaldoParcelaId(null); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Abater saldo na parcela</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
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
                  >
                    {(() => {
                      const parcela = parcelasCompraData.find((item) => item.id === abaterSaldoParcelaId);
                      if (!parcela || !viewingCompra?.pessoaId) return null;
                      const pessoa = pessoas.find((item) => item.id === viewingCompra.pessoaId);
                      const saldoDisponivel = getPessoaSaldoDisponivel(viewingCompra.pessoaId);
                      const pendente = getParcelaSaldoPendente(parcela);

                      return (
                        <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                          <p className="font-medium">
                            Parcela {parcela.numero} - {formatCartaoCurrency(Number(parcela.valor))}
                          </p>
                          <p className="text-muted-foreground">
                            Pessoa: {pessoa?.nome ?? "Vinculada"} · Saldo disponível: {formatCartaoCurrency(saldoDisponivel)}
                          </p>
                          <p className="text-muted-foreground">
                            Pendente atual da parcela: {formatCartaoCurrency(pendente)}
                          </p>
                        </div>
                      );
                    })()}

                    <div className="space-y-2">
                      <Label>Valor do abatimento</Label>
                      <Input
                        value={abaterSaldoParcelaForm.valor}
                        onChange={(e) => setAbaterSaldoParcelaForm((prev) => ({ ...prev, valor: e.target.value }))}
                        placeholder="0,00"
                        required
                        data-testid="input-abater-saldo-parcela-valor"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={abaterSaldoParcelaForm.data}
                        onChange={(e) => setAbaterSaldoParcelaForm((prev) => ({ ...prev, data: e.target.value }))}
                        required
                        data-testid="input-abater-saldo-parcela-data"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Observação (opcional)</Label>
                      <Input
                        value={abaterSaldoParcelaForm.observacao}
                        onChange={(e) => setAbaterSaldoParcelaForm((prev) => ({ ...prev, observacao: e.target.value }))}
                        placeholder="Ex.: abatimento usando saldo da pessoa"
                        data-testid="input-abater-saldo-parcela-observacao"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={abaterSaldoParcelaMutation.isPending}
                      data-testid="button-confirmar-abater-saldo-parcela"
                    >
                      {abaterSaldoParcelaMutation.isPending ? "Aplicando..." : "Aplicar abatimento"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </SheetContent>
      </Sheet>

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

      {cartoes.length > 0 && cartoesTab !== "compras" && (
        <div className="space-y-3" data-testid={`cartoes-tab-${cartoesTab}`}>
          {cartoesTab === "resumo" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cartoes.map((cartao) => {
                const faturaAtual = getCardTotal(cartao.id);
                const limiteDisponivel = getCardAvailableLimit(cartao.id);
                const totalCompras = getCardCompras(cartao.id).length;
                return (
                  <Card key={cartao.id} className="fintech-surface desktop-hover-lift">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <BrandIconDisplay name={cartao.nome} iconeId={cartao.iconeId} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{cartao.nome}</p>
                            <p className="text-xs text-muted-foreground">{totalCompras} compra(s) parcelada(s)</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="touch-feedback"
                          onClick={() => {
                            setCartoesTab("compras");
                            setSelectedCartao(cartao.id);
                          }}
                          data-testid={`button-open-cartao-compras-${cartao.id}`}
                        >
                          Ver compras
                        </Button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="fintech-stat-card p-2.5">
                          <p className="text-[11px] text-muted-foreground">Fatura atual</p>
                          <p className="font-semibold">{formatCartaoCurrency(faturaAtual)}</p>
                        </div>
                        <div className="fintech-stat-card bg-emerald-500/5 p-2.5">
                          <p className="text-[11px] text-muted-foreground">Disponível</p>
                          <p className="font-semibold text-emerald-600">{formatCartaoCurrency(limiteDisponivel)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {cartoesTab === "fatura" && (
            <div className="space-y-3">
              {cartoes.map((cartao) => {
                const comprasFiltradas = getFilteredCardCompras(cartao.id);
                return (
                  <Card key={cartao.id} className="fintech-surface desktop-hover-lift">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{cartao.nome}</p>
                        <Badge variant="outline">{formatCartaoCurrency(getCardTotal(cartao.id))}</Badge>
                      </div>
                      {comprasFiltradas.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma compra encontrada para o filtro.</p>
                      ) : (
                        <div className="space-y-2">
                          {comprasFiltradas.slice(0, 12).map((compra) => (
                            <div key={compra.id} className="fintech-surface-subtle p-2.5 flex items-center justify-between gap-2 touch-feedback">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{compra.descricao}</p>
                                <p className="text-xs text-muted-foreground">
                                  {compra.parcelaAtual}/{compra.parcelas}x · {compra.dataCompra}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{formatCartaoCurrency(Number(compra.valorParcela))}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openDeleteCompraConfirm(compra)}
                                  data-testid={`button-delete-compra-fatura-${compra.id}`}
                                >
                                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {cartoesTab === "parcelas" && (
            <div className="space-y-3">
              {cartoes.map((cartao) => {
                const comprasFiltradas = getFilteredCardCompras(cartao.id);
                return (
                  <Card key={cartao.id} className="fintech-surface desktop-hover-lift">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{cartao.nome}</p>
                        <Badge variant="secondary">{comprasFiltradas.length} compra(s)</Badge>
                      </div>
                      {comprasFiltradas.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma compra encontrada para o filtro.</p>
                      ) : (
                        <div className="space-y-2">
                          {comprasFiltradas.slice(0, 12).map((compra) => (
                            <div key={compra.id} className="fintech-surface-subtle p-2.5 flex items-center justify-between gap-2 touch-feedback">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{compra.descricao}</p>
                                <p className="text-xs text-muted-foreground">
                                  Parcela atual {compra.parcelaAtual}/{compra.parcelas}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setViewingCompra(compra)}
                                  data-testid={`button-open-parcelas-tab-${compra.id}`}
                                >
                                  Ver parcelas
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openDeleteCompraConfirm(compra)}
                                  data-testid={`button-delete-compra-parcelas-tab-${compra.id}`}
                                >
                                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {cartoesTab === "limite" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cartoes.map((cartao) => {
                const limite = Number(cartao.limite);
                const comprometido = getCardUsedLimit(cartao.id);
                const disponivel = getCardAvailableLimit(cartao.id);
                const percentual = limite > 0 ? Math.min((comprometido / limite) * 100, 100) : 0;
                return (
                  <Card key={cartao.id} className="fintech-surface desktop-hover-lift">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{cartao.nome}</p>
                        <Badge variant={percentual >= 85 ? "destructive" : percentual >= 65 ? "secondary" : "default"}>
                          {percentual.toFixed(0)}%
                        </Badge>
                      </div>
                      <Progress value={percentual} className="h-2" />
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <div className="fintech-stat-card p-2">
                          <p className="text-muted-foreground">Limite</p>
                          <p className="font-semibold">{formatCartaoCurrency(limite)}</p>
                        </div>
                        <div className="fintech-stat-card p-2">
                          <p className="text-muted-foreground">Comprom.</p>
                          <p className="font-semibold">{formatCartaoCurrency(comprometido)}</p>
                        </div>
                        <div className="fintech-stat-card bg-emerald-500/5 p-2">
                          <p className="text-muted-foreground">Disponível</p>
                          <p className="font-semibold text-emerald-600">{formatCartaoCurrency(disponivel)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={cartoesTab === "compras" || cartoes.length === 0 ? "" : "hidden"}>
      {cartoes.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-cartoes">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum cartao cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione seu primeiro cartao</p>
        </div>
      ) : prefs.mobileMode ? (
        <div className="space-y-4" data-testid="cartoes-mobile-list">
          <div className="fintech-surface desktop-hover-lift touch-feedback p-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-muted-foreground font-medium">
                Faturas de {format(new Date(), "MMMM", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase())}
              </p>
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tracking-tight">{formatCartaoCurrency(totalFaturas)}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground px-1">Meus cartões</p>
            {cartoes.map((c) => {
              const limite = Number(c.limite);
              const faturaAtual = getCardTotal(c.id);
              const limiteComprometido = getCardUsedLimit(c.id);
              const limiteDisponivel = getCardAvailableLimit(c.id);
              const nextDate = getNextInvoiceDate(Number(c.diaVencimento));
              const [nextDay, nextMonth] = nextDate.split("/");

              return (
                <div
                  key={c.id}
                  className="fintech-surface desktop-hover-lift touch-feedback overflow-hidden"
                  data-testid={`mobile-card-cartao-${c.id}`}
                >
                  <div className="flex items-center gap-3 p-4">
                    <BrandIconDisplay name={c.nome} iconeId={c.iconeId} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">Cartão manual</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 rounded-lg flex-shrink-0"
                      onClick={() => {
                        setSelectedCartao(selectedCartao === c.id ? "" : c.id);
                        setOpenCompra(false);
                      }}
                      data-testid={`button-ver-fatura-mobile-${c.id}`}
                    >
                      {selectedCartao === c.id ? "Fechar" : "Ver fatura"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-border/70 bg-muted/25 px-4 py-3">
                    <div className="pr-4">
                      <p className="text-xs text-muted-foreground mb-0.5">Limite Disponível</p>
                      <p className="text-sm font-semibold text-emerald-600">{formatCartaoCurrency(limiteDisponivel)}</p>
                    </div>
                    <div className="pl-4">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Fatura atual{" "}
                        <span className="font-normal">(Venc.{nextDay}/{nextMonth})</span>
                      </p>
                      <p className="text-sm font-semibold">{formatCartaoCurrency(faturaAtual)}</p>
                    </div>
                  </div>

                  {selectedCartao === c.id && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {getFilteredCardCompras(c.id).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma compra na fatura</p>
                      ) : (
                        getFilteredCardCompras(c.id).map((compra) => {
                          const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);
                          return (
                            <div key={compra.id} className="flex items-center gap-3 px-4 py-3 touch-feedback">
                              <BrandIconDisplay name={compra.descricao} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{compra.descricao}</p>
                                <p className="text-xs text-muted-foreground">
                                  {compra.parcelaAtual}/{compra.parcelas}x
                                </p>
                                {servicosVinculados.length > 0 && (
                                  <p className="text-[11px] text-blue-600 mt-0.5">
                                    Serviço vinculado ({servicosVinculados.length})
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <p className="text-sm font-semibold">
                                  {formatCartaoCurrency(Number(compra.valorParcela))}
                                </p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Ver parcelas"
                                    onClick={() => setViewingCompra(compra)}
                                    data-testid={`button-view-parcelas-mobile-${compra.id}`}
                                  >
                                    <List className="w-3 h-3 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Excluir compra"
                                    onClick={() => openDeleteCompraConfirm(compra)}
                                    data-testid={`button-delete-compra-mobile-${compra.id}`}
                                  >
                                    <Trash2 className="w-3 h-3 text-muted-foreground" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div className="px-4 py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => { setSelectedCartao(c.id); setOpenCompra(true); }}
                          data-testid={`button-add-compra-mobile-${c.id}`}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Adicionar compra
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cartoes.map((c) => {
            const limite = Number(c.limite);
            const faturaAtual = getCardTotal(c.id);
            const limiteComprometido = getCardUsedLimit(c.id);
            const limiteDisponivel = getCardAvailableLimit(c.id);
            const percentUsed = limite > 0 ? (limiteComprometido / limite) * 100 : 0;
            const cardCompras = getFilteredCardCompras(c.id);
            const daysUntil = getDaysUntilInvoice(Number(c.diaVencimento));
            const nextDate = getNextInvoiceDate(Number(c.diaVencimento));
            const isUrgent = daysUntil <= 5;

            return (
                <Card key={c.id} className="fintech-surface desktop-hover-lift" data-testid={`card-cartao-${c.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <BrandIconDisplay name={c.nome} iconeId={c.iconeId} size="md" />
                      <div>
                        <CardTitle className="text-base">{c.nome}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Melhor compra: dia {c.melhorDiaCompra} · Venc: dia {c.diaVencimento}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon"
                        onClick={() => { setEditingCard(c); setEditCardForm({ nome: c.nome, limite: String(c.limite), melhorDiaCompra: String(c.melhorDiaCompra), diaVencimento: String(c.diaVencimento) }); setEditCardIcone(c.iconeId || null); }}
                        data-testid={`button-edit-cartao-${c.id}`}>
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCard(c.id)}
                        data-testid={`button-delete-cartao-${c.id}`}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="fintech-stat-card">
                        <p className="text-xs text-muted-foreground mb-1">Fatura atual</p>
                        <p className="text-lg font-bold">{formatCartaoCurrency(faturaAtual)}</p>
                      </div>
                      <div className="fintech-stat-card bg-emerald-500/5">
                        <p className="text-xs text-muted-foreground mb-1">Disponível</p>
                        <p className="text-lg font-bold text-emerald-600">{formatCartaoCurrency(limiteDisponivel)}</p>
                      </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{formatCartaoCurrency(limiteComprometido)} usados</span>
                      <span>Limite: {formatCartaoCurrency(limite)}</span>
                    </div>
                    <Progress
                      value={Math.min(percentUsed, 100)}
                      className={`h-2 ${percentUsed > 80 ? "[&>div]:bg-red-500" : percentUsed > 60 ? "[&>div]:bg-amber-500" : ""}`}
                    />
                  </div>

                  <div className={`flex items-center gap-2 p-3 rounded-md ${isUrgent ? "bg-red-500/5 border border-red-500/10" : "bg-muted/30"}`}>
                    <CalendarClock className={`w-4 h-4 flex-shrink-0 ${isUrgent ? "text-red-500" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">Proxima fatura</p>
                      <p className={`text-sm font-semibold ${isUrgent ? "text-red-600" : ""}`}>
                        {nextDate} · {daysUntil} dia(s)
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Compras parceladas ({cardCompras.length})</span>
                    </div>
                    <Button variant="outline" size="sm"
                      onClick={() => { setSelectedCartao(c.id); setOpenCompra(true); }}
                      data-testid={`button-add-compra-${c.id}`}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar
                    </Button>
                  </div>

                  {cardCompras.length > 0 && (
                    <div className="space-y-2">
                      {cardCompras.map((compra) => {
                        const aguardandoReembolso = compra.pessoaId && (!compra.statusPessoa || compra.statusPessoa === "pendente");
                        const reembolsado = compra.pessoaId && compra.statusPessoa === "pago";
                        const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);
                        return (
                          <div key={compra.id} className="fintech-surface-subtle p-2.5 text-sm touch-feedback" data-testid={`compra-${compra.id}`}>
                            <div className="flex items-center gap-3 mb-2">
                              <BrandIconDisplay name={compra.descricao} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="truncate font-medium">{compra.descricao}</p>
                                  {compra.pessoaId && (
                                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
                                      <User className="w-2.5 h-2.5" />
                                      {pessoas.find((p) => p.id === compra.pessoaId)?.nome ?? "Pessoa"}
                                    </span>
                                  )}
                                  {aguardandoReembolso && (
                                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 flex-shrink-0">
                                      <RefreshCw className="w-2.5 h-2.5" /> Ag. reembolso
                                    </span>
                                  )}
                                  {reembolsado && (
                                    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 flex-shrink-0">
                                      Reembolsado
                                    </span>
                                  )}
                                  {servicosVinculados.length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 flex-shrink-0">
                                      <CreditCard className="w-2.5 h-2.5" />
                                      Serviço vinculado ({servicosVinculados.length})
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {compra.parcelaAtual}/{compra.parcelas}x de {formatCartaoCurrency(Number(compra.valorParcela))}
                                  {" · "}total: {formatCartaoCurrency(Number(compra.valorTotal))}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="font-semibold text-sm">{formatCartaoCurrency(Number(compra.valorParcela))}</span>
                                {aguardandoReembolso && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    title="Marcar como reembolsado"
                                    onClick={() => handleMarcarReembolso(compra.id, true)}
                                    data-testid={`button-reembolso-${compra.id}`}>
                                    <RefreshCw className="w-3 h-3 text-amber-600" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  title="Ver parcelas"
                                  onClick={() => setViewingCompra(compra)}
                                  data-testid={`button-view-parcelas-${compra.id}`}>
                                  <List className="w-3 h-3 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => { setEditingCompra(compra); setEditCompraForm({ descricao: compra.descricao, valorTotal: String(compra.valorTotal), parcelas: String(compra.parcelas), pessoaId: compra.pessoaId ?? "", statusPessoa: compra.statusPessoa ?? "pendente" }); }}
                                  data-testid={`button-edit-compra-${compra.id}`}>
                                  <Pencil className="w-3 h-3 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => openDeleteCompraConfirm(compra)}
                                  data-testid={`button-delete-compra-${compra.id}`}>
                                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {cardCompras.length === 0 && (
                    <p className="text-center py-3 text-sm text-muted-foreground">Nenhuma compra parcelada</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}






