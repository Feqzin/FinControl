import { useEffect, useState } from "react";
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
import { PessoasPageHeader } from "@/components/pessoas/PessoasPageHeader";
import { PessoasSummarySection } from "@/components/pessoas/PessoasSummarySection";
import { PessoasFilterBar } from "@/components/pessoas/PessoasFilterBar";
import { PessoasGrid } from "@/components/pessoas/PessoasGrid";
import { PessoasEmptyState } from "@/components/pessoas/PessoasEmptyState";
import { PessoasDialogs } from "@/components/pessoas/PessoasDialogs";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import { CompraCartaoSearchPicker } from "@/components/compra-cartao-search-picker";
import { PaymentTimeline } from "@/pages/pessoas/components/payment-timeline";
import { sortPessoasForView, type PessoaSortBy } from "@/pages/pessoas/pessoas-sort.utils";
import {
  Plus, Trash2, Receipt, Check,
  ArrowUpRight, ArrowDownRight, CreditCard, Repeat, AlertTriangle, ExternalLink, RotateCcw, Wallet, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Pessoa, Divida, CompraCartao, Cartao, ServicoPessoa, ServicoPagamento, Servico } from "@shared/schema";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import { format } from "date-fns";
import { formatCurrencyBRL } from "@/utils/formatters";

type PessoaKind = Pessoa["tipo"];

const EMPTY_PESSOA_RESUMO = {
  consolidadoPendente: 0,
  totalPago: 0,
  dividas: {
    comigo: { pendente: 0, pago: 0, vencidas: 0, quantidadePendentes: 0 },
    euDevo: { pendente: 0, pago: 0, vencidas: 0, quantidadePendentes: 0 },
  },
  comprasVinculadas: { pendentePessoa: 0 },
  servicosMesAtual: { pendente: 0 },
  alertas: { comprasAtrasadas: 0 },
  saldoPessoa: { saldoAtual: 0 },
} as const;

