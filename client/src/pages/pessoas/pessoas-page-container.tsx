import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useLocation } from "wouter";
import { usePessoas } from "@/hooks/usePessoas";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import { CompraCartaoSearchPicker } from "@/components/compra-cartao-search-picker";
import { PaymentTimeline } from "@/pages/pessoas/components/payment-timeline";
import {
  Plus, Users, Phone, Trash2, Search, Receipt, Check,
  Clock, ArrowUpRight, ArrowDownRight, Pencil, CreditCard, Repeat, ChevronRight, AlertTriangle, ExternalLink, RotateCcw, Wallet, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Pessoa, Divida, CompraCartao, Cartao, ServicoPessoa, ServicoPagamento, Servico } from "@shared/schema";
import { format } from "date-fns";
import { formatCurrencyBRL } from "@/utils/formatters";

type PessoaKind = Pessoa["tipo"];

export default function PessoasPage() {
  const { toast } = useToast();
  const { prefs } = useUIPreferences();
  const [, setLocation] = useLocation();
  const [openPessoa, setOpenPessoa] = useState(false);
  const [openDivida, setOpenDivida] = useState(false);
  const [selectedPessoa, setSelectedPessoa] = useState<Pessoa | null>(null);
  const [historyPessoa, setHistoryPessoa] = useState<Pessoa | null>(null);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [payOpen, setPayOpen] = useState(false);
  const [payingDivida, setPayingDivida] = useState<Divida | null>(null);
  const [payForm, setPayForm] = useState({ formaPagamento: "pix" });
  const [abaterSaldoOpen, setAbaterSaldoOpen] = useState(false);
  const [abaterSaldoDivida, setAbaterSaldoDivida] = useState<Divida | null>(null);
  const [abaterSaldoForm, setAbaterSaldoForm] = useState({
    valor: "",
    data: format(new Date(), "yyyy-MM-dd"),
    observacao: "",
  });
  const [abaterSaldoServicoOpen, setAbaterSaldoServicoOpen] = useState(false);
  const [abaterSaldoServicoPessoaId, setAbaterSaldoServicoPessoaId] = useState<string | null>(null);
  const [abaterSaldoServicoForm, setAbaterSaldoServicoForm] = useState({
    mes: format(new Date(), "yyyy-MM"),
    valor: "",
    data: format(new Date(), "yyyy-MM-dd"),
    observacao: "",
  });
  const [saldoForm, setSaldoForm] = useState({
    tipo: "credito" as "credito" | "debito",
    valor: "",
    data: format(new Date(), "yyyy-MM-dd"),
    origem: "manual",
    observacao: "",
    comprovanteReferencia: "",
  });

  const [editingPessoa, setEditingPessoa] = useState<Pessoa | null>(null);
  const [editForm, setEditForm] = useState<{ nome: string; tipo: PessoaKind; telefone: string; observacao: string }>({
    nome: "",
    tipo: "me_deve",
    telefone: "",
    observacao: "",
  });
  const [historyFilter, setHistoryFilter] = useState<"todos" | "pendente">("todos");
  const [historyTab, setHistoryTab] = useState<"resumo" | "pendencias" | "saldo" | "servicos" | "historico">("resumo");
  const [historyVisible, setHistoryVisible] = useState({
    dividas: 8,
    compras: 6,
    servicos: 6,
  });
  const [visiblePessoasCount, setVisiblePessoasCount] = useState(prefs.mobileMode ? 12 : 18);
  const [vincularCompraOpen, setVincularCompraOpen] = useState(false);
  const [compraSelecionadaParaVinculo, setCompraSelecionadaParaVinculo] = useState<string | null>(null);

  const [pessoaForm, setPessoaForm] = useState<{ nome: string; tipo: PessoaKind; telefone: string; observacao: string }>({
    nome: "",
    tipo: "me_deve",
    telefone: "",
    observacao: "",
  });
  const [dividaForm, setDividaForm] = useState({
    tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
  });

  const {
    pessoas,
    dividas,
    comprasCartao,
    cartoes,
    servicoPessoas,
    servicoPagamentos,
    servicos,
    isLoading,
    filtered,
    meAtual,
    historyDividas,
    historyCompras,
    historyServicoPessoas,
    historyStats,
    historySaldo,
    historyTimelineEvents,
    isTimelineLoading,
    isSaldoLoading,
    createPessoaMutation,
    createDividaMutation,
    payMutation,
    reverterDividaPagamentoMutation,
    updatePessoaMutation,
    deleteMutation,
    marcarServicoPagoMutation,
    reverterServicoPagoMutation,
    createSaldoMovimentacaoMutation,
    abaterSaldoDividaMutation,
    abaterSaldoServicoMutation,
    desvincularCompraMutation,
    vincularCompraMutation,
    updateTimelineObservacaoMutation,
    uploadTimelineComprovanteMutation,
    getPessoaStats,
    getPessoaResumoConsolidado,
    duplicatePessoaByName,
  } = usePessoas({
    search,
    filterTipo,
    historyPessoa,
    historyFilter,
  });

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

  const duplicatePessoa = duplicatePessoaByName(pessoaForm.nome);
  const historyResumo = historyPessoa ? getPessoaResumoConsolidado(historyPessoa.id) : null;
  const historyParcelasVencidas = historyResumo
    ? (historyResumo.alertas.parcelasVencidasPessoa ?? historyResumo.alertas.comprasAtrasadas)
    : 0;
  const historySaldoResumo = historySaldo?.resumo ?? (historyResumo ? historyResumo.saldoPessoa : null);
  const historySaldoMovimentacoes = historySaldo?.movimentacoes ?? [];
  const historySaldoDisponivel = historySaldoResumo?.saldoAtual ?? 0;
  const filteredByStatus = filterTipo === "atrasados"
    ? filtered.filter((pessoa) => {
      const resumoPessoa = getPessoaResumoConsolidado(pessoa.id);
      return resumoPessoa.alertas.comprasAtrasadas > 0 || resumoPessoa.dividas.comigo.vencidas > 0;
    })
    : filtered;
  const visiblePessoas = filteredByStatus.slice(0, visiblePessoasCount);
  const hasMorePessoas = filteredByStatus.length > visiblePessoas.length;
  const visibleHistoryDividas = historyDividas.slice(0, historyVisible.dividas);
  const visibleHistoryCompras = historyCompras.slice(0, historyVisible.compras);
  const visibleHistoryServicos = historyServicoPessoas.slice(0, historyVisible.servicos);
  const comprasDisponiveisParaVinculo = historyPessoa
    ? comprasCartao.filter((compra) => compra.pessoaId !== historyPessoa.id)
    : [];
  const contextoVinculoCompraTexto = historyPessoa
    ? [
      historyPessoa.nome,
      ...historyDividas
        .map((divida) => (typeof divida.descricao === "string" ? divida.descricao : ""))
        .filter((descricao) => descricao.trim().length > 0)
        .slice(0, 5),
    ].join(" ")
    : "";

  const getServicoMesCategoria = (mes: string) => `servico_mes:${mes}`;
  const getSaldoAbatidoServicoMes = (servicoPessoaId: string, mes: string) => {
    return historySaldoMovimentacoes.reduce((sum, row) => {
      if (row.tipo !== "debito") return sum;
      if (row.servicoPessoaId !== servicoPessoaId) return sum;
      if ((row.origem ?? "").toLowerCase() !== "abatimento_servico") return sum;
      if ((row.categoria ?? "").toLowerCase() !== getServicoMesCategoria(mes)) return sum;
      return sum + (Number(row.valor) || 0);
    }, 0);
  };

  const handleOpenCompraNoCartao = (cartaoId: string, compraId: string) => {
    const params = new URLSearchParams({
      cartaoId,
      compraId,
      origem: "pessoas",
    });
    setLocation(`/cartoes?${params.toString()}`);
  };

  const handleVincularCompraNaPessoa = () => {
    if (!historyPessoa || !compraSelecionadaParaVinculo) return;

    const compra = comprasCartao.find((item) => item.id === compraSelecionadaParaVinculo) ?? null;
    if (!compra) {
      toast({ title: "Compra não encontrada", variant: "destructive" });
      return;
    }

    if (compra.pessoaId && compra.pessoaId !== historyPessoa.id) {
      const pessoaAtual = pessoas.find((pessoa) => pessoa.id === compra.pessoaId);
      const confirmarTransferencia = window.confirm(
        `Essa compra está vinculada a ${pessoaAtual?.nome ?? "outra pessoa"}. Deseja transferir o vínculo para ${historyPessoa.nome}?`,
      );
      if (!confirmarTransferencia) return;
    }

    vincularCompraMutation.mutate(
      { compraId: compra.id, pessoaId: historyPessoa.id },
      {
        onSuccess: () => {
          setVincularCompraOpen(false);
          setCompraSelecionadaParaVinculo(null);
          toast({ title: "Compra vinculada com sucesso" });
        },
        onError: (err: Error) => {
          toast({ title: "Erro ao vincular compra", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  useEffect(() => {
    setVisiblePessoasCount(prefs.mobileMode ? 12 : 18);
  }, [prefs.mobileMode, search, filterTipo]);

  return (
    <div className="w-full max-w-full overflow-x-hidden p-4 sm:p-6 space-y-5" data-testid="pessoas-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pessoas</h1>
          <p className="text-sm text-muted-foreground">Controle dívidas, compras vinculadas e serviços por pessoa.</p>
        </div>
        <Dialog open={openPessoa} onOpenChange={setOpenPessoa}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" data-testid="button-add-pessoa">
              <Plus className="w-4 h-4 mr-2" /> Adicionar pessoa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Pessoa</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPessoaMutation.mutate(pessoaForm, {
                  onSuccess: () => {
                    setOpenPessoa(false);
                    setPessoaForm({ nome: "", tipo: "me_deve", telefone: "", observacao: "" });
                    toast({ title: "Pessoa adicionada" });
                  },
                  onError: (err: Error) => {
                    const planLimitError = parsePlanLimitError(err);
                    if (planLimitError) {
                      toast({
                        title: "Limite do plano Free atingido",
                        description: buildPlanLimitFriendlyMessage(planLimitError),
                        variant: "destructive",
                      });
                      return;
                    }

                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  },
                });
              }}
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
                <Select value={pessoaForm.tipo} onValueChange={(v) => setPessoaForm({ ...pessoaForm, tipo: v as PessoaKind })}>
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

      <div className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-[200px] sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-search-pessoa"
              className="pl-9 rounded-xl"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Tabs value={filterTipo} onValueChange={setFilterTipo} className="w-full sm:w-auto">
            <TabsList className="mobile-tabs-scroll h-9 w-full sm:w-auto justify-start rounded-xl">
              <TabsTrigger value="todos" data-testid="filter-pessoas-todos">Todos</TabsTrigger>
              <TabsTrigger value="me_deve" data-testid="filter-pessoas-me-devem">Me devem</TabsTrigger>
              <TabsTrigger value="eu_devo" data-testid="filter-pessoas-eu-devo">Eu devo</TabsTrigger>
              <TabsTrigger value="atrasados" data-testid="filter-pessoas-atrasados">Atrasados</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {filteredByStatus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/70 p-8 text-center" data-testid="empty-pessoas">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-semibold">Nenhuma pessoa cadastrada ainda</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione alguém para controlar dívidas, compras compartilhadas e serviços.
          </p>
          <Button
            className="mt-4"
            onClick={() => setOpenPessoa(true)}
            data-testid="button-empty-add-pessoa"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar pessoa
          </Button>
        </div>
      ) : prefs.mobileMode ? (
        <div className="space-y-2.5">
          {visiblePessoas.map((p) => {
            const stats = getPessoaStats(p.id);
            const resumo = getPessoaResumoConsolidado(p.id);
            const parcelasVencidasPessoa = resumo.alertas.parcelasVencidasPessoa ?? resumo.alertas.comprasAtrasadas;
            const isMeDeve = p.tipo === "me_deve";
            const hasAtraso = resumo.alertas.comprasAtrasadas > 0 || resumo.dividas.comigo.vencidas > 0;
            const totalDividasPendente = resumo.dividas.comigo.pendente + resumo.dividas.euDevo.pendente;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden"
                data-testid={`card-pessoa-${p.id}`}
              >
                <div
                  className="flex items-start gap-3 px-3.5 py-3 cursor-pointer"
                  onClick={() => setHistoryPessoa(p)}
                  role="button"
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${isMeDeve ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
                    <span className={`text-sm font-bold ${isMeDeve ? "text-emerald-600" : "text-red-600"}`}>
                      {p.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{p.nome}</p>
                      <Badge variant={isMeDeve ? "default" : "destructive"} className="h-5 text-[10px] px-1.5">
                        {isMeDeve ? "Me deve" : "Eu devo"}
                      </Badge>
                      {hasAtraso && <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                    </div>
                    <p className="text-base font-bold mt-1">{formatCurrencyBRL(resumo.consolidadoPendente)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                      Dívidas {formatCurrencyBRL(totalDividasPendente)} • Compras {formatCurrencyBRL(resumo.comprasVinculadas.pendentePessoa)} • Serviços {formatCurrencyBRL(resumo.servicosMesAtual.pendente)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Saldo {formatCurrencyBRL(resumo.saldoPessoa.saldoAtual)}</span>
                      <span>•</span>
                      <span>{stats.total} dívida(s)</span>
                      {hasAtraso && (
                        <>
                          <span>•</span>
                          <span className="text-red-600">{parcelasVencidasPessoa} parcela(s) vencida(s)</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
                <div className="grid grid-cols-4 border-t border-border/40">
                  <button
                    className="flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium text-primary active:bg-muted/60 transition-colors"
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
                    <Plus className="w-3.5 h-3.5" /> Dívida
                  </button>
                  <button
                    className="flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground active:bg-muted/60 transition-colors"
                    onClick={() => setHistoryPessoa(p)}
                    data-testid={`button-history-pessoa-${p.id}`}
                  >
                    <Clock className="w-3.5 h-3.5" /> Histórico
                  </button>
                  <button
                    className="flex items-center justify-center py-2.5 text-muted-foreground active:bg-muted/60 transition-colors"
                    onClick={() => {
                      setEditingPessoa(p);
                      setEditForm({ nome: p.nome, tipo: p.tipo, telefone: p.telefone || "", observacao: p.observacao || "" });
                    }}
                    data-testid={`button-edit-pessoa-${p.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="flex items-center justify-center py-2.5 text-red-500 active:bg-red-50 dark:active:bg-red-950/30 transition-colors"
                    onClick={() =>
                      deleteMutation.mutate(p.id, {
                        onSuccess: () => {
                          if (historyPessoa?.id === p.id) setHistoryPessoa(null);
                          toast({ title: "Pessoa removida" });
                        },
                        onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                      })
                    }
                    data-testid={`button-delete-pessoa-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visiblePessoas.map((p) => {
            const stats = getPessoaStats(p.id);
            const resumo = getPessoaResumoConsolidado(p.id);
            const parcelasVencidasPessoa = resumo.alertas.parcelasVencidasPessoa ?? resumo.alertas.comprasAtrasadas;
            const comprasVinculadas = resumo.comprasVinculadas.comprasComParcelasReais + resumo.comprasVinculadas.comprasEmFallbackLegado;
            const hasAtraso = resumo.alertas.comprasAtrasadas > 0 || resumo.dividas.comigo.vencidas > 0;
            const totalDividasPendente = resumo.dividas.comigo.pendente + resumo.dividas.euDevo.pendente;
            return (
              <Card key={p.id} className="hover-elevate rounded-2xl" data-testid={`card-pessoa-${p.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
                        <span className="text-sm font-bold text-primary">
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
                    <div className="text-right">
                      <Badge variant={p.tipo === "me_deve" ? "default" : "destructive"} className="text-[11px]">
                        {p.tipo === "me_deve" ? "Me deve" : "Eu devo"}
                      </Badge>
                      <p className="text-lg font-bold mt-2">{formatCurrencyBRL(resumo.consolidadoPendente)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Dívidas {formatCurrencyBRL(totalDividasPendente)} • Compras {formatCurrencyBRL(resumo.comprasVinculadas.pendentePessoa)} • Serviços {formatCurrencyBRL(resumo.servicosMesAtual.pendente)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-400">
                      Saldo + {formatCurrencyBRL(resumo.saldoPessoa.saldoAtual)}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                      {stats.total} dívida(s)
                    </span>
                    {comprasVinculadas > 0 && (
                      <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        Compras vinculadas {comprasVinculadas}
                      </span>
                    )}
                    {resumo.source === "fallback" && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-300">
                        Transição
                      </span>
                    )}
                  </div>

                  {hasAtraso && (
                    <div className="rounded-xl border border-red-300/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{resumo.alertas.comprasAtrasadas} compra(s) atrasada(s) • {parcelasVencidasPessoa} parcela(s) vencida(s)</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8"
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
                      <Plus className="w-3 h-3 mr-1" /> Nova dívida
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setHistoryPessoa(p)}
                      data-testid={`button-history-pessoa-${p.id}`}
                    >
                      <Clock className="w-3 h-3 mr-1" /> Histórico
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
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
                      className="h-8 w-8"
                      onClick={() =>
                        deleteMutation.mutate(p.id, {
                          onSuccess: () => {
                            if (historyPessoa?.id === p.id) setHistoryPessoa(null);
                            toast({ title: "Pessoa removida" });
                          },
                          onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                        })
                      }
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

      {hasMorePessoas && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setVisiblePessoasCount((prev) => prev + (prefs.mobileMode ? 8 : 12))}
            data-testid="button-load-more-pessoas"
          >
            Carregar mais pessoas
          </Button>
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
              updatePessoaMutation.mutate(
                { id: editingPessoa.id, ...editForm },
                {
                  onSuccess: () => {
                    setEditingPessoa(null);
                    toast({ title: "Pessoa atualizada" });
                  },
                  onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                },
              );
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
              <Select value={editForm.tipo} onValueChange={(v) => setEditForm({ ...editForm, tipo: v as PessoaKind })}>
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
              createDividaMutation.mutate(
                { ...dividaForm, pessoaId: selectedPessoa.id },
                {
                  onSuccess: () => {
                    setOpenDivida(false);
                    setDividaForm({
                      tipo: "receber",
                      valor: "",
                      dataVencimento: "",
                      descricao: "",
                      formaPagamento: "pix",
                    });
                    toast({ title: "Dívida registrada" });
                  },
                  onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                },
              );
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

      <Sheet open={!!historyPessoa} onOpenChange={(v) => {
        if (!v) {
          setHistoryPessoa(null);
          setHistoryFilter("todos");
          setHistoryTab("resumo");
          setHistoryVisible({ dividas: 8, compras: 6, servicos: 6 });
          setAbaterSaldoOpen(false);
          setAbaterSaldoDivida(null);
          setAbaterSaldoForm({
            valor: "",
            data: format(new Date(), "yyyy-MM-dd"),
            observacao: "",
          });
          setAbaterSaldoServicoOpen(false);
          setAbaterSaldoServicoPessoaId(null);
          setAbaterSaldoServicoForm({
            mes: format(new Date(), "yyyy-MM"),
            valor: "",
            data: format(new Date(), "yyyy-MM-dd"),
            observacao: "",
          });
          setSaldoForm({
            tipo: "credito",
            valor: "",
            data: format(new Date(), "yyyy-MM-dd"),
            origem: "manual",
            observacao: "",
            comprovanteReferencia: "",
          });
        }
      }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto px-4 sm:px-6">
          {historyPessoa && historyStats && historyResumo && (
            <>
              <SheetHeader className="mb-3 sticky top-0 z-10 bg-background/95 backdrop-blur pb-2 border-b border-border/50">
                <SheetTitle className="text-base sm:text-lg">Histórico — {historyPessoa.nome}</SheetTitle>
              </SheetHeader>

              <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{historyPessoa.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      Total pendente consolidado: {formatCurrencyBRL(historyResumo.consolidadoPendente)}
                    </p>
                  </div>
                  <Badge variant={historyResumo.consolidadoPendente > 0 ? "outline" : "secondary"}>
                    {historyResumo.consolidadoPendente > 0 ? "Em aberto" : "Quitado"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-emerald-500/5 p-2.5">
                    <p className="text-muted-foreground">Saldo positivo</p>
                    <p className="font-semibold text-emerald-600">{formatCurrencyBRL(historyResumo.saldoPessoa.saldoAtual)}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5">
                    <p className="text-muted-foreground">Parcelas pendentes</p>
                    <p className="font-semibold">{historyResumo.alertas.parcelasPendentesPessoa}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5">
                    <p className="text-muted-foreground">Parcelas vencidas</p>
                    <p className="font-semibold text-red-600">{historyParcelasVencidas}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedPessoa(historyPessoa);
                      setDividaForm({
                        tipo: historyPessoa.tipo === "me_deve" ? "receber" : "pagar",
                        valor: "",
                        dataVencimento: "",
                        descricao: "",
                        formaPagamento: "pix",
                      });
                      setOpenDivida(true);
                    }}
                    data-testid="button-quick-add-divida-history"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Nova dívida
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryTab("saldo")}
                    data-testid="button-quick-open-saldo-history"
                  >
                    <Wallet className="w-3.5 h-3.5 mr-1" /> Saldo
                  </Button>
                </div>
              </div>

              <Tabs
                value={historyTab}
                onValueChange={(value) => setHistoryTab(value as typeof historyTab)}
                className="mb-4"
              >
                <TabsList className="mobile-tabs-scroll h-9 w-full justify-start rounded-xl">
                  <TabsTrigger value="resumo" data-testid="tab-history-resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="pendencias" data-testid="tab-history-pendencias">Pendências</TabsTrigger>
                  <TabsTrigger value="saldo" data-testid="tab-history-saldo">Saldo</TabsTrigger>
                  <TabsTrigger value="servicos" data-testid="tab-history-servicos">Serviços</TabsTrigger>
                  <TabsTrigger value="historico" data-testid="tab-history-historico">Histórico</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className={`flex items-center gap-2 mb-5 flex-wrap ${historyTab === "pendencias" || historyTab === "historico" ? "" : "hidden"}`}>
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

              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 ${historyTab === "resumo" ? "" : "hidden"}`}>
                <div className="rounded-md bg-emerald-500/5 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Saldo positivo atual</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrencyBRL(historyResumo.saldoPessoa.saldoAtual)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Créditos / Débitos</p>
                  <p className="text-lg font-bold">
                    {formatCurrencyBRL(historyResumo.saldoPessoa.creditos)} / {formatCurrencyBRL(historyResumo.saldoPessoa.debitos)}
                  </p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total pendente consolidado</p>
                  <p className="text-lg font-bold">{formatCurrencyBRL(historyResumo.consolidadoPendente)}</p>
                </div>
                <div className="rounded-md bg-emerald-500/5 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total pago</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrencyBRL(historyResumo.totalPago)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Dívida pessoal pendente</p>
                  <p className="text-lg font-bold">
                    {formatCurrencyBRL(historyResumo.dividas.comigo.pendente + historyResumo.dividas.euDevo.pendente)}
                  </p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Paguei do meu bolso</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrencyBRL(historyResumo.dividas.pagueiDoMeuBolso.pendente)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Serviços pendentes ({historyResumo.servicosMesAtual.mesReferencia})</p>
                  <p className="text-lg font-bold text-amber-600">{formatCurrencyBRL(historyResumo.servicosMesAtual.pendente)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Parcelas pendentes da pessoa</p>
                  <p className="text-lg font-bold">{historyResumo.alertas.parcelasPendentesPessoa}</p>
                </div>
              </div>

              {historyTab === "resumo" && (historyResumo.alertas.comprasAtrasadas > 0 || historyResumo.dividas.comigo.vencidas > 0) && (
                <div className="mb-6 rounded-md border border-red-300/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Atrasos: {historyResumo.dividas.comigo.vencidas} dívida(s) vencida(s), {historyResumo.alertas.comprasAtrasadas} compra(s) com atraso e {historyParcelasVencidas} parcela(s) vencida(s).
                  </span>
                </div>
              )}

              <div className={`mb-6 rounded-md border border-border/60 p-4 space-y-4 ${historyTab === "saldo" ? "" : "hidden"}`}>
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold">Saldo positivo da pessoa</h3>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-emerald-500/5 p-3">
                    <p className="text-muted-foreground">Saldo atual</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrencyBRL(historySaldoResumo?.saldoAtual ?? 0)}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-muted-foreground">Créditos</p>
                    <p className="text-sm font-bold">{formatCurrencyBRL(historySaldoResumo?.creditos ?? 0)}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-muted-foreground">Débitos</p>
                    <p className="text-sm font-bold">{formatCurrencyBRL(historySaldoResumo?.debitos ?? 0)}</p>
                  </div>
                </div>

                <form
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!historyPessoa) return;
                    createSaldoMovimentacaoMutation.mutate(
                      {
                        pessoaId: historyPessoa.id,
                        payload: {
                          tipo: saldoForm.tipo,
                          valor: saldoForm.valor,
                          data: saldoForm.data,
                          origem: saldoForm.origem,
                          observacao: saldoForm.observacao || null,
                          comprovanteReferencia: saldoForm.comprovanteReferencia || null,
                        },
                      },
                      {
                        onSuccess: () => {
                          setSaldoForm({
                            tipo: "credito",
                            valor: "",
                            data: format(new Date(), "yyyy-MM-dd"),
                            origem: "manual",
                            observacao: "",
                            comprovanteReferencia: "",
                          });
                          toast({ title: "Movimentação de saldo registrada" });
                        },
                        onError: (err: Error) => toast({
                          title: "Erro",
                          description: err.message,
                          variant: "destructive",
                        }),
                      },
                    );
                  }}
                >
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Select
                      value={saldoForm.tipo}
                      onValueChange={(value) => setSaldoForm((prev) => ({ ...prev, tipo: value as "credito" | "debito" }))}
                    >
                      <SelectTrigger data-testid="select-saldo-tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credito">Crédito</SelectItem>
                        <SelectItem value="debito">Débito manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Valor</Label>
                    <Input
                      data-testid="input-saldo-valor"
                      value={saldoForm.valor}
                      onChange={(e) => setSaldoForm((prev) => ({ ...prev, valor: e.target.value }))}
                      placeholder="0,00"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Data</Label>
                    <Input
                      data-testid="input-saldo-data"
                      type="date"
                      value={saldoForm.data}
                      onChange={(e) => setSaldoForm((prev) => ({ ...prev, data: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Origem</Label>
                    <Input
                      data-testid="input-saldo-origem"
                      value={saldoForm.origem}
                      onChange={(e) => setSaldoForm((prev) => ({ ...prev, origem: e.target.value }))}
                      placeholder="manual"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Observação</Label>
                    <Input
                      data-testid="input-saldo-observacao"
                      value={saldoForm.observacao}
                      onChange={(e) => setSaldoForm((prev) => ({ ...prev, observacao: e.target.value }))}
                      placeholder="Detalhe opcional da movimentação"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Comprovante (opcional)</Label>
                    <Input
                      data-testid="input-saldo-comprovante"
                      value={saldoForm.comprovanteReferencia}
                      onChange={(e) => setSaldoForm((prev) => ({ ...prev, comprovanteReferencia: e.target.value }))}
                      placeholder="Link, número ou referência"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="submit"
                      className="w-full"
                      data-testid="button-saldo-registrar"
                      disabled={createSaldoMovimentacaoMutation.isPending}
                    >
                      {createSaldoMovimentacaoMutation.isPending ? "Registrando..." : "Registrar movimentação"}
                    </Button>
                  </div>
                </form>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Histórico de saldo
                  </p>
                  {isSaldoLoading ? (
                    <div className="text-xs text-muted-foreground">Carregando movimentações...</div>
                  ) : historySaldoMovimentacoes.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Nenhuma movimentação de saldo registrada.</div>
                  ) : (
                    <div className="space-y-2">
                      {historySaldoMovimentacoes.map((movimentacao) => {
                        const isCredito = movimentacao.tipo === "credito";
                        return (
                          <div
                            key={movimentacao.id}
                            className="rounded-md border border-border/60 p-3"
                            data-testid={`history-saldo-movimentacao-${movimentacao.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {isCredito ? (
                                    <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <ArrowDownCircle className="w-3.5 h-3.5 text-red-600" />
                                  )}
                                  <span className={`text-xs font-semibold ${isCredito ? "text-emerald-600" : "text-red-600"}`}>
                                    {isCredito ? "Crédito" : "Débito"}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{movimentacao.data}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Origem: {movimentacao.origem || "manual"}
                                </p>
                                {movimentacao.observacao && (
                                  <p className="text-xs text-muted-foreground mt-1">{movimentacao.observacao}</p>
                                )}
                                {movimentacao.comprovanteReferencia && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    Comprovante: {movimentacao.comprovanteReferencia}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-bold ${isCredito ? "text-emerald-600" : "text-red-600"}`}>
                                  {isCredito ? "+" : "-"}{formatCurrencyBRL(Number(movimentacao.valor))}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Saldo: {formatCurrencyBRL(movimentacao.saldoAposMovimentacao ?? 0)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className={`mb-6 ${historyTab === "historico" ? "" : "hidden"}`}>
                <PaymentTimeline
                  events={historyTimelineEvents}
                  isLoading={isTimelineLoading}
                  isSavingObservacao={updateTimelineObservacaoMutation.isPending}
                  isUploadingComprovante={uploadTimelineComprovanteMutation.isPending}
                  onSaveObservacao={async (payload) => {
                    await updateTimelineObservacaoMutation.mutateAsync(payload);
                  }}
                  onUploadComprovante={async (payload) => {
                    await uploadTimelineComprovanteMutation.mutateAsync(payload);
                  }}
                />
              </div>

              <div className={`flex items-center justify-between mb-3 ${historyTab === "pendencias" ? "" : "hidden"}`}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Dívidas ({historyDividas.length})
                </h3>
                <Badge variant={historyResumo.consolidadoPendente > 0 ? "outline" : "secondary"}>
                  {historyResumo.consolidadoPendente > 0 ? "Em aberto" : "Quitado"}
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
                        <p className="text-lg font-bold">{formatCurrencyBRL(Number(payingDivida.valor))}</p>
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
                          payMutation.mutate(
                            { id: payingDivida.id, formaPagamento: payForm.formaPagamento },
                            {
                              onSuccess: () => {
                                setPayOpen(false);
                                setPayingDivida(null);
                                toast({ title: "Marcado como pago" });
                              },
                              onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                            },
                          );
                        }
                      }}
                      disabled={payMutation.isPending}
                    >
                      {payMutation.isPending ? "Processando..." : "Confirmar pagamento"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={abaterSaldoOpen} onOpenChange={setAbaterSaldoOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Abater com saldo positivo</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!historyPessoa || !abaterSaldoDivida) return;
                      abaterSaldoDividaMutation.mutate(
                        {
                          pessoaId: historyPessoa.id,
                          dividaId: abaterSaldoDivida.id,
                          valor: abaterSaldoForm.valor,
                          data: abaterSaldoForm.data,
                          observacao: abaterSaldoForm.observacao || null,
                        },
                        {
                          onSuccess: (result) => {
                            setAbaterSaldoOpen(false);
                            setAbaterSaldoDivida(null);
                            setAbaterSaldoForm({
                              valor: "",
                              data: format(new Date(), "yyyy-MM-dd"),
                              observacao: "",
                            });
                            toast({
                              title: result.quitada ? "Dívida quitada com saldo" : "Saldo aplicado na dívida",
                              description: `Abatido ${formatCurrencyBRL(result.valorAbatido)}.`,
                            });
                          },
                          onError: (err: Error) => toast({
                            title: "Erro",
                            description: err.message,
                            variant: "destructive",
                          }),
                        },
                      );
                    }}
                  >
                    {abaterSaldoDivida && (
                      <div className="rounded-md bg-muted/40 p-3 space-y-1">
                        <p className="text-sm text-muted-foreground">Saldo disponível</p>
                        <p className="text-base font-bold text-emerald-600">{formatCurrencyBRL(historySaldoDisponivel)}</p>
                        <p className="text-sm text-muted-foreground">Pendência da dívida</p>
                        <p className="text-base font-bold">{formatCurrencyBRL(Number(abaterSaldoDivida.valor))}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Valor do abatimento</Label>
                      <Input
                        value={abaterSaldoForm.valor}
                        onChange={(e) => setAbaterSaldoForm((prev) => ({ ...prev, valor: e.target.value }))}
                        placeholder="0,00"
                        required
                        data-testid="input-abater-saldo-valor"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={abaterSaldoForm.data}
                        onChange={(e) => setAbaterSaldoForm((prev) => ({ ...prev, data: e.target.value }))}
                        required
                        data-testid="input-abater-saldo-data"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Observação (opcional)</Label>
                      <Textarea
                        value={abaterSaldoForm.observacao}
                        onChange={(e) => setAbaterSaldoForm((prev) => ({ ...prev, observacao: e.target.value }))}
                        placeholder="Ex.: abatimento de crédito já recebido da pessoa"
                        data-testid="input-abater-saldo-observacao"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={abaterSaldoDividaMutation.isPending}
                      data-testid="button-confirmar-abater-saldo"
                    >
                      {abaterSaldoDividaMutation.isPending ? "Aplicando..." : "Aplicar abatimento"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={abaterSaldoServicoOpen} onOpenChange={setAbaterSaldoServicoOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Abater saldo em serviço</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!historyPessoa || !abaterSaldoServicoPessoaId) return;
                      abaterSaldoServicoMutation.mutate(
                        {
                          pessoaId: historyPessoa.id,
                          servicoPessoaId: abaterSaldoServicoPessoaId,
                          mes: abaterSaldoServicoForm.mes,
                          valor: abaterSaldoServicoForm.valor,
                          data: abaterSaldoServicoForm.data,
                          observacao: abaterSaldoServicoForm.observacao || null,
                        },
                        {
                          onSuccess: (result) => {
                            setAbaterSaldoServicoOpen(false);
                            setAbaterSaldoServicoPessoaId(null);
                            setAbaterSaldoServicoForm({
                              mes: format(new Date(), "yyyy-MM"),
                              valor: "",
                              data: format(new Date(), "yyyy-MM-dd"),
                              observacao: "",
                            });
                            toast({
                              title: result.quitado ? "Serviço quitado com saldo" : "Abatimento parcial em serviço registrado",
                              description: `Mês ${result.mes} · abatido ${formatCurrencyBRL(result.valorAbatido)}.`,
                            });
                          },
                          onError: (err: Error) => toast({
                            title: "Erro",
                            description: err.message,
                            variant: "destructive",
                          }),
                        },
                      );
                    }}
                  >
                    <div className="rounded-md bg-muted/40 p-3 space-y-1">
                      <p className="text-sm text-muted-foreground">Saldo disponível</p>
                      <p className="text-base font-bold text-emerald-600">{formatCurrencyBRL(historySaldoDisponivel)}</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Mês de referência</Label>
                      <Input
                        type="month"
                        value={abaterSaldoServicoForm.mes}
                        onChange={(e) => setAbaterSaldoServicoForm((prev) => ({ ...prev, mes: e.target.value }))}
                        required
                        data-testid="input-abater-saldo-servico-mes"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Valor do abatimento</Label>
                      <Input
                        value={abaterSaldoServicoForm.valor}
                        onChange={(e) => setAbaterSaldoServicoForm((prev) => ({ ...prev, valor: e.target.value }))}
                        placeholder="0,00"
                        required
                        data-testid="input-abater-saldo-servico-valor"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={abaterSaldoServicoForm.data}
                        onChange={(e) => setAbaterSaldoServicoForm((prev) => ({ ...prev, data: e.target.value }))}
                        required
                        data-testid="input-abater-saldo-servico-data"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Observação (opcional)</Label>
                      <Textarea
                        value={abaterSaldoServicoForm.observacao}
                        onChange={(e) => setAbaterSaldoServicoForm((prev) => ({ ...prev, observacao: e.target.value }))}
                        placeholder="Ex.: abatimento de saldo para esse serviço no mês"
                        data-testid="input-abater-saldo-servico-observacao"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={abaterSaldoServicoMutation.isPending}
                      data-testid="button-confirmar-abater-saldo-servico"
                    >
                      {abaterSaldoServicoMutation.isPending ? "Aplicando..." : "Aplicar abatimento"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              {historyTab === "pendencias" && (historyDividas.length === 0 ? (
                <div className="text-center py-6">
                  <Receipt className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhuma divida registrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleHistoryDividas.map((d) => {
                    const isOverdue = d.status === "pendente"
                      && !!d.dataVencimento
                      && d.dataVencimento < format(new Date(), "yyyy-MM-dd");
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
                              {d.observacaoPagamento && (
                                <p className="text-[11px] text-blue-600 mt-1 line-clamp-2">
                                  {d.observacaoPagamento}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`text-sm font-bold ${d.tipo === "receber" ? "text-emerald-600" : "text-red-600"}`}>
                              {formatCurrencyBRL(Number(d.valor))}
                            </span>
                            {d.status === "pago" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                onClick={() =>
                                  reverterDividaPagamentoMutation.mutate(d.id, {
                                    onSuccess: () => toast({ title: "Dívida marcada como pendente" }),
                                    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                                  })
                                }
                                disabled={reverterDividaPagamentoMutation.isPending}
                                title="Marcar como não paga"
                                data-testid={`button-unpay-history-${d.id}`}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Pago
                              </Button>
                            ) : (
                              <>
                                {d.tipo === "receber" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => {
                                      setAbaterSaldoDivida(d);
                                      setAbaterSaldoForm({
                                        valor: "",
                                        data: format(new Date(), "yyyy-MM-dd"),
                                        observacao: "",
                                      });
                                      setAbaterSaldoOpen(true);
                                    }}
                                    disabled={abaterSaldoDividaMutation.isPending || historySaldoDisponivel <= 0}
                                    title="Usar saldo positivo da pessoa para abater a dívida"
                                    data-testid={`button-abater-saldo-divida-${d.id}`}
                                  >
                                    <Wallet className="w-3 h-3 mr-1" />
                                    Abater saldo
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => { setPayingDivida(d); setPayOpen(true); }}
                                  data-testid={`button-pay-history-${d.id}`}
                                >
                                  <Check className="w-4 h-4 text-emerald-600" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {historyTab === "pendencias" && historyDividas.length > visibleHistoryDividas.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setHistoryVisible((prev) => ({ ...prev, dividas: prev.dividas + 8 }))}
                  data-testid="button-load-more-dividas-history"
                >
                  Carregar mais dívidas
                </Button>
              )}

              {historyTab === "pendencias" && (
              <>
                <Separator className="my-5" />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Compras de Cartao ({historyCompras.length})
                  </h3>
                  <Dialog
                    open={vincularCompraOpen}
                    onOpenChange={(value) => {
                      setVincularCompraOpen(value);
                      if (!value) {
                        setCompraSelecionadaParaVinculo(null);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCompraSelecionadaParaVinculo(null)}
                        data-testid="button-vincular-compra-pessoa"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Vincular compra
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Vincular compra de cartão</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Selecione uma compra para vincular com {historyPessoa.nome}. O vínculo continua manual e auditável.
                        </p>
                        <CompraCartaoSearchPicker
                          compras={comprasDisponiveisParaVinculo}
                          cartoes={cartoes}
                          pessoas={pessoas}
                          value={compraSelecionadaParaVinculo}
                          onValueChange={setCompraSelecionadaParaVinculo}
                          placeholder="Buscar compra para vincular"
                          noneLabel="Nenhuma compra selecionada"
                          context={{
                            text: contextoVinculoCompraTexto,
                          }}
                          testId="select-vincular-compra-pessoa"
                        />
                        <Button
                          type="button"
                          className="w-full"
                          onClick={handleVincularCompraNaPessoa}
                          disabled={!compraSelecionadaParaVinculo || vincularCompraMutation.isPending}
                          data-testid="button-confirm-vincular-compra-pessoa"
                        >
                          {vincularCompraMutation.isPending ? "Vinculando..." : "Confirmar vínculo"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {historyCompras.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Nenhuma compra vinculada no momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleHistoryCompras.map((c) => {
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
                                <p className="text-sm font-bold text-blue-600">{formatCurrencyBRL(Number(c.valorParcela))}/mês</p>
                                <p className="text-xs text-muted-foreground">Total: {formatCurrencyBRL(Number(c.valorTotal))}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Abrir no cartão"
                                onClick={() => handleOpenCompraNoCartao(c.cartaoId, c.id)}
                                data-testid={`button-abrir-compra-cartao-${c.id}`}
                              >
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Remover vinculo"
                                onClick={() =>
                                  desvincularCompraMutation.mutate(c.id, {
                                    onSuccess: () => toast({ title: "Vínculo removido" }),
                                    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                                  })
                                }
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
                )}
              </>
              )}

              {historyTab === "pendencias" && historyCompras.length > visibleHistoryCompras.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setHistoryVisible((prev) => ({ ...prev, compras: prev.compras + 6 }))}
                  data-testid="button-load-more-compras-history"
                >
                  Carregar mais compras
                </Button>
              )}

              {historyTab === "servicos" && historyServicoPessoas.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Nenhum serviço compartilhado para essa pessoa.
                </div>
              )}

              {historyTab === "servicos" && historyServicoPessoas.length > 0 && (
                <>
                  <Separator className="my-5" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Serviços Compartilhados ({historyServicoPessoas.length})
                  </h3>
                  <div className="space-y-2">
                    {visibleHistoryServicos.map((sp) => {
                      const servico = servicos.find((s) => s.id === sp.servicoId);
                      const pagamentosMesAtual = servicoPagamentos.filter((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
                      const pagAtual =
                        pagamentosMesAtual.find((p) => p.status === "pago")
                        ?? pagamentosMesAtual.find((p) => p.status === "parcial")
                        ?? pagamentosMesAtual[0];
                      const valorDevidoMes = Number(sp.valorDevido) || 0;
                      const saldoAbatidoMesAtual = getSaldoAbatidoServicoMes(sp.id, meAtual);
                      const isPagoMesAtual = pagAtual?.status === "pago";
                      const isParcialMesAtual = !isPagoMesAtual && (pagAtual?.status === "parcial" || saldoAbatidoMesAtual > 0);
                      const pendenteMesAtual = Math.max(
                        0,
                        valorDevidoMes - (isPagoMesAtual ? valorDevidoMes : saldoAbatidoMesAtual),
                      );
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
                                  {formatCurrencyBRL(Number(sp.valorDevido))}/mês
                                </p>
                                {isParcialMesAtual && (
                                  <p className="text-[11px] text-blue-600 mt-0.5">
                                    Parcial no mês {meAtual}: abatido {formatCurrencyBRL(saldoAbatidoMesAtual)} · pendente {formatCurrencyBRL(pendenteMesAtual)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isPagoMesAtual ? (
                                <button
                                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                  onClick={() => {
                                    if (saldoAbatidoMesAtual > 0) return;
                                    reverterServicoPagoMutation.mutate(pagAtual.id, {
                                      onSuccess: () => toast({ title: "Pagamento revertido" }),
                                      onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                                    });
                                  }}
                                  data-testid={`button-reverter-servico-pag-${sp.id}`}
                                  disabled={saldoAbatidoMesAtual > 0}
                                >
                                  <Check className="w-3 h-3" /> {saldoAbatidoMesAtual > 0 ? "Pago via saldo" : "Pago"}
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="inline-flex items-center text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                                    onClick={() => {
                                      setAbaterSaldoServicoPessoaId(sp.id);
                                      setAbaterSaldoServicoForm({
                                        mes: meAtual,
                                        valor: "",
                                        data: format(new Date(), "yyyy-MM-dd"),
                                        observacao: "",
                                      });
                                      setAbaterSaldoServicoOpen(true);
                                    }}
                                    disabled={abaterSaldoServicoMutation.isPending || historySaldoDisponivel <= 0 || pendenteMesAtual <= 0}
                                    data-testid={`button-abater-saldo-servico-${sp.id}`}
                                  >
                                    <Wallet className="w-3 h-3 mr-1" />
                                    Abater saldo
                                  </button>
                                  <button
                                    className="inline-flex items-center text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                                    onClick={() =>
                                      marcarServicoPagoMutation.mutate(
                                        { servicoPessoaId: sp.id, mes: meAtual },
                                        {
                                          onSuccess: () => toast({ title: "Pagamento de serviço registrado" }),
                                          onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                                        },
                                      )
                                    }
                                    data-testid={`button-pagar-servico-${sp.id}`}
                                  >
                                    {isParcialMesAtual ? "Parcial" : "Pendente"}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {historyTab === "servicos" && historyServicoPessoas.length > visibleHistoryServicos.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setHistoryVisible((prev) => ({ ...prev, servicos: prev.servicos + 6 }))}
                  data-testid="button-load-more-servicos-history"
                >
                  Carregar mais serviços
                </Button>
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
                  onClick={() =>
                    deleteMutation.mutate(historyPessoa.id, {
                      onSuccess: () => {
                        setHistoryPessoa(null);
                        toast({ title: "Pessoa removida" });
                      },
                      onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                    })
                  }
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
