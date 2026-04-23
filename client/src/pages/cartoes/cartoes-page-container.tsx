import { useState, lazy, Suspense, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, CreditCard, Trash2, CalendarClock, ShoppingBag, User, Pencil,
  RefreshCw, Upload, List, Check, X, ChevronRight,
  Eye, Wallet,
} from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Cartao, CompraCartao, ParcelaCompra } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildIgnoredDetails, countIgnoredRows, findVencimentoFatura, parseCsv, parseOfx, type ParseResult, type ParsedItem } from "@/pages/cartoes/import-parser";
import { ImportFaturaDialog } from "@/pages/cartoes/components/import-fatura-dialog";
import { useCartoes } from "@/hooks/useCartoes";
import { CartoesSummaryCards } from "@/pages/cartoes/components/cartoes-summary-cards";
import { previewImportCompras } from "@/services/api/cartoes";
import { isParcelaComprometendoLimite } from "@/lib/card-limit-usage";
import {
  formatCartaoCurrency,
  getDaysUntilInvoice,
  getNextInvoiceDate,
  isParcelaVencida,
} from "@/pages/cartoes/cartoes.utils";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

export default function CartoesPage() {
  const { toast } = useToast();
  const { prefs } = useUIPreferences();
  const [location, setLocation] = useLocation();

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
  const [importEditForm, setImportEditForm] = useState({
    descricao: "", valor: "", dataCompra: "", parcelas: "", parcelaAtual: "", vencimentoFatura: "",
  });

  const {
    cartoes,
    compras,
    servicos,
    pessoas,
    pessoaSaldoMovimentacoes,
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
  const getErrorMessage = (error: unknown) => (
    error instanceof Error ? error.message : "Erro inesperado"
  );

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
    setImportItems([]);
    setImportTexto("");
    setImportVencimento("");
    setImportEditingId(null);
    setImportPreviewLogId(null);
    setImportSourceType("manual");
    setImportSourceName("");
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
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
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

  const handleDeleteCompra = (id: string) => {
    deleteCompraMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Compra removida" });
      },
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
    const cartaoId = importCartaoId || cartoes[0]?.id;
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
    if (!importTexto.trim()) {
      toast({ title: "Cole ou escreva o texto da fatura", variant: "destructive" });
      return;
    }

    const cartaoId = importCartaoId || (cartoes[0]?.id ?? "");
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
    setImportLoading(true);
    try {
      const content = await file.text();
      const cartaoId = importCartaoId || (cartoes[0]?.id ?? "");
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="cartoes-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cartoes de Credito</h1>
          <p className="text-muted-foreground">Gerencie seus cartoes e compras parceladas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setImportCartaoId(cartoes[0]?.id ?? ""); setOpenImport(true); }}
            data-testid="button-importar-fatura">
            <Upload className="w-4 h-4 mr-2" /> Importar Fatura
          </Button>
          {lastImportLogId && (
            <Button
              variant="outline"
              onClick={handleRollbackLastImport}
              disabled={rollbackImportMutation.isPending}
              data-testid="button-rollback-import"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {rollbackImportMutation.isPending ? "Revertendo..." : "Desfazer Ultima Importacao"}
            </Button>
          )}
          <Dialog open={openCard} onOpenChange={setOpenCard}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-cartao">
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
                <div className="grid grid-cols-2 gap-3">
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
                <Button type="submit" className="w-full" data-testid="button-save-cartao" disabled={createCardMutation.isPending}>
                  {createCardMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {cartoes.length > 0 && (
        <CartoesSummaryCards
          totalFaturas={totalFaturas}
          totalAguardandoReembolso={totalAguardandoReembolso}
          formatCurrency={formatCartaoCurrency}
        />
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
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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

              <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
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
            setImportItems([]);
            setImportTexto("");
            setImportVencimento("");
            setImportEditingId(null);
            setImportPreviewLogId(null);
            setImportSourceType("manual");
            setImportSourceName("");
            return;
          }
          setOpenImport(true);
        }}
        cartoes={cartoes}
        importCartaoId={importCartaoId}
        setImportCartaoId={setImportCartaoId}
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

      {cartoes.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-cartoes">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum cartao cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione seu primeiro cartao</p>
        </div>
      ) : prefs.mobileMode ? (
        <div className="space-y-4" data-testid="cartoes-mobile-list">
          <div className="bg-card border rounded-2xl p-4 space-y-1">
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
                  className="bg-card border rounded-2xl overflow-hidden"
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

                  <div className="grid grid-cols-2 divide-x divide-border bg-muted/30 px-4 py-3">
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
                      {getCardCompras(c.id).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma compra na fatura</p>
                      ) : (
                        getCardCompras(c.id).map((compra) => {
                          const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);
                          return (
                            <div key={compra.id} className="flex items-center gap-3 px-4 py-3">
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
                              <p className="text-sm font-semibold flex-shrink-0">
                                {formatCartaoCurrency(Number(compra.valorParcela))}
                              </p>
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
            const cardCompras = getCardCompras(c.id);
            const daysUntil = getDaysUntilInvoice(Number(c.diaVencimento));
            const nextDate = getNextInvoiceDate(Number(c.diaVencimento));
            const isUrgent = daysUntil <= 5;

            return (
              <Card key={c.id} data-testid={`card-cartao-${c.id}`}>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Fatura atual</p>
                      <p className="text-lg font-bold">{formatCartaoCurrency(faturaAtual)}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
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
                          <div key={compra.id} className="p-2.5 rounded-md bg-muted/30 text-sm" data-testid={`compra-${compra.id}`}>
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
                                  onClick={() => handleDeleteCompra(compra.id)}
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
  );
}





