import { useState, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RefreshCw, Upload, List, Check, X, AlertTriangle, FileText, ChevronRight,
} from "lucide-react";
import type { Cartao, CompraCartao, Pessoa, ParcelaCompra } from "@shared/schema";
import { format, addMonths, isPast, parseISO } from "date-fns";

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

interface ParsedItem {
  id: string;
  descricao: string;
  valor: number;
  valorParcela: number;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
  duplicata: any;
  selected: boolean;
  action: "import" | "skip";
}

function parseTexto(text: string, existentes: CompraCartao[], cartaoId: string): ParsedItem[] {
  const linhas = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  let idxCounter = 0;
  for (const linha of linhas) {
    const valorMatch = linha.match(/R?\$?\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})/);
    if (!valorMatch) continue;
    const valorStr = valorMatch[1].replace(/\./g, "").replace(",", ".");
    const valor = parseFloat(valorStr);
    if (isNaN(valor) || valor <= 0) continue;
    const parcelaMatch = linha.match(/(\d+)\/(\d+)/);
    const parcelaAtual = parcelaMatch ? parseInt(parcelaMatch[1]) : 1;
    const parcelas = parcelaMatch ? parseInt(parcelaMatch[2]) : 1;
    const dataMatch = linha.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
    let dataCompra = format(new Date(), "yyyy-MM-dd");
    if (dataMatch) {
      const d = dataMatch[1]; const m = dataMatch[2]; const y = dataMatch[3] || String(new Date().getFullYear());
      dataCompra = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    let descricao = linha
      .replace(valorMatch[0], "")
      .replace(parcelaMatch ? parcelaMatch[0] : "", "")
      .replace(dataMatch ? dataMatch[0] : "", "")
      .replace(/[R$]/g, "").trim().replace(/\s+/g, " ");
    if (!descricao) descricao = "Compra importada";
    const valorParcela = Number((valor / parcelas).toFixed(2));
    const duplicata = existentes.find((e) => {
      const diffVal = Math.abs(Number(e.valorParcela) - valorParcela) / (valorParcela || 1);
      const sim = e.descricao.toLowerCase().slice(0, 6).includes(descricao.toLowerCase().slice(0, 6));
      return diffVal < 0.05 && sim && e.cartaoId === cartaoId;
    });
    items.push({
      id: String(idxCounter++),
      descricao, valor, valorParcela, parcelas, parcelaAtual, dataCompra,
      duplicata: duplicata || null, selected: !duplicata, action: duplicata ? "skip" : "import",
    });
  }
  return items;
}

