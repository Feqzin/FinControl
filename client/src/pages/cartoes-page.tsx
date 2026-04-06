import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, CreditCard, Trash2, CalendarClock, ShoppingBag, User, Pencil,
  RefreshCw, Upload, List, Check, X, ChevronRight,
  Eye,
} from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Cartao, CompraCartao, Pessoa, ParcelaCompra } from "@shared/schema";
import { format, addMonths, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildIgnoredDetails, countIgnoredRows, findVencimentoFatura, parseCsv, parseOfx, type ParseResult, type ParsedItem } from "@/pages/cartoes/import-parser";
import { ImportFaturaDialog } from "@/pages/cartoes/components/import-fatura-dialog";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getNextInvoiceDate(diaVencimento: number): string {
  const now = new Date();
  const currentDay = now.getDate();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), diaVencimento);
  if (currentDay >= diaVencimento) targetDate = addMonths(targetDate, 1);
  return format(targetDate, "dd/MM/yyyy");
}

function getDaysUntilInvoice(diaVencimento: number): number {
  const now = new Date();
  const currentDay = now.getDate();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), diaVencimento);
  if (currentDay >= diaVencimento) targetDate = addMonths(targetDate, 1);
  return Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isParcelaVencida(p: ParcelaCompra) {
  if (p.statusCartao === "pago") return false;
  if (!p.dataVencimento) return false;
  try { return isPast(parseISO(p.dataVencimento + "T23:59:59")); } catch { return false; }
}

