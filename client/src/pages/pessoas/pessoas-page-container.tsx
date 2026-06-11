import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { usePessoas } from "@/hooks/usePessoas";
import { PessoasDialogs } from "@/components/pessoas/PessoasDialogs";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import { CompraCartaoSearchPicker } from "@/components/compra-cartao-search-picker";
import {
  OrphanLinksAlert,
  PessoasHistoryBalanceSummary,
  PaymentTimeline,
  PessoasHistoryOverviewSection,
  PessoasHistorySheetSummary,
  PessoasListSection,
  PessoasPageToolbar,
} from "@/pages/pessoas/components";
import {
  EditPessoaDialog,
  NewPessoaDialog,
  OrphanRecoveryDialog,
  PayDividaDialog,
} from "@/pages/pessoas/dialogs";
import {
  usePessoasDialogState,
  usePessoasFilters,
  usePessoasPaginationState,
} from "@/pages/pessoas/hooks";
import { sortPessoasForView } from "@/pages/pessoas/pessoas-sort.utils";
import {
  Plus, Trash2, Receipt, Check,
  ArrowUpRight, ArrowDownRight, CreditCard, Repeat, ExternalLink, RotateCcw, Wallet, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { useUIPreferences } from "@/context/ui-preferences";
import type { Pessoa, Divida, CompraCartao, Cartao, ServicoPessoa, ServicoPagamento, Servico } from "@shared/schema";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import { format } from "date-fns";
import { formatCurrencyBRL } from "@/utils/formatters";
import { FintechLoadingPageHeader, FintechLoadingSurface } from "@/components/layout/fintech-loading-shell";

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
  const {
    search,
    setSearch,
    filterTipo,
    setFilterTipo,
    sortBy,
    setSortBy,
    isRemovedFilter,
  } = usePessoasFilters();
  const {
    openPessoa,
    setOpenPessoa,
    openDivida,
    setOpenDivida,
    openOrphanRecovery,
    setOpenOrphanRecovery,
    selectedPessoa,
    setSelectedPessoa,
    historyPessoa,
    setHistoryPessoa,
    payOpen,
    setPayOpen,
    payingDivida,
    setPayingDivida,
    abaterSaldoOpen,
    setAbaterSaldoOpen,
    abaterSaldoDivida,
    setAbaterSaldoDivida,
    abaterSaldoServicoOpen,
    setAbaterSaldoServicoOpen,
    abaterSaldoServicoPessoaId,
    setAbaterSaldoServicoPessoaId,
    editingPessoa,
    setEditingPessoa,
    vincularCompraOpen,
    setVincularCompraOpen,
    compraSelecionadaParaVinculo,
    setCompraSelecionadaParaVinculo,
  } = usePessoasDialogState();
  const [payForm, setPayForm] = useState({ formaPagamento: "pix" });
  const [abaterSaldoForm, setAbaterSaldoForm] = useState({
    valor: "",
    data: format(new Date(), "yyyy-MM-dd"),
    observacao: "",
  });
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
  const { visiblePessoasCount, loadMorePessoas } = usePessoasPaginationState({
    mobileMode: prefs.mobileMode,
    search,
    filterTipo,
    sortBy,
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
    deletePessoaPermanentMutation,
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

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <FintechLoadingPageHeader
          showEyebrow={false}
          titleWidth="w-44"
          subtitleWidth="w-80 max-w-full"
          actions={
            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[360px]">
              <Skeleton className="h-11 w-full rounded-2xl bg-muted/65" />
              <Skeleton className="h-11 w-full rounded-2xl bg-muted/65 sm:w-40" />
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <FintechLoadingSurface key={i}>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-12 w-12 rounded-2xl bg-muted/70" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36 rounded-full bg-muted/65" />
                      <Skeleton className="h-4 w-24 rounded-full bg-muted/60" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20 rounded-full bg-muted/65" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((metric) => (
                    <div key={metric} className="rounded-2xl border border-border/50 bg-background/80 p-3 shadow-sm">
                      <Skeleton className="h-3 w-full rounded-full bg-muted/55" />
                      <Skeleton className="mt-2 h-4 w-4/5 rounded-full bg-muted/65" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 flex-1 rounded-2xl bg-muted/65" />
                  <Skeleton className="h-9 w-9 rounded-xl bg-muted/65" />
                  <Skeleton className="h-9 w-9 rounded-xl bg-muted/65" />
                </div>
              </div>
            </FintechLoadingSurface>
          ))}
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
  const historyOverviewCompositionItems = composicaoPendenteItems.map((item) => ({
    key: item.key,
    label: item.label,
    colorClass: item.colorClass,
    widthPercent: composicaoPendenteTotal > 0 ? (item.valor / composicaoPendenteTotal) * 100 : 0,
    formattedValue: formatCurrencyBRL(item.valor),
  }));
  const historyOverviewCompositionTotalLabel = formatCurrencyBRL(historyResumo?.consolidadoPendente ?? 0);
  const historyOverviewAvailableCreditsLabel = formatCurrencyBRL(historySaldoCreditos);
  const historyOverviewTotalPagoLabel = `${formatCurrencyBRL(historyResumo?.totalPago ?? 0)} (${progressoPagoPercent}%)`;
  const historyOverviewTotalPendenteLabel = `${formatCurrencyBRL(historyResumo?.consolidadoPendente ?? 0)} (${progressoPendentePercent}%)`;
  const historyOverviewShowOverdueAlert = (historyResumo?.alertas.comprasAtrasadas ?? 0) > 0 || (historyResumo?.dividas.comigo.vencidas ?? 0) > 0;
  const historyOverviewOverdueAlertText = `Atrasos: ${historyResumo?.dividas.comigo.vencidas ?? 0} dívida(s) vencida(s), ${historyResumo?.alertas.comprasAtrasadas ?? 0} compra(s) com atraso e ${historyParcelasVencidas} parcela(s) vencida(s).`;

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

  const handleCreatePessoaSubmit = (e: FormEvent<HTMLFormElement>) => {
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
  };

  const handleConfirmPayHistory = () => {
    if (!payingDivida) return;
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
  };

  const handleEditPessoaSubmit = (e: FormEvent<HTMLFormElement>) => {
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

  const handleDeletePessoaPermanent = (pessoa: Pessoa) => {
    const confirmed = window.confirm(
      "Excluir esta pessoa para sempre? Essa ação não poderá ser desfeita.",
    );
    if (!confirmed) return;

    deletePessoaPermanentMutation.mutate(pessoa.id, {
      onSuccess: () => {
        if (historyPessoa?.id === pessoa.id) {
          setHistoryPessoa(null);
        }
        toast({ title: "Pessoa excluída permanentemente" });
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
      <PessoasPageToolbar
        onAddPessoa={() => setOpenPessoa(true)}
        totalPessoas={headerTotalPessoas}
        totalPendente={headerTotalPendente}
        totalAReceber={headerTotalAReceber}
        search={search}
        filterTipo={filterTipo}
        sortBy={sortBy}
        onSearchChange={setSearch}
        onFilterChange={setFilterTipo}
        onSortChange={setSortBy}
      />

      {!isRemovedFilter && !isOrphanGroupsLoading && visibleOrphanGroups.length > 0 && (
        <OrphanLinksAlert onReview={() => setOpenOrphanRecovery(true)} />
      )}

      <PessoasListSection
        sortedFilteredByStatusLength={sortedFilteredByStatus.length}
        isRemovedFilter={isRemovedFilter}
        visiblePessoas={visiblePessoas}
        mobileMode={prefs.mobileMode}
        getPessoaResumoConsolidado={getPessoaResumoConsolidado}
        getPessoaStats={getPessoaStats}
        onAddDivida={handleAddDividaFromPessoa}
        onOpenHistory={setHistoryPessoa}
        onEdit={handleEditPessoa}
        onDelete={handleDeletePessoa}
        onAddPessoa={() => setOpenPessoa(true)}
        onRestore={handleRestorePessoa}
        onPermanentDelete={handleDeletePessoaPermanent}
        hasMorePessoas={hasMorePessoas}
        onLoadMore={loadMorePessoas}
      />

      <PessoasDialogs>
      <NewPessoaDialog
        open={openPessoa}
        onOpenChange={setOpenPessoa}
        pessoaForm={pessoaForm}
        onPessoaFormChange={setPessoaForm}
        duplicatePessoa={duplicatePessoa}
        onSubmit={handleCreatePessoaSubmit}
        isPending={createPessoaMutation.isPending}
      />

      <EditPessoaDialog
        open={!!editingPessoa}
        onOpenChange={(value) => {
          if (!value) setEditingPessoa(null);
        }}
        editForm={editForm}
        onEditFormChange={setEditForm}
        onSubmit={handleEditPessoaSubmit}
        isPending={updatePessoaMutation.isPending}
      />

      <Dialog open={openDivida} onOpenChange={setOpenDivida}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova divida — {selectedPessoa?.nome}</DialogTitle>
            <DialogDescription className="sr-only">
              Registre uma nova dívida para a pessoa selecionada informando tipo, valor, vencimento e forma de pagamento.
            </DialogDescription>
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

      <OrphanRecoveryDialog
        open={openOrphanRecovery}
        onOpenChange={setOpenOrphanRecovery}
        visibleOrphanGroups={visibleOrphanGroups}
        pessoasAtivasParaVinculo={pessoasAtivasParaVinculo}
        getOrphanForm={getOrphanForm}
        onSetOrphanFormValue={setOrphanFormValue}
        onIgnoreGroup={(orphanGroupKey) => setIgnoredOrphanGroups((prev) => [...prev, orphanGroupKey])}
        onRecoverAsNewPessoa={handleRecoverOrphanAsNewPessoa}
        onRecoverToExistingPessoa={handleRecoverOrphanToExistingPessoa}
        isRecoverPending={recoverOrphanLinksMutation.isPending}
      />

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
              <PessoasHistorySheetSummary
                title={`Histórico de ${historyPessoa.nome}`}
                personName={historyPessoa.nome}
                consolidatedPendingLabel={formatCurrencyBRL(historyResumo.consolidadoPendente)}
                statusLabel={historyResumo.consolidadoPendente > 0 ? "Em aberto" : "Quitado"}
                statusVariant={historyResumo.consolidadoPendente > 0 ? "outline" : "secondary"}
                positiveBalanceLabel={formatCurrencyBRL(historyResumo.saldoPessoa.saldoAtual)}
                pendingInstallmentsLabel={String(historyResumo.alertas.parcelasPendentesPessoa)}
                overdueInstallmentsLabel={String(historyParcelasVencidas)}
                onOpenNewDivida={() => {
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
                onOpenSaldo={() => setHistoryTab("saldo")}
              />

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

              <PessoasHistoryOverviewSection
                isVisible={historyTab === "visao_geral"}
                showComposition={hasVisaoComposicao}
                compositionTotalLabel={historyOverviewCompositionTotalLabel}
                compositionItems={historyOverviewCompositionItems}
                showAvailableCredits={historySaldoCreditos > 0}
                availableCreditsLabel={historyOverviewAvailableCreditsLabel}
                showProgress={hasVisaoProgresso}
                progressoPagoPercent={progressoPagoPercent}
                progressoPendentePercent={progressoPendentePercent}
                totalPagoLabel={historyOverviewTotalPagoLabel}
                totalPendenteLabel={historyOverviewTotalPendenteLabel}
                insightText={insightVisaoGeral}
                showInsight={!!insightVisaoGeral}
                showOverdueAlert={historyOverviewShowOverdueAlert}
                overdueAlertText={historyOverviewOverdueAlertText}
              />

              <div className={`mb-6 rounded-md border border-border/60 p-4 space-y-4 ${historyTab === "saldo" ? "" : "hidden"}`}>
                <PessoasHistoryBalanceSummary
                  currentBalanceLabel={formatCurrencyBRL(historySaldoResumo?.saldoAtual ?? 0)}
                  creditsLabel={formatCurrencyBRL(historySaldoResumo?.creditos ?? 0)}
                  debitsLabel={formatCurrencyBRL(historySaldoResumo?.debitos ?? 0)}
                />

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

              <PayDividaDialog
                open={payOpen}
                onOpenChange={setPayOpen}
                payingDivida={payingDivida}
                formaPagamento={payForm.formaPagamento}
                onFormaPagamentoChange={(value) => setPayForm({ formaPagamento: value })}
                onConfirm={handleConfirmPayHistory}
                isPending={payMutation.isPending}
              />

              <Dialog open={abaterSaldoOpen} onOpenChange={setAbaterSaldoOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Abater com saldo positivo</DialogTitle>
                    <DialogDescription className="sr-only">
                      Use o saldo positivo disponível da pessoa para abater parte do valor pendente selecionado.
                    </DialogDescription>
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
                    <DialogDescription className="sr-only">
                      Use o saldo positivo disponível da pessoa para abater parte do valor pendente deste serviço.
                    </DialogDescription>
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
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-2">
                            {d.tipo === "receber"
                              ? <ArrowUpRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                              : <ArrowDownRight className="w-4 h-4 text-red-600 flex-shrink-0" />
                            }
                            <div className="min-w-0">
                              <p className="text-sm font-medium break-words">
                                {d.descricao || (d.tipo === "receber" ? "A receber" : "A pagar")}
                              </p>
                              <p className="text-xs text-muted-foreground break-words">
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
                          <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                            <span className={`text-sm font-bold [overflow-wrap:anywhere] ${d.tipo === "receber" ? "text-emerald-600" : "text-red-600"}`}>
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
                        <DialogDescription className="sr-only">
                          Selecione uma compra de cartão para vincular à pessoa e acompanhar esse relacionamento no histórico financeiro.
                        </DialogDescription>
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
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-start gap-2">
                              <CreditCard className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium break-words">{c.descricao}</p>
                                <p className="text-xs text-muted-foreground break-words">
                                  {cartao?.nome ?? "Cartao"} · {c.parcelaAtual}/{c.parcelas}x · {c.dataCompra}
                                </p>
                              </div>
                            </div>
                            <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                              <div className="min-w-0 text-left sm:text-right">
                                <p className="text-sm font-bold text-blue-600 [overflow-wrap:anywhere]">{formatCurrencyBRL(valorMensalPessoa)}/mês</p>
                                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Total a reembolsar: {formatCurrencyBRL(reembolso.reembolsoPessoa)}</p>
                                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Compra no cartão: {formatCurrencyBRL(reembolso.valorCompra)}</p>
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
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-start gap-2">
                              <Repeat className="w-4 h-4 text-amber-600 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium break-words">{servico?.nome ?? "Serviço"}</p>
                                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                  {formatCurrencyBRL(Number(sp.valorDevido))}/mês
                                </p>
                                {isParcialMesAtual && (
                                  <p className="mt-0.5 text-[11px] text-blue-600 break-words">
                                    Parcial no mês {meAtual}: abatido {formatCurrencyBRL(saldoAbatidoMesAtual)} · pendente {formatCurrencyBRL(pendenteMesAtual)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
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
                {historyPessoa.deletedAt ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleRestorePessoa(historyPessoa)}
                      data-testid="button-restore-history"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Restaurar pessoa
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleDeletePessoaPermanent(historyPessoa)}
                      data-testid="button-permanent-delete-history"
                    >
                      Excluir para sempre
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
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
                    data-testid="button-delete-history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      </PessoasDialogs>
    </div>
  );
}