export default function PessoasPage() {
  const { toast } = useToast();
  const { prefs } = useUIPreferences();
  const [, setLocation] = useLocation();
  const [openPessoa, setOpenPessoa] = useState(false);
  const [openDivida, setOpenDivida] = useState(false);
  const [openOrphanRecovery, setOpenOrphanRecovery] = useState(false);
  const [selectedPessoa, setSelectedPessoa] = useState<Pessoa | null>(null);
  const [historyPessoa, setHistoryPessoa] = useState<Pessoa | null>(null);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [sortBy, setSortBy] = useState<PessoaSortBy>("nome_az");
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
  const [historyTab, setHistoryTab] = useState<"visao_geral" | "pendencias" | "saldo" | "servicos" | "historico">("visao_geral");
  const [historyVisible, setHistoryVisible] = useState({
    dividas: 8,
    compras: 6,
    servicos: 6,
  });
  const [visiblePessoasCount, setVisiblePessoasCount] = useState(prefs.mobileMode ? 12 : 18);
  const [vincularCompraOpen, setVincularCompraOpen] = useState(false);
  const [compraSelecionadaParaVinculo, setCompraSelecionadaParaVinculo] = useState<string | null>(null);
  const [orphanFormByKey, setOrphanFormByKey] = useState<Record<string, { nome: string; pessoaIdExistente: string }>>({});
  const [ignoredOrphanGroups, setIgnoredOrphanGroups] = useState<string[]>([]);

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
    orphanGroups,
    isOrphanGroupsLoading,
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
    restorePessoaMutation,
    recoverOrphanLinksMutation,
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
  const isRemovedFilter = filterTipo === "removidas";

  useEffect(() => {
    setVisiblePessoasCount(prefs.mobileMode ? 12 : 18);
  }, [prefs.mobileMode, search, filterTipo, sortBy]);

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
  const historyDividasPendentes = historyResumo
    ? historyResumo.dividas.comigo.pendente + historyResumo.dividas.euDevo.pendente
    : 0;
  const historyComprasPendentes = historyResumo?.comprasVinculadas.pendentePessoa ?? 0;
  const historyServicosPendentes = historyResumo?.servicosMesAtual.pendente ?? 0;
  const historySaldoCreditos = historyResumo?.saldoPessoa.saldoAtual ?? 0;
  const composicaoPendenteItems = [
    { key: "dividas", label: "Dívida pessoal", colorClass: "bg-blue-500", valor: historyDividasPendentes },
    { key: "cartao", label: "Cartão / compras", colorClass: "bg-violet-500", valor: historyComprasPendentes },
    { key: "servicos", label: "Serviços", colorClass: "bg-amber-500", valor: historyServicosPendentes },
  ].filter((item) => item.valor > 0);
  const composicaoPendenteTotal = composicaoPendenteItems.reduce((sum, item) => sum + item.valor, 0);
  const composicaoPrincipal = composicaoPendenteItems.length > 0
    ? [...composicaoPendenteItems].sort((a, b) => b.valor - a.valor)[0]
    : null;
  const hasVisaoComposicao = composicaoPendenteItems.length > 0 || historySaldoCreditos > 0;
  const progressoTotalBase = (historyResumo?.totalPago ?? 0) + (historyResumo?.consolidadoPendente ?? 0);
  const hasVisaoProgresso = progressoTotalBase > 0;
  const progressoPagoPercent = hasVisaoProgresso
    ? Math.round(((historyResumo?.totalPago ?? 0) / progressoTotalBase) * 100)
    : 0;
  const progressoPendentePercent = hasVisaoProgresso ? Math.max(0, 100 - progressoPagoPercent) : 0;
  const insightVisaoGeral = !historyResumo
    ? ""
    : historyResumo.consolidadoPendente <= 0
      ? "Sem pendências em aberto no momento. O relacionamento está equilibrado."
      : (historyResumo.alertas.comprasAtrasadas > 0 || historyResumo.dividas.comigo.vencidas > 0 || historyParcelasVencidas > 0)
        ? `Atenção aos atrasos: ${historyParcelasVencidas} parcela(s) vencida(s) e ${historyResumo.dividas.comigo.vencidas} dívida(s) pessoal(is) vencida(s).`
        : historySaldoCreditos > 0
          ? `Há ${formatCurrencyBRL(historySaldoCreditos)} de saldo positivo disponível para abatimentos.`
          : composicaoPrincipal
            ? `Maior impacto atual em ${composicaoPrincipal.label.toLowerCase()}: ${formatCurrencyBRL(composicaoPrincipal.valor)}.`
            : "Acompanhe as pendências por origem para priorizar os próximos pagamentos.";
  const filteredByStatus = isRemovedFilter
    ? filtered
    : filterTipo === "atrasados"
    ? filtered.filter((pessoa) => {
      const resumoPessoa = (() => {
        try {
          return getPessoaResumoConsolidado(pessoa.id);
        } catch {
          return EMPTY_PESSOA_RESUMO;
        }
      })();
      return resumoPessoa.alertas.comprasAtrasadas > 0 || resumoPessoa.dividas.comigo.vencidas > 0;
    })
    : filtered;
  const sortedFilteredByStatus = sortPessoasForView(filteredByStatus, {
    sortBy,
    getMetrics: (pessoaId) => {
      if (isRemovedFilter) {
        return {
          saldo: 0,
          valorReceber: 0,
          valorPagar: 0,
        };
      }
      const resumo = (() => {
        try {
          return getPessoaResumoConsolidado(pessoaId);
        } catch {
          return EMPTY_PESSOA_RESUMO;
        }
      })();
      return {
        saldo: resumo.saldoPessoa.saldoAtual ?? 0,
        valorReceber:
          (resumo.dividas.comigo.pendente ?? 0)
          + (resumo.comprasVinculadas.pendentePessoa ?? 0)
          + (resumo.servicosMesAtual.pendente ?? 0),
        valorPagar: resumo.dividas.euDevo.pendente ?? 0,
      };
    },
  });
  const headerTotalPessoas = filteredByStatus.length;
  const headerTotalPendente = isRemovedFilter
    ? 0
    : filteredByStatus.reduce((sum, pessoa) => {
      const resumo = getPessoaResumoConsolidado(pessoa.id);
      return sum + resumo.consolidadoPendente;
    }, 0);
  const headerTotalAReceber = isRemovedFilter
    ? 0
    : filteredByStatus.reduce((sum, pessoa) => {
      const resumo = getPessoaResumoConsolidado(pessoa.id);
      return sum + resumo.dividas.comigo.pendente + resumo.comprasVinculadas.pendentePessoa + resumo.servicosMesAtual.pendente;
    }, 0);
  const visiblePessoas = sortedFilteredByStatus.slice(0, visiblePessoasCount);
  const hasMorePessoas = sortedFilteredByStatus.length > visiblePessoas.length;
  const visibleOrphanGroups = orphanGroups.filter(
    (group) => !ignoredOrphanGroups.includes(group.orphanGroupKey),
  );
  const pessoasAtivasParaVinculo = pessoas.filter((pessoa) => !pessoa.deletedAt);
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

  const handleAddDividaFromPessoa = (pessoa: Pessoa) => {
    setSelectedPessoa(pessoa);
    setDividaForm({
      tipo: pessoa.tipo === "me_deve" ? "receber" : "pagar",
      valor: "",
      dataVencimento: "",
      descricao: "",
      formaPagamento: "pix",
    });
    setOpenDivida(true);
  };

  const handleEditPessoa = (pessoa: Pessoa) => {
    setEditingPessoa(pessoa);
    setEditForm({
      nome: pessoa.nome,
      tipo: pessoa.tipo,
      telefone: pessoa.telefone || "",
      observacao: pessoa.observacao || "",
    });
  };

  const handleDeletePessoa = (pessoa: Pessoa) => {
    const confirmed = window.confirm(
      "Remover esta pessoa da lista? Você poderá restaurá-la depois em Pessoas removidas.",
    );
    if (!confirmed) return;

    deleteMutation.mutate(pessoa.id, {
      onSuccess: () => {
        if (historyPessoa?.id === pessoa.id) {
          setHistoryPessoa(null);
        }
        toast({ title: "Pessoa removida" });
      },
      onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleRestorePessoa = (pessoa: Pessoa) => {
    restorePessoaMutation.mutate(pessoa.id, {
      onSuccess: () => {
        if (historyPessoa?.id === pessoa.id) {
          setHistoryPessoa(null);
        }
        toast({ title: "Pessoa restaurada" });
      },
      onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const getOrphanForm = (orphanGroupKey: string, nomeSugerido: string) => {
    return orphanFormByKey[orphanGroupKey] ?? { nome: nomeSugerido, pessoaIdExistente: "" };
  };

  const setOrphanFormValue = (
    orphanGroupKey: string,
    nomeSugerido: string,
    patch: Partial<{ nome: string; pessoaIdExistente: string }>,
  ) => {
    const current = getOrphanForm(orphanGroupKey, nomeSugerido);
    setOrphanFormByKey((prev) => ({
      ...prev,
      [orphanGroupKey]: {
        nome: patch.nome ?? current.nome,
        pessoaIdExistente: patch.pessoaIdExistente ?? current.pessoaIdExistente,
      },
    }));
  };

  const handleRecoverOrphanAsNewPessoa = (orphanGroupKey: string, nomeSugerido: string) => {
    const form = getOrphanForm(orphanGroupKey, nomeSugerido);
    const nome = form.nome.trim();
    if (!nome) {
      toast({ title: "Informe um nome para recuperar os vínculos", variant: "destructive" });
      return;
    }

    recoverOrphanLinksMutation.mutate(
      { orphanGroupKey, nome },
      {
        onSuccess: (result) => {
          toast({
            title: result.createdPessoa ? "Pessoa recuperada com sucesso" : "Vínculos recuperados com sucesso",
            description: `${result.linkedDividasCount} dívida(s), ${result.linkedComprasCount} compra(s) e ${result.linkedServicosCount} serviço(s) vinculados.`,
          });
          setIgnoredOrphanGroups((prev) => [...prev, orphanGroupKey]);
        },
        onError: (err: Error) => {
          toast({ title: "Erro ao recuperar vínculos", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  const handleRecoverOrphanToExistingPessoa = (orphanGroupKey: string, nomeSugerido: string) => {
    const form = getOrphanForm(orphanGroupKey, nomeSugerido);
    const pessoaIdExistente = form.pessoaIdExistente.trim();
    if (!pessoaIdExistente) {
      toast({ title: "Selecione uma pessoa de destino", variant: "destructive" });
      return;
    }

    recoverOrphanLinksMutation.mutate(
      { orphanGroupKey, pessoaIdExistente },
      {
        onSuccess: (result) => {
          toast({
            title: "Vínculos recuperados com sucesso",
            description: `${result.linkedDividasCount} dívida(s), ${result.linkedComprasCount} compra(s) e ${result.linkedServicosCount} serviço(s) vinculados.`,
          });
          setIgnoredOrphanGroups((prev) => [...prev, orphanGroupKey]);
        },
        onError: (err: Error) => {
          toast({ title: "Erro ao recuperar vínculos", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="app-page-shell app-section-stack" data-testid="pessoas-page">
      <PessoasPageHeader
        onAddPessoa={() => setOpenPessoa(true)}
        totalPessoas={headerTotalPessoas}
        totalPendente={headerTotalPendente}
        totalAReceber={headerTotalAReceber}
      />

      <PessoasFilterBar
        search={search}
        filterTipo={filterTipo}
        sortBy={sortBy}
        onSearchChange={setSearch}
        onFilterChange={setFilterTipo}
        onSortChange={setSortBy}
      />

      {!isRemovedFilter && !isOrphanGroupsLoading && visibleOrphanGroups.length > 0 && (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Encontramos vínculos sem pessoa cadastrada.
                Revise para restaurar os relacionamentos das dívidas e vínculos antigos.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-amber-400/70 bg-white/80 text-amber-900 hover:bg-white dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100"
              onClick={() => setOpenOrphanRecovery(true)}
              data-testid="button-review-orphan-links"
            >
              Revisar vínculos
            </Button>
          </div>
        </div>
      )}

      {sortedFilteredByStatus.length === 0 ? (
        <PessoasEmptyState
          onAddPessoa={isRemovedFilter ? undefined : () => setOpenPessoa(true)}
          title={isRemovedFilter ? "Nenhuma pessoa removida." : undefined}
          description={isRemovedFilter
            ? "Pessoas removidas aparecerão aqui para restauração."
            : undefined}
          actionLabel={isRemovedFilter ? undefined : "Adicionar pessoa"}
        />
      ) : (
        <PessoasGrid
          pessoas={visiblePessoas}
          mobileMode={prefs.mobileMode}
          getPessoaResumoConsolidado={getPessoaResumoConsolidado}
          getPessoaStats={getPessoaStats}
          onAddDivida={handleAddDividaFromPessoa}
          onOpenHistory={setHistoryPessoa}
          onEdit={handleEditPessoa}
          onDelete={handleDeletePessoa}
          showRemovedActions={isRemovedFilter}
          onRestore={handleRestorePessoa}
        />
      )}

      <PessoasSummarySection
        hasMorePessoas={hasMorePessoas}
        onLoadMore={() => setVisiblePessoasCount((prev) => prev + (prefs.mobileMode ? 8 : 12))}
      />

      <PessoasDialogs>
      <Dialog open={openPessoa} onOpenChange={setOpenPessoa}>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Dialog open={openOrphanRecovery} onOpenChange={setOpenOrphanRecovery}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar vínculos órfãos</DialogTitle>
          </DialogHeader>
          {visibleOrphanGroups.length === 0 ? (
            <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              Nenhum vínculo órfão pendente para revisão.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrphanGroups.map((group) => {
                const form = getOrphanForm(group.orphanGroupKey, group.nomeSugerido);
                return (
                  <div key={group.orphanGroupKey} className="rounded-lg border border-border/70 bg-background/95 p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{group.nomeSugerido}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.dividasCount} dívida(s) · {group.linkedComprasCount} compra(s) · {group.linkedServicosCount} serviço(s)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          A receber: {formatCurrencyBRL(group.totalAReceber)} · A pagar: {formatCurrencyBRL(group.totalAPagar)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIgnoredOrphanGroups((prev) => [...prev, group.orphanGroupKey])}
                      >
                        Ignorar
                      </Button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Nome para restaurar</Label>
                        <Input
                          value={form.nome}
                          onChange={(event) => setOrphanFormValue(group.orphanGroupKey, group.nomeSugerido, { nome: event.target.value })}
                          placeholder="Nome da pessoa"
                          data-testid={`input-orphan-name-${group.orphanGroupKey}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Vincular a pessoa existente</Label>
                        <Select
                          value={form.pessoaIdExistente || undefined}
                          onValueChange={(value) => setOrphanFormValue(group.orphanGroupKey, group.nomeSugerido, { pessoaIdExistente: value })}
                        >
                          <SelectTrigger data-testid={`select-orphan-person-${group.orphanGroupKey}`}>
                            <SelectValue placeholder="Selecione uma pessoa" />
                          </SelectTrigger>
                          <SelectContent>
                            {pessoasAtivasParaVinculo.map((pessoa) => (
                              <SelectItem key={pessoa.id} value={pessoa.id}>
                                {pessoa.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {group.exemplos.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Exemplo: {group.exemplos[0].descricao?.trim() || `Dívida ${group.exemplos[0].dividaId.slice(0, 8)}`}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleRecoverOrphanAsNewPessoa(group.orphanGroupKey, group.nomeSugerido)}
                        disabled={recoverOrphanLinksMutation.isPending}
                        data-testid={`button-recover-orphan-new-${group.orphanGroupKey}`}
                      >
                        Restaurar como pessoa
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleRecoverOrphanToExistingPessoa(group.orphanGroupKey, group.nomeSugerido)}
                        disabled={recoverOrphanLinksMutation.isPending}
                        data-testid={`button-recover-orphan-existing-${group.orphanGroupKey}`}
                      >
                        Vincular a pessoa existente
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyPessoa} onOpenChange={(v) => {
        if (!v) {
          setHistoryPessoa(null);
          setHistoryFilter("todos");
          setHistoryTab("visao_geral");
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
              <SheetHeader className="mb-4 border-b border-border/50 pb-2">
                <SheetTitle className="text-base sm:text-lg">Histórico de {historyPessoa.nome}</SheetTitle>
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
                  <TabsTrigger value="visao_geral" data-testid="tab-history-resumo">Visão geral</TabsTrigger>
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

              <div className={`space-y-3 mb-3 ${historyTab === "visao_geral" ? "" : "hidden"}`}>
                {hasVisaoComposicao && (
                  <div className="rounded-md border border-border/60 bg-card p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Composição do pendente</p>
                      <Badge variant="outline" className="text-[11px]">
                        {formatCurrencyBRL(historyResumo.consolidadoPendente)}
                      </Badge>
                    </div>
                    {composicaoPendenteItems.length > 0 && composicaoPendenteTotal > 0 && (
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
                        <div className="h-full flex">
                          {composicaoPendenteItems.map((item) => (
                            <div
                              key={item.key}
                              className={item.colorClass}
                              style={{ width: `${(item.valor / composicaoPendenteTotal) * 100}%` }}
                              aria-hidden
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {composicaoPendenteItems.map((item) => (
                        <div key={item.key} className="rounded-md bg-muted/40 px-2.5 py-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-muted-foreground">
                            <span className={`h-2 w-2 rounded-full ${item.colorClass}`} />
                            {item.label}
                          </span>
                          <span className="font-semibold text-foreground">{formatCurrencyBRL(item.valor)}</span>
                        </div>
                      ))}
                      {historySaldoCreditos > 0 && (
                        <div className="rounded-md bg-emerald-500/5 px-2.5 py-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Saldo / créditos disponíveis
                          </span>
                          <span className="font-semibold text-emerald-700">{formatCurrencyBRL(historySaldoCreditos)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {hasVisaoProgresso && (
                  <div className="rounded-md border border-border/60 bg-card p-3 space-y-2.5">
                    <p className="text-sm font-semibold">Evolução financeira</p>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <div className="h-full flex">
                        <div className="bg-emerald-500" style={{ width: `${progressoPagoPercent}%` }} aria-hidden />
                        <div className="bg-amber-500" style={{ width: `${progressoPendentePercent}%` }} aria-hidden />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-emerald-500/5 px-2.5 py-2 flex items-center justify-between">
                        <span className="text-emerald-700">Total pago</span>
                        <span className="font-semibold text-emerald-700">
                          {formatCurrencyBRL(historyResumo.totalPago)} ({progressoPagoPercent}%)
                        </span>
                      </div>
                      <div className="rounded-md bg-amber-500/5 px-2.5 py-2 flex items-center justify-between">
                        <span className="text-amber-700">Total pendente</span>
                        <span className="font-semibold text-amber-700">
                          {formatCurrencyBRL(historyResumo.consolidadoPendente)} ({progressoPendentePercent}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {insightVisaoGeral && (
                  <div className="rounded-md border border-blue-200/60 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-900">
                    <p className="font-medium mb-1">Insight</p>
                    <p>{insightVisaoGeral}</p>
                  </div>
                )}
              </div>

              {historyTab === "visao_geral" && (historyResumo.alertas.comprasAtrasadas > 0 || historyResumo.dividas.comigo.vencidas > 0) && (
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
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
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
                                  aria-label="Marcar dívida como paga"
                                  title="Marcar como paga"
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
                      const reembolso = buildCompraReembolsoBreakdown(c);
                      const valorMensalPessoa = reembolso.reembolsoPorParcela[c.parcelaAtual - 1] ?? 0;
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
                                <p className="text-sm font-bold text-blue-600">{formatCurrencyBRL(valorMensalPessoa)}/mês</p>
                                <p className="text-xs text-muted-foreground">Total a reembolsar: {formatCurrencyBRL(reembolso.reembolsoPessoa)}</p>
                                <p className="text-xs text-muted-foreground">Compra no cartão: {formatCurrencyBRL(reembolso.valorCompra)}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Abrir compra no cartão"
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
                                aria-label="Remover vínculo da compra"
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
                {!historyPessoa.deletedAt && (
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
                )}
                <Button
                  variant={historyPessoa.deletedAt ? "default" : "outline"}
                  onClick={() => {
                    if (historyPessoa.deletedAt) {
                      handleRestorePessoa(historyPessoa);
                      return;
                    }

                    const confirmed = window.confirm(
                      "Remover esta pessoa da lista? Você poderá restaurá-la depois em Pessoas removidas.",
                    );
                    if (!confirmed) return;

                    deleteMutation.mutate(historyPessoa.id, {
                      onSuccess: () => {
                        setHistoryPessoa(null);
                        toast({ title: "Pessoa removida" });
                      },
                      onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
                    });
                  }}
                  data-testid={historyPessoa.deletedAt ? "button-restore-history" : "button-delete-history"}
                >
                  {historyPessoa.deletedAt ? "Restaurar pessoa" : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      </PessoasDialogs>
    </div>
  );
}