export default function CartoesPage() {
  const { toast } = useToast();
  const { prefs } = useUIPreferences();

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

  const [openImport, setOpenImport] = useState(false);
  const [importCartaoId, setImportCartaoId] = useState<string>("");
  const [importTexto, setImportTexto] = useState("");
  const [importItems, setImportItems] = useState<ParsedItem[]>([]);
  const [importTab, setImportTab] = useState<"texto" | "arquivo">("texto");
  const [importLoading, setImportLoading] = useState(false);
  const [importVencimento, setImportVencimento] = useState("");
  const [importEditingId, setImportEditingId] = useState<string | null>(null);
  const [importEditForm, setImportEditForm] = useState({
    descricao: "", valor: "", dataCompra: "", parcelas: "", parcelaAtual: "", vencimentoFatura: "",
  });

  const { data: cartoes = [], isLoading } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: parcelasCompraData = [], refetch: refetchParcelas } = useQuery<ParcelaCompra[]>({
    queryKey: ["/api/parcelas-compra", viewingCompra?.id],
    enabled: !!viewingCompra,
  });

  const createCardMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/cartoes", {
        ...data, melhorDiaCompra: parseInt(data.melhorDiaCompra), diaVencimento: parseInt(data.diaVencimento),
        iconeId: newCardIcone,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      setOpenCard(false);
      setCardForm({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
      setNewCardIcone(null);
      toast({ title: "Cartao adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateCardMutation = useMutation({
    mutationFn: async ({ id, data, iconeId }: { id: string; data: any; iconeId?: string | null }) => {
      await apiRequest("PATCH", `/api/cartoes/${id}`, {
        nome: data.nome, limite: data.limite,
        melhorDiaCompra: parseInt(data.melhorDiaCompra), diaVencimento: parseInt(data.diaVencimento),
        iconeId: iconeId ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      setEditingCard(null);
      toast({ title: "Cartao atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createCompraMutation = useMutation({
    mutationFn: async (data: any) => {
      const parcelas = parseInt(data.parcelas);
      const valorTotal = parseFloat(data.valorTotal);
      const valorParcela = (valorTotal / parcelas).toFixed(2);
      await apiRequest("POST", "/api/compras-cartao", {
        cartaoId: selectedCartao, descricao: data.descricao, valorTotal: data.valorTotal,
        pessoaId: data.pessoaId || null, statusPessoa: data.pessoaId ? "pendente" : null,
        parcelas, parcelaAtual: 1, valorParcela, dataCompra: data.dataCompra,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      setOpenCompra(false);
      setCompraForm({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });
      toast({ title: "Compra registrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateCompraMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const parcelas = parseInt(data.parcelas);
      const valorTotal = parseFloat(data.valorTotal);
      const valorParcela = (valorTotal / parcelas).toFixed(2);
      const pessoaId = data.pessoaId || null;
      await apiRequest("PATCH", `/api/compras-cartao/${id}`, {
        descricao: data.descricao, valorTotal: String(valorTotal), parcelas, valorParcela,
        pessoaId, statusPessoa: pessoaId ? (data.statusPessoa || "pendente") : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      setEditingCompra(null);
      toast({ title: "Compra atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const marcarReembolsoMutation = useMutation({
    mutationFn: async ({ id, pago }: { id: string; pago: boolean }) => {
      await apiRequest("PATCH", `/api/compras-cartao/${id}`, {
        statusPessoa: pago ? "pago" : "pendente",
        dataPagamentoPessoa: pago ? format(new Date(), "yyyy-MM-dd") : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      toast({ title: "Status de reembolso atualizado" });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/cartoes/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] }); toast({ title: "Cartao removido" }); },
  });

  const deleteCompraMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/compras-cartao/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] }); toast({ title: "Compra removida" }); },
  });

  const payParcelaMutation = useMutation({
    mutationFn: async ({ id, pago, dataPagamento }: { id: string; pago: boolean; dataPagamento?: string }) => {
      await apiRequest("PATCH", `/api/parcelas-compra/${id}`, {
        statusCartao: pago ? "pago" : "pendente",
        dataPagamentoCartao: pago ? (dataPagamento || format(new Date(), "yyyy-MM-dd")) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra", viewingCompra?.id] });
      setPayingParcelaId(null);
      toast({ title: "Status da parcela atualizado" });
    },
  });

  const payParcelaPessoaMutation = useMutation({
    mutationFn: async ({ id, pago }: { id: string; pago: boolean }) => {
      await apiRequest("PATCH", `/api/parcelas-compra/${id}`, {
        statusPessoa: pago ? "pago" : "pendente",
        dataPagamentoPessoa: pago ? format(new Date(), "yyyy-MM-dd") : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra", viewingCompra?.id] });
      toast({ title: "Reembolso atualizado" });
    },
  });

  const editParcelaMutation = useMutation({
    mutationFn: async ({ id, valor, dataVencimento }: { id: string; valor?: string; dataVencimento?: string }) => {
      await apiRequest("PATCH", `/api/parcelas-compra/${id}`, {
        ...(valor !== undefined ? { valor } : {}),
        ...(dataVencimento !== undefined ? { dataVencimento } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra", viewingCompra?.id] });
      setEditingParcelaId(null);
      toast({ title: "Parcela atualizada" });
    },
  });

  const batchImportMutation = useMutation({
    mutationFn: async ({ items, cartaoId }: { items: ParsedItem[]; cartaoId: string }) => {
      for (const item of items) {
        if (item.action !== "import") continue;
        await apiRequest("POST", "/api/compras-cartao", {
          cartaoId,
          descricao: item.descricao,
          valorTotal: String(item.valor),
          valorParcela: String(item.valorParcela),
          parcelas: item.parcelas,
          parcelaAtual: item.parcelaAtual,
          dataCompra: item.dataCompra,
          pessoaId: null,
          statusPessoa: null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      setOpenImport(false);
      setImportItems([]);
      setImportTexto("");
      toast({ title: "Compras importadas com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro na importacao", description: e.message, variant: "destructive" }),
  });

  const handleParseTexto = () => {
    if (!importTexto.trim()) { toast({ title: "Cole ou escreva o texto da fatura", variant: "destructive" }); return; }
    const cartaoId = importCartaoId || (cartoes[0]?.id ?? "");
    const result = parseCsv(importTexto, compras, cartaoId);
    setImportItems(result.items);
    setImportEditingId(null);
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
      return;
    }
    toast({
      title: `${result.items.length} compra(s) detectada(s)`,
      description: hasIgnoredRows ? ignoredDetails : undefined,
    });
  };

  const applyImportEdit = () => {
    if (!importEditingId) return;
    const p = Math.max(1, parseInt(importEditForm.parcelas) || 1);
    const pa = Math.min(Math.max(1, parseInt(importEditForm.parcelaAtual) || 1), p);
    const vp = parseFloat(importEditForm.valor) || 0; // valor da parcela
    const vt = Number((vp * p).toFixed(2)); // valorTotal = parcela Ã— total
    setImportItems(importItems.map((item) => item.id === importEditingId ? {
      ...item,
      descricao: importEditForm.descricao || item.descricao,
      valor: vp > 0 ? vt : item.valor,
      valorParcela: vp > 0 ? vp : item.valorParcela,
      parcelas: p,
      parcelaAtual: pa,
      parcelasRestantes: p - pa,
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
      let result: ParseResult;
      const name = file.name.toLowerCase();
      if (name.endsWith(".ofx") || name.endsWith(".qfx")) result = parseOfx(content, compras, cartaoId);
      else result = parseCsv(content, compras, cartaoId);
      setImportItems(result.items);
      setImportEditingId(null);
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
        return;
      }
      toast({
        title: `${result.items.length} compra(s) detectada(s)`,
        description: hasIgnoredRows ? ignoredDetails : undefined,
      });
    } catch {
      toast({ title: "Erro ao ler arquivo", variant: "destructive" });
    } finally { setImportLoading(false); }
  };

  const getCardCompras = (cartaoId: string) => compras.filter((c) => c.cartaoId === cartaoId);
  const getCardTotal = (cartaoId: string) => getCardCompras(cartaoId).reduce((s, c) => s + Number(c.valorParcela), 0);

  const totalFaturas = cartoes.reduce((s, c) => s + getCardTotal(c.id), 0);
  const totalAguardandoReembolso = compras
    .filter((c) => c.pessoaId && (!c.statusPessoa || c.statusPessoa === "pendente"))
    .reduce((s, c) => s + Number(c.valorParcela), 0);

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
          <Dialog open={openCard} onOpenChange={setOpenCard}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-cartao">
                <Plus className="w-4 h-4 mr-2" /> Novo cartao
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Cartao</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createCardMutation.mutate(cardForm); }} className="space-y-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Total de faturas abertas</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalFaturas)}</p>
                </div>
                <BrandIconDisplay name="generic" size="md" />
              </div>
            </CardContent>
          </Card>
          {totalAguardandoReembolso > 0 && (
            <Card className="hover-elevate border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Aguardando reembolso</p>
                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalAguardandoReembolso)}</p>
                  </div>
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-amber-500/10">
                    <RefreshCw className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={openCompra} onOpenChange={setOpenCompra}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Compra Parcelada</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createCompraMutation.mutate(compraForm); }} className="space-y-4">
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
                  <span className="font-semibold">{formatCurrency(parseFloat(compraForm.valorTotal) / parseInt(compraForm.parcelas || "1"))}</span>
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
          <form onSubmit={(e) => { e.preventDefault(); if (!editingCard) return; updateCardMutation.mutate({ id: editingCard.id, data: editCardForm, iconeId: editCardIcone }); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Ãcone</Label>
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
          <form onSubmit={(e) => { e.preventDefault(); if (!editingCompra) return; updateCompraMutation.mutate({ id: editingCompra.id, data: editCompraForm }); }} className="space-y-4">
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
                <span className="font-semibold">{formatCurrency(parseFloat(editCompraForm.valorTotal) / parseInt(editCompraForm.parcelas || "1"))}</span>
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

      <Sheet open={!!viewingCompra} onOpenChange={(v) => { if (!v) setViewingCompra(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {viewingCompra && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Parcelas â€” {viewingCompra.descricao}</SheetTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{viewingCompra.parcelas}x de {formatCurrency(Number(viewingCompra.valorParcela))}</span>
                  <span>Total: {formatCurrency(Number(viewingCompra.valorTotal))}</span>
                </div>
              </SheetHeader>

              <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
                {(() => {
                  const pagas = parcelasCompraData.filter((p) => p.statusCartao === "pago").length;
                  const pendentes = parcelasCompraData.filter((p) => p.statusCartao !== "pago").length;
                  const vencidas = parcelasCompraData.filter(isParcelaVencida).length;
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
                  const vencida = isParcelaVencida(p);
                  const pago = p.statusCartao === "pago";
                  const isPaying = payingParcelaId === p.id;
                  const isEditing = editingParcelaId === p.id;
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
                                onClick={() => editParcelaMutation.mutate({ id: p.id, valor: editingParcelaValor, dataVencimento: editingParcelaData })}>
                                <Check className="w-3 h-3 text-emerald-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingParcelaId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{formatCurrency(Number(p.valor))}</span>
                                {pago && (
                                  <span className="text-xs text-emerald-600">
                                    Pago {p.dataPagamentoCartao ? `em ${p.dataPagamentoCartao}` : ""}
                                  </span>
                                )}
                                {!pago && p.dataVencimento && (
                                  <span className={`text-xs ${vencida ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                    Venc. {p.dataVencimento}{vencida ? " Â· VENCIDA" : ""}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
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
                            </>
                          )}
                          {pago && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title="Desfazer pagamento"
                              onClick={() => payParcelaMutation.mutate({ id: p.id, pago: false })}
                              data-testid={`button-undo-parcela-compra-${p.id}`}>
                              <X className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          )}
                          {aguardaReembolso && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title="Marcar reembolso recebido"
                              onClick={() => payParcelaPessoaMutation.mutate({ id: p.id, pago: true })}
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
                            onClick={() => payParcelaMutation.mutate({ id: p.id, pago: true, dataPagamento: payParcelaData })}
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
        formatCurrency={formatCurrency}
        isBatchImportPending={batchImportMutation.isPending}
        onConfirmImport={() => batchImportMutation.mutate({ items: importItems, cartaoId: importCartaoId || cartoes[0]?.id })}
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
            <p className="text-2xl font-bold tracking-tight">{formatCurrency(totalFaturas)}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground px-1">Meus cartÃµes</p>
            {cartoes.map((c) => {
              const limite = Number(c.limite);
              const faturaAtual = getCardTotal(c.id);
              const limiteDisponivel = limite - faturaAtual;
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
                      <p className="text-xs text-muted-foreground">CartÃ£o manual</p>
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
                      <p className="text-xs text-muted-foreground mb-0.5">Limite DisponÃ­vel</p>
                      <p className="text-sm font-semibold text-emerald-600">{formatCurrency(limiteDisponivel)}</p>
                    </div>
                    <div className="pl-4">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Fatura atual{" "}
                        <span className="font-normal">(Venc.{nextDay}/{nextMonth})</span>
                      </p>
                      <p className="text-sm font-semibold">{formatCurrency(faturaAtual)}</p>
                    </div>
                  </div>

                  {selectedCartao === c.id && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {getCardCompras(c.id).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma compra na fatura</p>
                      ) : (
                        getCardCompras(c.id).map((compra) => (
                          <div key={compra.id} className="flex items-center gap-3 px-4 py-3">
                            <BrandIconDisplay name={compra.descricao} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{compra.descricao}</p>
                              <p className="text-xs text-muted-foreground">
                                {compra.parcelaAtual}/{compra.parcelas}x
                              </p>
                            </div>
                            <p className="text-sm font-semibold flex-shrink-0">
                              {formatCurrency(Number(compra.valorParcela))}
                            </p>
                          </div>
                        ))
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
            const percentUsed = limite > 0 ? (faturaAtual / limite) * 100 : 0;
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
                          Melhor compra: dia {c.melhorDiaCompra} Â· Venc: dia {c.diaVencimento}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon"
                        onClick={() => { setEditingCard(c); setEditCardForm({ nome: c.nome, limite: String(c.limite), melhorDiaCompra: String(c.melhorDiaCompra), diaVencimento: String(c.diaVencimento) }); setEditCardIcone(c.iconeId || null); }}
                        data-testid={`button-edit-cartao-${c.id}`}>
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteCardMutation.mutate(c.id)}
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
                      <p className="text-lg font-bold">{formatCurrency(faturaAtual)}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">DisponÃ­vel</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(limite - faturaAtual)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{formatCurrency(faturaAtual)} usados</span>
                      <span>Limite: {formatCurrency(limite)}</span>
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
                        {nextDate} Â· {daysUntil} dia(s)
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
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {compra.parcelaAtual}/{compra.parcelas}x de {formatCurrency(Number(compra.valorParcela))}
                                  {" Â· "}total: {formatCurrency(Number(compra.valorTotal))}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="font-semibold text-sm">{formatCurrency(Number(compra.valorParcela))}</span>
                                {aguardandoReembolso && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    title="Marcar como reembolsado"
                                    onClick={() => marcarReembolsoMutation.mutate({ id: compra.id, pago: true })}
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
                                  onClick={() => deleteCompraMutation.mutate(compra.id)}
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
