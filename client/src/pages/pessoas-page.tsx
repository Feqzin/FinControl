import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Users, Phone, Trash2, Search, Receipt, Check,
  Clock, ArrowUpRight, ArrowDownRight, Pencil, CreditCard, Repeat,
} from "lucide-react";
import type { Pessoa, Divida, CompraCartao, Cartao, ServicoPessoa, ServicoPagamento, Servico } from "@shared/schema";
import { format } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function PessoasPage() {
  const { toast } = useToast();
  const [openPessoa, setOpenPessoa] = useState(false);
  const [openDivida, setOpenDivida] = useState(false);
  const [selectedPessoa, setSelectedPessoa] = useState<Pessoa | null>(null);
  const [historyPessoa, setHistoryPessoa] = useState<Pessoa | null>(null);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [payOpen, setPayOpen] = useState(false);
  const [payingDivida, setPayingDivida] = useState<Divida | null>(null);
  const [payForm, setPayForm] = useState({ formaPagamento: "pix" });

  const [editingPessoa, setEditingPessoa] = useState<Pessoa | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", tipo: "me_deve", telefone: "", observacao: "" });
  const [historyFilter, setHistoryFilter] = useState<"todos" | "pendente">("todos");

  const [pessoaForm, setPessoaForm] = useState({ nome: "", tipo: "me_deve", telefone: "", observacao: "" });
  const [dividaForm, setDividaForm] = useState({
    tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
  });

  const { data: pessoas = [], isLoading } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: dividas = [] } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: comprasCartao = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: servicos = [] } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });

  const createPessoaMutation = useMutation({
    mutationFn: async (data: any) => { await apiRequest("POST", "/api/pessoas", data); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      setOpenPessoa(false);
      setPessoaForm({ nome: "", tipo: "me_deve", telefone: "", observacao: "" });
      toast({ title: "Pessoa adicionada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createDividaMutation = useMutation({
    mutationFn: async (data: any) => { await apiRequest("POST", "/api/dividas", data); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setOpenDivida(false);
      setDividaForm({ tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix" });
      toast({ title: "Divida registrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, formaPagamento }: { id: string; formaPagamento: string }) => {
      await apiRequest("PATCH", `/api/dividas/${id}`, {
        status: "pago",
        dataPagamento: format(new Date(), "yyyy-MM-dd"),
        formaPagamento,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setPayOpen(false);
      setPayingDivida(null);
      toast({ title: "Marcado como pago" });
    },
  });

  const updatePessoaMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/pessoas/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      setEditingPessoa(null);
      toast({ title: "Pessoa atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/pessoas/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      if (historyPessoa) setHistoryPessoa(null);
      toast({ title: "Pessoa removida" });
    },
  });

  const marcarServicoPagoMutation = useMutation({
    mutationFn: async ({ servicoPessoaId, mes }: { servicoPessoaId: string; mes: string }) => {
      await apiRequest("POST", "/api/servico-pagamentos", {
        servicoPessoaId,
        mes,
        status: "pago",
        dataPagamento: format(new Date(), "yyyy-MM-dd"),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pagamento de servico registrado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const reverterServicoPagoMutation = useMutation({
    mutationFn: async (pagamentoId: string) => { await apiRequest("DELETE", `/api/servico-pagamentos/${pagamentoId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pagamento revertido" });
    },
  });

  const desvincularCompraMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/compras-cartao/${id}`, { pessoaId: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      toast({ title: "Vinculo removido" });
    },
  });

  const getPessoaStats = (pessoaId: string) => {
    const list = dividas.filter((d) => d.pessoaId === pessoaId);
    const pendente = list.filter((d) => d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
    const pago = list.filter((d) => d.status === "pago").reduce((s, d) => s + Number(d.valor), 0);
    const emAberto = list.filter((d) => d.status === "pendente").length > 0;
    return { pendente, pago, total: list.length, emAberto };
  };

  const getPessoaDividas = (pessoaId: string) =>
    dividas
      .filter((d) => d.pessoaId === pessoaId)
      .sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento));

  const filtered = pessoas
    .filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => filterTipo === "todos" || p.tipo === filterTipo);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  const meAtual = format(new Date(), "yyyy-MM");

  const normalizeName = (s: string) =>
    s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const duplicatePessoa = pessoaForm.nome.trim().length >= 2
    ? pessoas.find((p) => {
        const a = normalizeName(p.nome);
        const b = normalizeName(pessoaForm.nome);
        return a === b || a.includes(b) || b.includes(a);
      })
    : null;

  const allHistoryDividas = historyPessoa ? getPessoaDividas(historyPessoa.id) : [];
  const allHistoryCompras = historyPessoa
    ? comprasCartao.filter((c) => c.pessoaId === historyPessoa.id)
    : [];
  const allHistoryServicoPessoas = historyPessoa
    ? servicoPessoas.filter((sp) => sp.pessoaId === historyPessoa.id)
    : [];

  const historyDividas = historyFilter === "pendente"
    ? allHistoryDividas.filter((d) => d.status !== "pago")
    : allHistoryDividas;
  const historyStats = historyPessoa ? getPessoaStats(historyPessoa.id) : null;
  const historyCompras = historyFilter === "pendente"
    ? allHistoryCompras.filter((c) => !c.statusPessoa || c.statusPessoa !== "pago")
    : allHistoryCompras;
  const historyServicoPessoas = historyFilter === "pendente"
    ? allHistoryServicoPessoas.filter((sp) => {
        const pago = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
        return !pago;
      })
    : allHistoryServicoPessoas;

  return (
    <div className="p-6 space-y-6" data-testid="pessoas-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pessoas</h1>
          <p className="text-muted-foreground">Gerencie pessoas vinculadas as dividas</p>
        </div>
        <Dialog open={openPessoa} onOpenChange={setOpenPessoa}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-pessoa">
              <Plus className="w-4 h-4 mr-2" /> Adicionar pessoa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Pessoa</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createPessoaMutation.mutate(pessoaForm); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  data-testid="input-pessoa-nome"
                  value={pessoaForm.nome}
                  onChange={(e) => setPessoaForm({ ...pessoaForm, nome: e.target.value })}
                  placeholder="Nome da pessoa"
                  required
                />
                {duplicatePessoa && (
                  <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="warning-duplicate-pessoa">
                    Atenção: já existe uma pessoa com nome similar: <strong>{duplicatePessoa.nome}</strong>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={pessoaForm.tipo} onValueChange={(v) => setPessoaForm({ ...pessoaForm, tipo: v })}>
                  <SelectTrigger data-testid="select-pessoa-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me_deve">Me deve</SelectItem>
                    <SelectItem value="eu_devo">Eu devo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telefone (opcional)</Label>
                <Input
                  data-testid="input-pessoa-telefone"
                  value={pessoaForm.telefone}
                  onChange={(e) => setPessoaForm({ ...pessoaForm, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>Observacao</Label>
                <Textarea
                  data-testid="input-pessoa-obs"
                  value={pessoaForm.observacao}
                  onChange={(e) => setPessoaForm({ ...pessoaForm, observacao: e.target.value })}
                  placeholder="Notas sobre essa pessoa"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-save-pessoa" disabled={createPessoaMutation.isPending}>
                {createPessoaMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-pessoa"
            className="pl-9"
            placeholder="Buscar pessoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[150px]" data-testid="filter-tipo-pessoa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="me_deve">Me devem</SelectItem>
            <SelectItem value="eu_devo">Eu devo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-pessoas">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma pessoa encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione uma pessoa para comecar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const stats = getPessoaStats(p.id);
            const comprasVinculadas = comprasCartao.filter((c) => c.pessoaId === p.id).length;
            const servicosVinculados = servicoPessoas.filter((sp) => sp.pessoaId === p.id).length;
            return (
              <Card key={p.id} className="hover-elevate" data-testid={`card-pessoa-${p.id}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-11 h-11 rounded-full bg-primary/10 flex-shrink-0">
                        <span className="text-base font-bold text-primary">
                          {p.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.nome}</p>
                        {p.telefone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" /> {p.telefone}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={p.tipo === "me_deve" ? "default" : "destructive"}>
                      {p.tipo === "me_deve" ? "Me deve" : "Eu devo"}
                    </Badge>
                  </div>

                  {p.observacao && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{p.observacao}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Pendente</p>
                      <p className="text-base font-bold">{formatCurrency(stats.pendente)}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Ja pago</p>
                      <p className="text-base font-bold text-emerald-600">{formatCurrency(stats.pago)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={stats.emAberto ? "outline" : "secondary"}>
                      {stats.emAberto ? "Em aberto" : "Quitado"}
                    </Badge>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{stats.total} divida(s)</span>
                      {comprasVinculadas > 0 && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> {comprasVinculadas}
                        </span>
                      )}
                      {servicosVinculados > 0 && (
                        <span className="flex items-center gap-1">
                          <Repeat className="w-3 h-3" /> {servicosVinculados}
                        </span>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedPessoa(p);
                        setDividaForm({
                          tipo: p.tipo === "me_deve" ? "receber" : "pagar",
                          valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
                        });
                        setOpenDivida(true);
                      }}
                      data-testid={`button-add-divida-pessoa-${p.id}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Nova divida
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => setHistoryPessoa(p)}
                      data-testid={`button-history-pessoa-${p.id}`}
                    >
                      <Clock className="w-3 h-3 mr-1" /> Histórico
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingPessoa(p);
                        setEditForm({ nome: p.nome, tipo: p.tipo, telefone: p.telefone || "", observacao: p.observacao || "" });
                      }}
                      data-testid={`button-edit-pessoa-${p.id}`}
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(p.id)}
                      data-testid={`button-delete-pessoa-${p.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingPessoa} onOpenChange={(v) => { if (!v) setEditingPessoa(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pessoa</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingPessoa) return;
              updatePessoaMutation.mutate({ id: editingPessoa.id, ...editForm });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                data-testid="input-edit-pessoa-nome"
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                placeholder="Nome da pessoa"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={editForm.tipo} onValueChange={(v) => setEditForm({ ...editForm, tipo: v })}>
                <SelectTrigger data-testid="select-edit-pessoa-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me_deve">Me deve</SelectItem>
                  <SelectItem value="eu_devo">Eu devo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Telefone (opcional)</Label>
              <Input
                data-testid="input-edit-pessoa-telefone"
                value={editForm.telefone}
                onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Observacao</Label>
              <Textarea
                data-testid="input-edit-pessoa-obs"
                value={editForm.observacao}
                onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })}
                placeholder="Notas sobre essa pessoa"
              />
            </div>
            <Button type="submit" className="w-full" data-testid="button-save-edit-pessoa" disabled={updatePessoaMutation.isPending}>
              {updatePessoaMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openDivida} onOpenChange={setOpenDivida}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova divida — {selectedPessoa?.nome}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedPessoa) return;
              createDividaMutation.mutate({ ...dividaForm, pessoaId: selectedPessoa.id });
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={dividaForm.tipo} onValueChange={(v) => setDividaForm({ ...dividaForm, tipo: v })}>
                  <SelectTrigger data-testid="select-pessoa-divida-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receber">A receber</SelectItem>
                    <SelectItem value="pagar">A pagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  data-testid="input-pessoa-divida-valor"
                  type="number"
                  step="0.01"
                  value={dividaForm.valor}
                  onChange={(e) => setDividaForm({ ...dividaForm, valor: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input
                  data-testid="input-pessoa-divida-vencimento"
                  type="date"
                  value={dividaForm.dataVencimento}
                  onChange={(e) => setDividaForm({ ...dividaForm, dataVencimento: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={dividaForm.formaPagamento} onValueChange={(v) => setDividaForm({ ...dividaForm, formaPagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartao</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descricao (opcional)</Label>
              <Input
                data-testid="input-pessoa-divida-descricao"
                value={dividaForm.descricao}
                onChange={(e) => setDividaForm({ ...dividaForm, descricao: e.target.value })}
                placeholder="Descricao breve"
              />
            </div>
            <Button type="submit" className="w-full" data-testid="button-save-pessoa-divida" disabled={createDividaMutation.isPending}>
              {createDividaMutation.isPending ? "Registrando..." : "Registrar divida"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyPessoa} onOpenChange={(v) => { if (!v) { setHistoryPessoa(null); setHistoryFilter("todos"); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {historyPessoa && historyStats && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Histórico — {historyPessoa.nome}</SheetTitle>
              </SheetHeader>

              <div className="flex items-center gap-2 mb-5">
                <Button
                  variant={historyFilter === "todos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHistoryFilter("todos")}
                  data-testid="button-history-filter-todos"
                >
                  Todos
                </Button>
                <Button
                  variant={historyFilter === "pendente" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHistoryFilter("pendente")}
                  data-testid="button-history-filter-pendente"
                >
                  Pendentes
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total pendente</p>
                  <p className="text-lg font-bold">{formatCurrency(historyStats.pendente)}</p>
                </div>
                <div className="rounded-md bg-emerald-500/5 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total pago</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(historyStats.pago)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Dívidas ({historyDividas.length})
                </h3>
                <Badge variant={historyStats.emAberto ? "outline" : "secondary"}>
                  {historyStats.emAberto ? "Em aberto" : "Quitado"}
                </Badge>
              </div>

              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirmar pagamento</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {payingDivida && (
                      <div className="p-4 rounded-md bg-muted/50">
                        <p className="text-sm text-muted-foreground">Valor</p>
                        <p className="text-lg font-bold">{formatCurrency(Number(payingDivida.valor))}</p>
                        {payingDivida.descricao && (
                          <p className="text-sm text-muted-foreground mt-1">{payingDivida.descricao}</p>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Forma de pagamento</Label>
                      <Select value={payForm.formaPagamento} onValueChange={(v) => setPayForm({ formaPagamento: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="cartao">Cartao</SelectItem>
                          <SelectItem value="transferencia">Transferencia</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      data-testid="button-confirm-pay-history"
                      onClick={() => {
                        if (payingDivida) {
                          payMutation.mutate({ id: payingDivida.id, formaPagamento: payForm.formaPagamento });
                        }
                      }}
                      disabled={payMutation.isPending}
                    >
                      {payMutation.isPending ? "Processando..." : "Confirmar pagamento"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {historyDividas.length === 0 ? (
                <div className="text-center py-6">
                  <Receipt className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhuma divida registrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historyDividas.map((d) => {
                    const isOverdue = d.status === "pendente" && d.dataVencimento < format(new Date(), "yyyy-MM-dd");
                    return (
                      <div
                        key={d.id}
                        className="p-3 rounded-md border bg-card"
                        data-testid={`history-divida-${d.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {d.tipo === "receber"
                              ? <ArrowUpRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                              : <ArrowDownRight className="w-4 h-4 text-red-600 flex-shrink-0" />
                            }
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {d.descricao || (d.tipo === "receber" ? "A receber" : "A pagar")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {d.status === "pago"
                                  ? `Pago em ${d.dataPagamento}`
                                  : `Venc: ${d.dataVencimento}${isOverdue ? " · Vencido" : ""}`
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`text-sm font-bold ${d.tipo === "receber" ? "text-emerald-600" : "text-red-600"}`}>
                              {formatCurrency(Number(d.valor))}
                            </span>
                            {d.status === "pago" ? (
                              <Badge variant="secondary">Pago</Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setPayingDivida(d); setPayOpen(true); }}
                                data-testid={`button-pay-history-${d.id}`}
                              >
                                <Check className="w-4 h-4 text-emerald-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {historyCompras.length > 0 && (
                <>
                  <Separator className="my-5" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Compras de Cartao ({historyCompras.length})
                  </h3>
                  <div className="space-y-2">
                    {historyCompras.map((c) => {
                      const cartao = cartoes.find((ct) => ct.id === c.cartaoId);
                      return (
                        <div
                          key={c.id}
                          className="p-3 rounded-md border bg-card"
                          data-testid={`history-compra-${c.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CreditCard className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{c.descricao}</p>
                                <p className="text-xs text-muted-foreground">
                                  {cartao?.nome ?? "Cartao"} · {c.parcelaAtual}/{c.parcelas}x · {c.dataCompra}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-bold text-blue-600">{formatCurrency(Number(c.valorParcela))}/mês</p>
                                <p className="text-xs text-muted-foreground">Total: {formatCurrency(Number(c.valorTotal))}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Remover vinculo"
                                onClick={() => desvincularCompraMutation.mutate(c.id)}
                                data-testid={`button-desvincular-compra-${c.id}`}
                              >
                                <Trash2 className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {historyServicoPessoas.length > 0 && (
                <>
                  <Separator className="my-5" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Serviços Compartilhados ({historyServicoPessoas.length})
                  </h3>
                  <div className="space-y-2">
                    {historyServicoPessoas.map((sp) => {
                      const servico = servicos.find((s) => s.id === sp.servicoId);
                      const pagAtual = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
                      return (
                        <div
                          key={sp.id}
                          className="p-3 rounded-md border bg-card"
                          data-testid={`history-servico-pessoa-${sp.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Repeat className="w-4 h-4 text-amber-600 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{servico?.nome ?? "Serviço"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(sp.valorDevido))}/mês
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {pagAtual ? (
                                <button
                                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                  onClick={() => reverterServicoPagoMutation.mutate(pagAtual.id)}
                                  data-testid={`button-reverter-servico-pag-${sp.id}`}
                                >
                                  <Check className="w-3 h-3" /> Pago
                                </button>
                              ) : (
                                <button
                                  className="inline-flex items-center text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                                  onClick={() => marcarServicoPagoMutation.mutate({ servicoPessoaId: sp.id, mes: meAtual })}
                                  data-testid={`button-pagar-servico-${sp.id}`}
                                >
                                  Pendente
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="mt-6 pt-4 border-t flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    setSelectedPessoa(historyPessoa);
                    setDividaForm({
                      tipo: historyPessoa.tipo === "me_deve" ? "receber" : "pagar",
                      valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
                    });
                    setOpenDivida(true);
                  }}
                  data-testid="button-add-divida-history"
                >
                  <Plus className="w-4 h-4 mr-2" /> Nova divida
                </Button>
                <Button
                  variant="outline"
                  onClick={() => deleteMutation.mutate(historyPessoa.id)}
                  data-testid="button-delete-history"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
