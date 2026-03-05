import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Receipt, Search, Check, Trash2, ChevronDown, ChevronUp,
  Pencil, FastForward, Calendar, AlertCircle, X,
} from "lucide-react";
import type { Divida, Parcela, Pessoa } from "@shared/schema";
import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(d: string) {
  try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; }
}

function isOverdueDate(d: string) {
  try { return isPast(parseISO(d + "T23:59:59")); } catch { return false; }
}

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartao" },
  { value: "transferencia", label: "Transferencia" },
  { value: "boleto", label: "Boleto" },
];

type DividaWithParcelas = Divida & { parcelas: Parcela[] };

function ParcelaRow({
  parcela,
  onPay,
  onEdit,
  isPaying,
}: {
  parcela: Parcela;
  onPay: (parcela: Parcela) => void;
  onEdit: (parcela: Parcela) => void;
  isPaying: boolean;
}) {
  const overdue = parcela.status === "pendente" && isOverdueDate(parcela.dataVencimento);
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-md text-sm ${
        parcela.status === "pago"
          ? "bg-emerald-500/5"
          : overdue
          ? "bg-red-500/5 border border-red-500/20"
          : "bg-muted/30"
      }`}
      data-testid={`row-parcela-${parcela.id}`}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        parcela.status === "pago" ? "bg-emerald-500 text-white" : overdue ? "bg-red-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
      }`}>
        {parcela.status === "pago" ? <Check className="w-3 h-3" /> : parcela.numero}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{formatCurrency(Number(parcela.valor))}</span>
          <span className="text-muted-foreground">
            {parcela.status === "pago"
              ? `Pago em ${formatDate(parcela.dataPagamento!)}${parcela.formaPagamento ? ` via ${parcela.formaPagamento}` : ""}`
              : `Venc. ${formatDate(parcela.dataVencimento)}${overdue ? " · ATRASADO" : ""}`
            }
          </span>
        </div>
      </div>
      {parcela.status === "pendente" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(parcela)}
            data-testid={`button-edit-parcela-${parcela.id}`}
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPay(parcela)}
            disabled={isPaying}
            data-testid={`button-pay-parcela-${parcela.id}`}
          >
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function DividasPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");

  const [createTab, setCreateTab] = useState<"simples" | "parcelado">("simples");
  const [simpleForm, setSimpleForm] = useState({
    pessoaId: "", tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
  });
  const [parceladoForm, setParceladoForm] = useState({
    pessoaId: "", tipo: "receber", valorTotal: "", totalParcelas: "2", primeiroVencimento: "", descricao: "", formaPagamento: "pix",
  });

  const [payingParcela, setPayingParcela] = useState<Parcela | null>(null);
  const [payParcelaForm, setPayParcelaForm] = useState({ formaPagamento: "pix", dataPagamento: format(new Date(), "yyyy-MM-dd") });
  const [editingParcela, setEditingParcela] = useState<Parcela | null>(null);
  const [editParcelaForm, setEditParcelaForm] = useState({ valor: "", dataVencimento: "" });

  const [anteciparOpen, setAnteciparOpen] = useState(false);
  const [anteciparDivida, setAnteciparDivida] = useState<DividaWithParcelas | null>(null);
  const [anteciparForm, setAnteciparForm] = useState({ quantidade: "1", formaPagamento: "pix" });

  const [editingDivida, setEditingDivida] = useState<DividaWithParcelas | null>(null);
  const [editDividaForm, setEditDividaForm] = useState({
    pessoaId: "", tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
  });
  const [recalcularForm, setRecalcularForm] = useState({ novoTotal: "", primeiroVencimento: "" });
  const [showRecalcular, setShowRecalcular] = useState(false);

  const { data: dividas = [], isLoading } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: parcelas = [] } = useQuery<Parcela[]>({ queryKey: ["/api/parcelas"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "—";

  const dividasComParcelas: DividaWithParcelas[] = dividas.map((d) => ({
    ...d,
    parcelas: parcelas.filter((p) => p.dividaId === d.id).sort((a, b) => a.numero - b.numero),
  }));

  const filtered = dividasComParcelas
    .filter((d) => {
      const nome = getPessoaNome(d.pessoaId).toLowerCase();
      return nome.includes(search.toLowerCase()) || (d.descricao || "").toLowerCase().includes(search.toLowerCase());
    })
    .filter((d) => {
      if (filterStatus === "todos") return true;
      if (d.parcelas.length > 0) {
        if (filterStatus === "pendente") return d.parcelas.some((p) => p.status === "pendente");
        if (filterStatus === "pago") return d.parcelas.every((p) => p.status === "pago");
      }
      return d.status === filterStatus;
    })
    .filter((d) => filterTipo === "todos" || d.tipo === filterTipo)
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

  const getDividaStatus = (d: DividaWithParcelas) => {
    if (d.parcelas.length === 0) return d.status;
    if (d.parcelas.every((p) => p.status === "pago")) return "pago";
    return "pendente";
  };

  const getDividaValorPendente = (d: DividaWithParcelas) => {
    if (d.parcelas.length === 0) return d.status === "pendente" ? Number(d.valor) : 0;
    return d.parcelas.filter((p) => p.status === "pendente").reduce((s, p) => s + Number(p.valor), 0);
  };

  const getDividaValorPago = (d: DividaWithParcelas) => {
    if (d.parcelas.length === 0) return d.status === "pago" ? Number(d.valor) : 0;
    return d.parcelas.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  };

  const totalReceber = filtered
    .filter((d) => d.tipo === "receber")
    .reduce((s, d) => s + getDividaValorPendente(d), 0);
  const totalPagar = filtered
    .filter((d) => d.tipo === "pagar")
    .reduce((s, d) => s + getDividaValorPendente(d), 0);

  const createSimpleMutation = useMutation({
    mutationFn: async (data: any) => { await apiRequest("POST", "/api/dividas", data); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setOpen(false);
      setSimpleForm({ pessoaId: "", tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix" });
      toast({ title: "Dívida registrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createParceladoMutation = useMutation({
    mutationFn: async (data: any) => { await apiRequest("POST", "/api/dividas/parcelado", data); },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      setOpen(false);
      setParceladoForm({ pessoaId: "", tipo: "receber", valorTotal: "", totalParcelas: "2", primeiroVencimento: "", descricao: "", formaPagamento: "pix" });
      toast({ title: `Dívida parcelada criada com ${vars.totalParcelas} parcelas` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const payParcelaMutation = useMutation({
    mutationFn: async ({ id, formaPagamento, dataPagamento }: { id: string; formaPagamento: string; dataPagamento: string }) => {
      const res = await apiRequest("PATCH", `/api/parcelas/${id}`, {
        status: "pago",
        dataPagamento,
        formaPagamento,
      });
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setPayingParcela(null);
      toast({ title: "Parcela marcada como paga" });
    },
  });

  const editParcelaMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; valor?: string; dataVencimento?: string }) => {
      const res = await apiRequest("PATCH", `/api/parcelas/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      setEditingParcela(null);
      toast({ title: "Parcela atualizada" });
    },
  });

  const anteciparMutation = useMutation({
    mutationFn: async (data: { dividaId: string; quantidade: number; formaPagamento: string }) => {
      const res = await apiRequest("POST", "/api/parcelas/antecipar", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setAnteciparOpen(false);
      setAnteciparDivida(null);
      toast({ title: `${data.updated} parcela(s) antecipada(s)${data.todasPagas ? " · Dívida quitada!" : ""}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/dividas/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      toast({ title: "Dívida removida" });
    },
  });

  const updateDividaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/dividas/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setEditingDivida(null);
      toast({ title: "Dívida atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const recalcularMutation = useMutation({
    mutationFn: async ({ id, novoTotal, primeiroVencimento }: { id: string; novoTotal: number; primeiroVencimento?: string }) => {
      const res = await apiRequest("POST", `/api/dividas/${id}/recalcular`, { novoTotal, primeiroVencimento: primeiroVencimento || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      setEditingDivida(null);
      setShowRecalcular(false);
      toast({ title: `Parcelas recalculadas: ${data.pagas} pagas mantidas, ${data.novas} novas criadas` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="dividas-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dividas</h1>
          <p className="text-muted-foreground">Controle parcelado de valores a receber e a pagar</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-divida">
              <Plus className="w-4 h-4 mr-2" /> Nova dívida
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Dívida</DialogTitle>
            </DialogHeader>
            <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as any)}>
              <TabsList className="w-full">
                <TabsTrigger value="simples" className="flex-1" data-testid="tab-simples">Simples</TabsTrigger>
                <TabsTrigger value="parcelado" className="flex-1" data-testid="tab-parcelado">Parcelado</TabsTrigger>
              </TabsList>

              <TabsContent value="simples" className="space-y-4 mt-4">
                <form onSubmit={(e) => { e.preventDefault(); createSimpleMutation.mutate(simpleForm); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pessoa</Label>
                    <Select value={simpleForm.pessoaId} onValueChange={(v) => setSimpleForm({ ...simpleForm, pessoaId: v })}>
                      <SelectTrigger data-testid="select-divida-pessoa"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={simpleForm.tipo} onValueChange={(v) => setSimpleForm({ ...simpleForm, tipo: v })}>
                        <SelectTrigger data-testid="select-divida-tipo"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receber">A receber</SelectItem>
                          <SelectItem value="pagar">A pagar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <Input data-testid="input-divida-valor" type="number" step="0.01" value={simpleForm.valor}
                        onChange={(e) => setSimpleForm({ ...simpleForm, valor: e.target.value })} placeholder="0,00" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Vencimento</Label>
                      <Input data-testid="input-divida-vencimento" type="date" value={simpleForm.dataVencimento}
                        onChange={(e) => setSimpleForm({ ...simpleForm, dataVencimento: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Forma</Label>
                      <Select value={simpleForm.formaPagamento} onValueChange={(v) => setSimpleForm({ ...simpleForm, formaPagamento: v })}>
                        <SelectTrigger data-testid="select-divida-pagamento"><SelectValue /></SelectTrigger>
                        <SelectContent>{FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Input data-testid="input-divida-descricao" value={simpleForm.descricao}
                      onChange={(e) => setSimpleForm({ ...simpleForm, descricao: e.target.value })} placeholder="Descrição breve" />
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-save-divida" disabled={createSimpleMutation.isPending}>
                    {createSimpleMutation.isPending ? "Salvando..." : "Registrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="parcelado" className="space-y-4 mt-4">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createParceladoMutation.mutate({
                    ...parceladoForm,
                    valorTotal: Number(parceladoForm.valorTotal),
                    totalParcelas: Number(parceladoForm.totalParcelas),
                  });
                }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pessoa</Label>
                    <Select value={parceladoForm.pessoaId} onValueChange={(v) => setParceladoForm({ ...parceladoForm, pessoaId: v })}>
                      <SelectTrigger data-testid="select-parcelado-pessoa"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={parceladoForm.tipo} onValueChange={(v) => setParceladoForm({ ...parceladoForm, tipo: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receber">A receber</SelectItem>
                          <SelectItem value="pagar">A pagar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor total</Label>
                      <Input data-testid="input-parcelado-valor" type="number" step="0.01" value={parceladoForm.valorTotal}
                        onChange={(e) => setParceladoForm({ ...parceladoForm, valorTotal: e.target.value })} placeholder="0,00" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Numero de parcelas</Label>
                      <Input data-testid="input-parcelado-parcelas" type="number" min="2" max="360" value={parceladoForm.totalParcelas}
                        onChange={(e) => setParceladoForm({ ...parceladoForm, totalParcelas: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>1° vencimento</Label>
                      <Input data-testid="input-parcelado-vencimento" type="date" value={parceladoForm.primeiroVencimento}
                        onChange={(e) => setParceladoForm({ ...parceladoForm, primeiroVencimento: e.target.value })} required />
                    </div>
                  </div>
                  {parceladoForm.valorTotal && parceladoForm.totalParcelas && Number(parceladoForm.totalParcelas) > 0 && (
                    <div className="p-3 rounded-md bg-primary/5 border border-primary/10 text-sm">
                      <span className="text-muted-foreground">Valor por parcela: </span>
                      <span className="font-semibold">{formatCurrency(Number(parceladoForm.valorTotal) / Number(parceladoForm.totalParcelas))}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Forma</Label>
                      <Select value={parceladoForm.formaPagamento} onValueChange={(v) => setParceladoForm({ ...parceladoForm, formaPagamento: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição (opcional)</Label>
                      <Input value={parceladoForm.descricao} onChange={(e) => setParceladoForm({ ...parceladoForm, descricao: e.target.value })} placeholder="Descrição" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-save-parcelado" disabled={createParceladoMutation.isPending}>
                    {createParceladoMutation.isPending ? "Gerando cronograma..." : "Gerar cronograma"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-divida" className="pl-9" placeholder="Buscar pessoa ou descrição..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            <SelectItem value="receber">A receber</SelectItem>
            <SelectItem value="pagar">A pagar</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="pago">Quitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/10 p-3">
            <p className="text-xs text-muted-foreground mb-1">Total a receber (pendente)</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalReceber)}</p>
          </div>
          <div className="rounded-md bg-red-500/5 border border-red-500/10 p-3">
            <p className="text-xs text-muted-foreground mb-1">Total a pagar (pendente)</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totalPagar)}</p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-dividas">
          <Receipt className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma dívida encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Registre uma nova dívida ou ajuste os filtros</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const status = getDividaStatus(d);
            const valorPendente = getDividaValorPendente(d);
            const valorPago = getDividaValorPago(d);
            const valorTotal = d.parcelas.length > 0
              ? d.parcelas.reduce((s, p) => s + Number(p.valor), 0)
              : Number(d.valor);
            const progresso = valorTotal > 0 ? (valorPago / valorTotal) * 100 : 0;
            const isExpanded = expandedId === d.id;
            const hasParce = d.parcelas.length > 0;
            const proximaParcela = d.parcelas.find((p) => p.status === "pendente");
            const parcelasVencidas = d.parcelas.filter((p) => p.status === "pendente" && isOverdueDate(p.dataVencimento)).length;
            const parcelasPagas = d.parcelas.filter((p) => p.status === "pago").length;

            const simpleOverdue = !hasParce && status === "pendente" && isOverdueDate(d.dataVencimento);

            return (
              <Card key={d.id} className={`hover-elevate transition-all ${parcelasVencidas > 0 || simpleOverdue ? "border-red-500/30" : ""}`}
                data-testid={`card-divida-${d.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${
                        status === "pago" ? "bg-emerald-500" : parcelasVencidas > 0 || simpleOverdue ? "bg-red-500" : "bg-amber-400"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{getPessoaNome(d.pessoaId)}</p>
                          <Badge variant={d.tipo === "receber" ? "default" : "destructive"}>
                            {d.tipo === "receber" ? "Receber" : "Pagar"}
                          </Badge>
                          {hasParce ? (
                            <Badge variant={status === "pago" ? "secondary" : "outline"}>
                              {parcelasPagas}/{d.parcelas.length} parcelas
                            </Badge>
                          ) : (
                            <Badge variant={status === "pago" ? "secondary" : "outline"}>
                              {status === "pago" ? "Pago" : simpleOverdue ? "Vencido" : "Pendente"}
                            </Badge>
                          )}
                          {parcelasVencidas > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {parcelasVencidas} atrasada{parcelasVencidas > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {hasParce
                            ? proximaParcela
                              ? `Proxima: ${formatDate(proximaParcela.dataVencimento)} · ${formatCurrency(Number(proximaParcela.valor))}`
                              : "Todas pagas"
                            : status === "pago"
                            ? `Pago em ${d.dataPagamento}${d.formaPagamento ? ` via ${d.formaPagamento}` : ""}`
                            : `Venc: ${formatDate(d.dataVencimento)}${simpleOverdue ? " · ATRASADO" : ""}`
                          }
                          {d.descricao && ` · ${d.descricao}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="text-right mr-1">
                        <div className="text-lg font-bold">{formatCurrency(hasParce ? valorTotal : Number(d.valor))}</div>
                        {hasParce && valorPendente > 0 && (
                          <div className="text-xs text-muted-foreground">Pendente: {formatCurrency(valorPendente)}</div>
                        )}
                      </div>
                      {hasParce && status !== "pago" && (
                        <Button variant="ghost" size="icon" onClick={() => { setAnteciparDivida(d); setAnteciparOpen(true); }}
                          title="Antecipar parcelas" data-testid={`button-antecipar-${d.id}`}>
                          <FastForward className="w-4 h-4 text-primary" />
                        </Button>
                      )}
                      {hasParce && (
                        <Button variant="ghost" size="icon" onClick={() => setExpandedId(isExpanded ? null : d.id)}
                          data-testid={`button-expand-${d.id}`}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon"
                        onClick={() => {
                          setEditingDivida(d);
                          setEditDividaForm({
                            pessoaId: d.pessoaId,
                            tipo: d.tipo,
                            valor: d.parcelas.length > 0 ? String(d.valorTotal || d.valor) : String(d.valor),
                            dataVencimento: d.dataVencimento || "",
                            descricao: d.descricao || "",
                            formaPagamento: d.formaPagamento || "pix",
                          });
                          setRecalcularForm({ novoTotal: String(d.totalParcelas || d.parcelas.length || ""), primeiroVencimento: "" });
                          setShowRecalcular(false);
                        }}
                        data-testid={`button-edit-divida-${d.id}`}>
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)}
                        data-testid={`button-delete-divida-${d.id}`}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  {hasParce && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{parcelasPagas} de {d.parcelas.length} pagas</span>
                        <span>{Math.round(progresso)}%</span>
                      </div>
                      <Progress value={progresso} className="h-1.5" />
                    </div>
                  )}

                  {isExpanded && hasParce && (
                    <div className="space-y-1.5 pt-1 border-t border-border/50">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Cronograma de parcelas</p>
                      {d.parcelas.map((p) => (
                        <ParcelaRow
                          key={p.id}
                          parcela={p}
                          onPay={(parcela) => {
                            setPayingParcela(parcela);
                            setPayParcelaForm({ formaPagamento: "pix", dataPagamento: format(new Date(), "yyyy-MM-dd") });
                          }}
                          onEdit={(parcela) => {
                            setEditingParcela(parcela);
                            setEditParcelaForm({ valor: String(parcela.valor), dataVencimento: parcela.dataVencimento });
                          }}
                          isPaying={payParcelaMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!payingParcela} onOpenChange={(v) => { if (!v) setPayingParcela(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento de parcela</DialogTitle></DialogHeader>
          {payingParcela && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted/50 text-sm">
                <p className="font-medium">Parcela {payingParcela.numero} · {formatCurrency(Number(payingParcela.valor))}</p>
                <p className="text-muted-foreground">Vencimento: {formatDate(payingParcela.dataVencimento)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={payParcelaForm.dataPagamento}
                    onChange={(e) => setPayParcelaForm({ ...payParcelaForm, dataPagamento: e.target.value })}
                    data-testid="input-pay-parcela-data" />
                </div>
                <div className="space-y-2">
                  <Label>Forma</Label>
                  <Select value={payParcelaForm.formaPagamento} onValueChange={(v) => setPayParcelaForm({ ...payParcelaForm, formaPagamento: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" data-testid="button-confirm-pay-parcela"
                onClick={() => payParcelaMutation.mutate({ id: payingParcela.id, ...payParcelaForm })}
                disabled={payParcelaMutation.isPending}>
                {payParcelaMutation.isPending ? "Registrando..." : "Confirmar pagamento"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingParcela} onOpenChange={(v) => { if (!v) setEditingParcela(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar parcela</DialogTitle></DialogHeader>
          {editingParcela && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input type="number" step="0.01" value={editParcelaForm.valor}
                    onChange={(e) => setEditParcelaForm({ ...editParcelaForm, valor: e.target.value })}
                    data-testid="input-edit-parcela-valor" />
                </div>
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input type="date" value={editParcelaForm.dataVencimento}
                    onChange={(e) => setEditParcelaForm({ ...editParcelaForm, dataVencimento: e.target.value })}
                    data-testid="input-edit-parcela-data" />
                </div>
              </div>
              <Button className="w-full" data-testid="button-save-edit-parcela"
                onClick={() => editParcelaMutation.mutate({ id: editingParcela.id, ...editParcelaForm })}
                disabled={editParcelaMutation.isPending}>
                {editParcelaMutation.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={anteciparOpen} onOpenChange={(v) => { if (!v) { setAnteciparOpen(false); setAnteciparDivida(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Antecipar parcelas</DialogTitle></DialogHeader>
          {anteciparDivida && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted/50 text-sm">
                <p className="font-medium">{getPessoaNome(anteciparDivida.pessoaId)}</p>
                <p className="text-muted-foreground">
                  {anteciparDivida.parcelas.filter((p) => p.status === "pendente").length} parcelas pendentes
                </p>
              </div>
              <div className="space-y-2">
                <Label>Quantas parcelas antecipar?</Label>
                <Input type="number" min="1"
                  max={anteciparDivida.parcelas.filter((p) => p.status === "pendente").length}
                  value={anteciparForm.quantidade}
                  onChange={(e) => setAnteciparForm({ ...anteciparForm, quantidade: e.target.value })}
                  data-testid="input-antecipar-quantidade" />
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={anteciparForm.formaPagamento} onValueChange={(v) => setAnteciparForm({ ...anteciparForm, formaPagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {anteciparForm.quantidade && Number(anteciparForm.quantidade) > 0 && (
                <div className="p-3 rounded-md bg-primary/5 border border-primary/10 text-sm">
                  <p className="text-muted-foreground">Total a pagar agora:</p>
                  <p className="font-bold text-lg">
                    {formatCurrency(
                      anteciparDivida.parcelas
                        .filter((p) => p.status === "pendente")
                        .sort((a, b) => a.numero - b.numero)
                        .slice(0, Number(anteciparForm.quantidade))
                        .reduce((s, p) => s + Number(p.valor), 0)
                    )}
                  </p>
                </div>
              )}
              <Button className="w-full" data-testid="button-confirm-antecipar"
                onClick={() => anteciparMutation.mutate({
                  dividaId: anteciparDivida.id,
                  quantidade: Number(anteciparForm.quantidade),
                  formaPagamento: anteciparForm.formaPagamento,
                })}
                disabled={anteciparMutation.isPending}>
                {anteciparMutation.isPending ? "Processando..." : `Antecipar ${anteciparForm.quantidade} parcela(s)`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDivida} onOpenChange={(v) => { if (!v) { setEditingDivida(null); setShowRecalcular(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Dívida</DialogTitle>
          </DialogHeader>
          {editingDivida && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pessoa</Label>
                <Select value={editDividaForm.pessoaId} onValueChange={(v) => setEditDividaForm({ ...editDividaForm, pessoaId: v })}>
                  <SelectTrigger data-testid="select-edit-divida-pessoa"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={editDividaForm.tipo} onValueChange={(v) => setEditDividaForm({ ...editDividaForm, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receber">A receber</SelectItem>
                      <SelectItem value="pagar">A pagar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{editingDivida.parcelas.length > 0 ? "Valor total" : "Valor"}</Label>
                  <Input
                    data-testid="input-edit-divida-valor"
                    type="number" step="0.01"
                    value={editDividaForm.valor}
                    onChange={(e) => setEditDividaForm({ ...editDividaForm, valor: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input
                    data-testid="input-edit-divida-vencimento"
                    type="date"
                    value={editDividaForm.dataVencimento}
                    onChange={(e) => setEditDividaForm({ ...editDividaForm, dataVencimento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma</Label>
                  <Select value={editDividaForm.formaPagamento} onValueChange={(v) => setEditDividaForm({ ...editDividaForm, formaPagamento: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  data-testid="input-edit-divida-descricao"
                  value={editDividaForm.descricao}
                  onChange={(e) => setEditDividaForm({ ...editDividaForm, descricao: e.target.value })}
                  placeholder="Descrição breve"
                />
              </div>

              {editingDivida.parcelas.length > 0 && (
                <div className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Recalcular parcelas pendentes</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowRecalcular(!showRecalcular)}
                      data-testid="button-toggle-recalcular">
                      {showRecalcular ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                    </Button>
                  </div>
                  {!showRecalcular && (
                    <p className="text-xs text-muted-foreground">
                      Parcelas pagas: {editingDivida.parcelas.filter((p) => p.status === "pago").length}/{editingDivida.parcelas.length}
                    </p>
                  )}
                  {showRecalcular && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        As parcelas ja pagas ({editingDivida.parcelas.filter((p) => p.status === "pago").length}) serao mantidas.
                        As pendentes serao recriadas.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Novo total de parcelas</Label>
                          <Input type="number" min="1" max="360" value={recalcularForm.novoTotal}
                            onChange={(e) => setRecalcularForm({ ...recalcularForm, novoTotal: e.target.value })}
                            data-testid="input-novo-total-parcelas" />
                        </div>
                        <div className="space-y-2">
                          <Label>1o venc. pendente (opcional)</Label>
                          <Input type="date" value={recalcularForm.primeiroVencimento}
                            onChange={(e) => setRecalcularForm({ ...recalcularForm, primeiroVencimento: e.target.value })} />
                        </div>
                      </div>
                      <Button className="w-full" variant="outline"
                        data-testid="button-confirmar-recalcular"
                        disabled={!recalcularForm.novoTotal || recalcularMutation.isPending}
                        onClick={() => recalcularMutation.mutate({
                          id: editingDivida.id,
                          novoTotal: Number(recalcularForm.novoTotal),
                          primeiroVencimento: recalcularForm.primeiroVencimento || undefined,
                        })}>
                        {recalcularMutation.isPending ? "Recalculando..." : "Recalcular parcelas"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <Button className="w-full" data-testid="button-save-edit-divida"
                disabled={updateDividaMutation.isPending}
                onClick={() => updateDividaMutation.mutate({
                  id: editingDivida.id,
                  data: {
                    pessoaId: editDividaForm.pessoaId,
                    tipo: editDividaForm.tipo,
                    valor: editDividaForm.valor,
                    dataVencimento: editDividaForm.dataVencimento || null,
                    descricao: editDividaForm.descricao || null,
                    formaPagamento: editDividaForm.formaPagamento || null,
                    ...(editingDivida.parcelas.length > 0 ? { valorTotal: editDividaForm.valor } : {}),
                  },
                })}>
                {updateDividaMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