function parseCsv(content: string, existentes: CompraCartao[], cartaoId: string): ParsedItem[] {
  const sep = content.includes(";") ? ";" : ",";
  const linhas = content.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return parseTexto(content, existentes, cartaoId);
  const headers = linhas[0].toLowerCase().split(sep);
  const dateIdx = headers.findIndex((h) => h.includes("data") || h.includes("date"));
  const descIdx = headers.findIndex((h) => h.includes("desc") || h.includes("nome") || h.includes("memo"));
  const valIdx = headers.findIndex((h) => h.includes("val") || h.includes("amount") || h.includes("trnamt"));
  const parcIdx = headers.findIndex((h) => h.includes("parc") || h.includes("inst"));
  if (valIdx < 0 && descIdx < 0) return parseTexto(content, existentes, cartaoId);
  const items: ParsedItem[] = [];
  let idxCounter = 0;
  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(sep).map((c) => c.trim().replace(/"/g, ""));
    const valorStr = (cols[valIdx] || "0").replace(/[R$\s]/g, "").replace(",", ".");
    const valor = Math.abs(parseFloat(valorStr));
    if (isNaN(valor) || valor <= 0) continue;
    const descricao = cols[descIdx] || "Compra importada";
    const dataRaw = cols[dateIdx] || "";
    let dataCompra = format(new Date(), "yyyy-MM-dd");
    if (dataRaw) {
      const dmatch = dataRaw.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
      if (dmatch) { const y = dmatch[3] ? (dmatch[3].length === 2 ? "20" + dmatch[3] : dmatch[3]) : String(new Date().getFullYear()); dataCompra = `${y}-${dmatch[2]}-${dmatch[1]}`; }
      else { const iso = dataRaw.match(/(\d{4})-(\d{2})-(\d{2})/); if (iso) dataCompra = iso[0]; }
    }
    const parcRaw = cols[parcIdx] || "1/1";
    const parcMatch = parcRaw.match(/(\d+)\/(\d+)/);
    const parcelaAtual = parcMatch ? parseInt(parcMatch[1]) : 1;
    const parcelas = parcMatch ? parseInt(parcMatch[2]) : 1;
    const valorParcela = Number((valor / parcelas).toFixed(2));
    const duplicata = existentes.find((e) => {
      const diffVal = Math.abs(Number(e.valorParcela) - valorParcela) / (valorParcela || 1);
      const sim = e.descricao.toLowerCase().slice(0, 6).includes(descricao.toLowerCase().slice(0, 6));
      return diffVal < 0.05 && sim && e.cartaoId === cartaoId;
    });
    items.push({
      id: String(idxCounter++),
      descricao, valor, valorParcela, parcelas, parcelaAtual, dataCompra,
      duplicata: duplicata || null, selected: !duplicata, action: duplicata ? "skip" : "import",
    });
  }
  return items.length > 0 ? items : parseTexto(content, existentes, cartaoId);
}

function parseOfx(content: string, existentes: CompraCartao[], cartaoId: string): ParsedItem[] {
  const blocks = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];
  const fallback = content.includes("STMTTRN") && blocks.length === 0
    ? content.split(/\n/).filter((l) => l.includes("STMTTRN")).reduce((acc, l, i, arr) => {
        if (l.includes("<STMTTRN>")) { const block = arr.slice(i, i + 20).join("\n"); acc.push(block); } return acc;
      }, [] as string[])
    : blocks;
  const items: ParsedItem[] = [];
  let idxCounter = 0;
  for (const block of fallback) {
    const getVal = (tag: string) => { const m = block.match(new RegExp(`<${tag}>([^<\n\r]+)`, "i")); return m ? m[1].trim() : ""; };
    const valorStr = getVal("TRNAMT");
    const valor = Math.abs(parseFloat(valorStr.replace(",", ".")));
    if (isNaN(valor) || valor <= 0) continue;
    const descricao = getVal("MEMO") || getVal("NAME") || "Compra OFX";
    const dtRaw = getVal("DTPOSTED");
    let dataCompra = format(new Date(), "yyyy-MM-dd");
    if (dtRaw && dtRaw.length >= 8) dataCompra = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`;
    const parcelaMatch = descricao.match(/(\d+)\/(\d+)/);
    const parcelaAtual = parcelaMatch ? parseInt(parcelaMatch[1]) : 1;
    const parcelas = parcelaMatch ? parseInt(parcelaMatch[2]) : 1;
    const valorParcela = Number((valor / parcelas).toFixed(2));
    const duplicata = existentes.find((e) => {
      const diffVal = Math.abs(Number(e.valorParcela) - valorParcela) / (valorParcela || 1);
      const sim = e.descricao.toLowerCase().slice(0, 6).includes(descricao.toLowerCase().slice(0, 6));
      return diffVal < 0.05 && sim && e.cartaoId === cartaoId;
    });
    items.push({
      id: String(idxCounter++),
      descricao, valor, valorParcela, parcelas, parcelaAtual, dataCompra,
      duplicata: duplicata || null, selected: !duplicata, action: duplicata ? "skip" : "import",
    });
  }
  return items;
}

export default function CartoesPage() {
  const { toast } = useToast();

  const [openCard, setOpenCard] = useState(false);
  const [openCompra, setOpenCompra] = useState(false);
  const [selectedCartao, setSelectedCartao] = useState<string>("");
  const [cardForm, setCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [compraForm, setCompraForm] = useState({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });

  const [editingCard, setEditingCard] = useState<Cartao | null>(null);
  const [editCardForm, setEditCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      setOpenCard(false);
      setCardForm({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
      toast({ title: "Cartao adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateCardMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/cartoes/${id}`, {
        nome: data.nome, limite: data.limite,
        melhorDiaCompra: parseInt(data.melhorDiaCompra), diaVencimento: parseInt(data.diaVencimento),
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
    const items = parseCsv(importTexto, compras, cartaoId);
    setImportItems(items);
    if (items.length === 0) toast({ title: "Nenhuma compra detectada. Verifique o formato do texto.", variant: "destructive" });
  };

  const handleFileUpload = async (file: File) => {
    setImportLoading(true);
    try {
      const content = await file.text();
      const cartaoId = importCartaoId || (cartoes[0]?.id ?? "");
      let items: ParsedItem[] = [];
      const name = file.name.toLowerCase();
      if (name.endsWith(".ofx") || name.endsWith(".qfx")) items = parseOfx(content, compras, cartaoId);
      else items = parseCsv(content, compras, cartaoId);
      setImportItems(items);
      if (items.length === 0) toast({ title: "Nenhuma compra detectada no arquivo.", variant: "destructive" });
      else toast({ title: `${items.length} compra(s) detectada(s)` });
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
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
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

      <Dialog open={!!editingCard} onOpenChange={(v) => { if (!v) setEditingCard(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Cartao</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!editingCard) return; updateCardMutation.mutate({ id: editingCard.id, data: editCardForm }); }} className="space-y-4">
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
                <SheetTitle>Parcelas — {viewingCompra.descricao}</SheetTitle>
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
                                    Venc. {p.dataVencimento}{vencida ? " · VENCIDA" : ""}
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

      <Dialog open={openImport} onOpenChange={(v) => { if (!v) { setOpenImport(false); setImportItems([]); setImportTexto(""); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cartoes.length > 1 && (
              <div className="space-y-2">
                <Label>Cartao de destino</Label>
                <Select value={importCartaoId} onValueChange={setImportCartaoId}>
                  <SelectTrigger data-testid="select-import-cartao"><SelectValue placeholder="Selecione o cartao" /></SelectTrigger>
                  <SelectContent>
                    {cartoes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Tabs value={importTab} onValueChange={(v) => setImportTab(v as "texto" | "arquivo")}>
              <TabsList className="w-full">
                <TabsTrigger value="texto" className="flex-1">Colar texto / CSV</TabsTrigger>
                <TabsTrigger value="arquivo" className="flex-1">Enviar arquivo</TabsTrigger>
              </TabsList>

              <TabsContent value="texto" className="space-y-3">
                <Label>Cole o extrato da fatura (texto livre, CSV, ou linha por linha)</Label>
                <Textarea
                  data-testid="textarea-import-texto"
                  value={importTexto}
                  onChange={(e) => setImportTexto(e.target.value)}
                  placeholder={"Exemplos:\n25/02 NETFLIX 60,00 1/1\n01/02 LOJA ABC 150,00 3/10\n\nOu CSV:\nData,Descricao,Valor\n25/02/2026,NETFLIX,60.00"}
                  rows={6}
                  className="font-mono text-sm"
                />
                <Button onClick={handleParseTexto} className="w-full" data-testid="button-parse-texto">
                  <FileText className="w-4 h-4 mr-2" /> Detectar compras
                </Button>
              </TabsContent>

              <TabsContent value="arquivo" className="space-y-3">
                <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Arraste ou selecione o arquivo</p>
                    <p className="text-xs text-muted-foreground">Formatos suportados: CSV, OFX, QFX</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.ofx,.qfx,.txt"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading}
                    data-testid="button-upload-file">
                    {importLoading ? "Processando..." : "Selecionar arquivo"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {importItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{importItems.length} compra(s) detectada(s)</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setImportItems(importItems.map((i) => ({ ...i, action: "import" as const })))}>
                      Selecionar todas
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setImportItems(importItems.map((i) => ({ ...i, action: "skip" as const })))}>
                      Ignorar todas
                    </Button>
                  </div>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-muted/30 grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Acao</span>
                    <span>Descricao</span>
                    <span>Valor</span>
                    <span>Parcela</span>
                    <span>Data</span>
                  </div>
                  {importItems.map((item, idx) => (
                    <div key={item.id} className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-3 py-2 text-sm items-center border-t ${item.duplicata ? "bg-amber-500/5" : ""}`}
                      data-testid={`row-import-${idx}`}>
                      <Select value={item.action} onValueChange={(v: any) => setImportItems(importItems.map((i, j) => j === idx ? { ...i, action: v } : i))}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="import">Importar</SelectItem>
                          <SelectItem value="skip">Ignorar</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.descricao}</p>
                        {item.duplicata && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Possivel duplicata: {item.duplicata.descricao}
                          </p>
                        )}
                      </div>
                      <span className="font-semibold text-right">{formatCurrency(item.valor)}</span>
                      <span className="text-muted-foreground text-right">{item.parcelaAtual}/{item.parcelas}</span>
                      <span className="text-muted-foreground text-xs">{item.dataCompra}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {importItems.filter((i) => i.action === "import").length} de {importItems.length} serao importadas
                  </p>
                  <Button
                    data-testid="button-confirmar-importacao"
                    disabled={importItems.filter((i) => i.action === "import").length === 0 || batchImportMutation.isPending}
                    onClick={() => batchImportMutation.mutate({ items: importItems, cartaoId: importCartaoId || cartoes[0]?.id })}>
                    {batchImportMutation.isPending ? "Importando..." : "Confirmar importacao"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {cartoes.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-cartoes">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum cartao cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione seu primeiro cartao</p>
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
                      <div className="flex items-center justify-center w-11 h-11 rounded-md bg-primary/10">
                        <CreditCard className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{c.nome}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Melhor compra: dia {c.melhorDiaCompra} · Venc: dia {c.diaVencimento}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon"
                        onClick={() => { setEditingCard(c); setEditCardForm({ nome: c.nome, limite: String(c.limite), melhorDiaCompra: String(c.melhorDiaCompra), diaVencimento: String(c.diaVencimento) }); }}
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
                      <p className="text-xs text-muted-foreground mb-1">Disponivel</p>
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
                        return (
                          <div key={compra.id} className="p-2.5 rounded-md bg-muted/30 text-sm" data-testid={`compra-${compra.id}`}>
                            <div className="flex items-center justify-between gap-2">
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
                                  {" · "}total: {formatCurrency(Number(compra.valorTotal))}
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
