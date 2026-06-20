import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastAction } from "@/components/ui/toast";
import {
  TrendingUp, TrendingDown, CalendarClock,
  ArrowUpRight, ArrowDownRight, Receipt,
  AlertTriangle, CreditCard, Lightbulb,
  Trophy, Star, RotateCcw, Target, DollarSign, PiggyBank,
  Settings2, Smartphone,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { useUIPreferences } from "@/context/ui-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboard, type VencimentoItem } from "@/hooks/useDashboard";
import { useToast } from "@/hooks/use-toast";
import { parseMoney } from "@/lib/money";
import { queryClient } from "@/lib/queryClient";
import { CartaoFaturaPaymentDialog } from "@/pages/cartoes/components";
import {
  buildInvoiceTrackingInstallmentsForCard,
  getInvoiceCompetency,
  groupParcelasCompraByCompraId,
} from "@/lib/card-limit-usage";
import {
  findCardInvoiceSnapshot,
  getInstallmentEffectivePaidAmount,
  getInstallmentInvoicePaymentStatus,
} from "@shared/card-invoice-payments";
import {
  cancelCartaoFaturaPagamento,
  registerCartaoFaturaPagamento,
  updateParcelaCompraStatusCartao,
} from "@/services/api/cartoes";
import { updateParcela } from "@/services/api/dividas";
import {
  marcarDividaPessoaComoPaga,
  reverterDividaPessoaParaPendente,
} from "@/services/api/pessoas";
import {
  cancelarServicoCobrancaPagamento,
  registrarServicoCobrancaPagamento,
} from "@/services/api/servicos";
import { formatCurrencyBRL } from "@/utils/formatters";
import { useLocation } from "wouter";
import { DashboardQuickActions } from "@/components/dashboard/DashboardQuickActions";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { DashboardFinancialOverview } from "@/components/dashboard/DashboardFinancialOverview";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import {
  FintechLoadingListItem,
  FintechLoadingMetricCard,
  FintechLoadingSurface,
} from "@/components/layout/fintech-loading-shell";

const insightIconMap: Record<string, any> = {
  trophy: Trophy,
  alert: AlertTriangle,
  money: ArrowUpRight,
  repeat: RotateCcw,
  card: CreditCard,
  trend: TrendingDown,
  star: Star,
};

const fallbackInsightActionByIcon: Record<string, { label: string; path: string }> = {
  alert: { label: "Ver pendência", path: "/dividas?status=vencido" },
  card: { label: "Ver detalhes", path: "/cartoes" },
  repeat: { label: "Ver detalhes", path: "/servicos" },
  trend: { label: "Ver detalhes", path: "/previsao" },
  star: { label: "Ver metas", path: "/metas" },
  money: { label: "Ver detalhes", path: "/dividas?status=pendente&tipo=receber" },
};

const normalizeComparisonText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isUrgencyInsight = (insight: { tipo: string; icone: string; texto: string }) => {
  const normalized = normalizeComparisonText(insight.texto);
  if (insight.icone === "alert" || insight.icone === "card") return true;
  return [
    "vencid",
    "atras",
    "limite",
    "estour",
    "saldo negativo",
    "atencao",
    "cobranca",
    "vence",
  ].some((token) => normalized.includes(token));
};

function SectionErrorState({ message, compact = false }: { message?: string | null; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-red-500/20 bg-red-500/5 ${compact ? "p-3" : "p-4"} text-sm text-red-700 dark:text-red-300`}>
      <p className="font-medium">Não foi possível carregar esta seção agora.</p>
      {message && <p className="mt-1 text-xs opacity-90">{message}</p>}
    </div>
  );
}

function resolveVencimentoPath(item: { tipo: "cartao" | "divida" | "servico" } | null) {
  if (!item) return "/dividas";
  if (item.tipo === "cartao") return "/cartoes";
  if (item.tipo === "servico") return "/servicos";
  return "/dividas";
}

export default function Dashboard() {
  const { visible } = useValuesVisibility();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const {
    prefs,
    isEssentialMode,
    showAdvancedResources,
    showContextualTips,
    isMobileModeAuto,
    toggleDashCard,
    toggleCompact,
    setMobileModeAuto,
    setMobileModeManual,
  } = useUIPreferences();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [pendingVencimentoActionId, setPendingVencimentoActionId] = useState<string | null>(null);
  const [invoicePaymentTarget, setInvoicePaymentTarget] = useState<{ cartaoId: string; monthReference: string } | null>(null);
  const [cancelPendingPaymentId, setCancelPendingPaymentId] = useState<string | null>(null);

  const {
    monthOptions,
    dividas,
    servicos,
    pessoas,
    rendas,
    patrimonios,
    cartoes,
    compras,
    parcelasCompra,
    cartaoFaturaPagamentos,
    totalRenda,
    totalPatrimonio,
    totalServicos,
    totalReceber,
    totalPagar,
    totalCartoesMes,
    totalPagarMes,
    totalEntradas,
    totalSaidas,
    saldoPrevisto,
    today,
    in7Days,
    proximosVencimentos,
    pagarSemana,
    alertas,
    aReceberTooltip,
    aPagarTooltip,
    gastosFixosTooltip,
    rendaMensalTooltip,
    patrimonioTooltip,
    score,
    insights,
    scoreBarColor,
    scoreLabelColor,
    allDashCards,
    sectionStatus,
  } = useDashboard({ selectedMonth, visible });
  const selectedMonthLabel = monthOptions.find((o) => o.value === selectedMonth)?.label || selectedMonth;

  const alertasUrgentes = alertas
    .filter((item) => !normalizeComparisonText(item.texto).includes("tudo em ordem"))
    .slice(0, 3);

  const alertasUrgentesTextoSet = new Set(
    alertasUrgentes.map((item) => normalizeComparisonText(item.texto)),
  );

  const insightsOportunidades = insights
    .filter((insight) => !isUrgencyInsight(insight))
    .filter((insight) => !alertasUrgentesTextoSet.has(normalizeComparisonText(insight.texto)))
    .slice(0, 3);

  const shouldRenderAlertasSection =
    sectionStatus.alertas.isLoading || sectionStatus.alertas.isError || alertasUrgentes.length > 0;

  const proximoVencimento = proximosVencimentos[0] ?? null;
  const diasProximoVencimento = proximoVencimento
    ? Math.ceil((new Date(`${proximoVencimento.dataVenc}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : null;
  const receberPorPessoa = dividas.reduce<Map<string, number>>((acc, divida) => {
    if (divida.tipo !== "receber" || divida.status !== "pendente") return acc;
    const current = acc.get(divida.pessoaId) ?? 0;
    acc.set(divida.pessoaId, current + Number(divida.valor));
    return acc;
  }, new Map<string, number>());
  const principalReceberEntry = Array.from(receberPorPessoa.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const principalReceberNome = principalReceberEntry
    ? (pessoas.find((p) => p.id === principalReceberEntry[0])?.nome ?? null)
    : null;
  const pagarSemanaTotal = pagarSemana.reduce((sum, item) => sum + item.amount, 0);
  const servicosAtivosCount = servicos.filter((servico) => servico.status === "ativo").length;
  const dashboardParcelasCompraByCompraId = useMemo(
    () => groupParcelasCompraByCompraId(parcelasCompra),
    [parcelasCompra],
  );
  const dashboardCartoesById = useMemo(
    () => new Map(cartoes.map((cartao) => [cartao.id, cartao] as const)),
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

  const invalidateFinancialViews = async () => {
    const keys: Array<readonly unknown[]> = [
      ["/api/dashboard/overview"],
      ["/api/financial/summary"],
      ["/api/financial/score"],
      ["/api/financial/insights"],
      ["/api/servicos"],
      ["/api/servicos/cobranca-pagamentos"],
      ["/api/dividas"],
      ["/api/parcelas"],
      ["/api/cartoes"],
      ["/api/cartoes/fatura-pagamentos"],
      ["/api/parcelas-compra"],
      ["/api/reports/overview"],
      ["/api/pessoas"],
    ];

    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };

  const getInvoicePaymentsForCompetency = (cartaoId: string, monthReference: string) =>
    invoicePaymentsByCardMonthKey.get(`${cartaoId}:${monthReference}`) ?? [];

  const getInvoiceSnapshotForCompetency = (cartaoId: string, monthReference: string) => {
    const cartao = dashboardCartoesById.get(cartaoId);
    if (!cartao) return null;

    return findCardInvoiceSnapshot({
      cartaoId,
      monthReference,
      installments: buildInvoiceTrackingInstallmentsForCard(
        cartaoId,
        compras,
        dashboardParcelasCompraByCompraId,
      ),
      payments: getInvoicePaymentsForCompetency(cartaoId, monthReference),
      getDueDayForCard: () => cartao.diaVencimento,
      referenceDate: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const selectedInvoicePaymentCartao = invoicePaymentTarget
    ? (dashboardCartoesById.get(invoicePaymentTarget.cartaoId) ?? null)
    : null;
  const selectedInvoicePaymentSnapshot = invoicePaymentTarget
    ? getInvoiceSnapshotForCompetency(invoicePaymentTarget.cartaoId, invoicePaymentTarget.monthReference)
    : null;
  const selectedInvoicePaymentHistory = invoicePaymentTarget
    ? getInvoicePaymentsForCompetency(invoicePaymentTarget.cartaoId, invoicePaymentTarget.monthReference)
    : [];
  const selectedInvoiceInstallments = useMemo(() => {
    if (!invoicePaymentTarget) return [];

    return compras
      .filter((compra) => compra.cartaoId === invoicePaymentTarget.cartaoId)
      .flatMap((compra) => (
        (dashboardParcelasCompraByCompraId.get(compra.id) ?? [])
          .filter((parcela) => getInvoiceCompetency(parcela.dataVencimento) === invoicePaymentTarget.monthReference)
          .map((parcela) => {
            const valorPagoAtual = getInstallmentEffectivePaidAmount({
              id: parcela.id,
              valor: parcela.valor,
              statusCartao: parcela.statusCartao,
            }, selectedInvoicePaymentHistory);
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
              }, selectedInvoicePaymentHistory),
            };
          })
      ));
  }, [compras, dashboardParcelasCompraByCompraId, invoicePaymentTarget, selectedInvoicePaymentHistory]);

  const registerInvoicePaymentMutation = useMutation({
    mutationFn: ({
      cartaoId,
      monthReference,
      data,
    }: {
      cartaoId: string;
      monthReference: string;
      data: Parameters<typeof registerCartaoFaturaPagamento>[2];
    }) => registerCartaoFaturaPagamento(cartaoId, monthReference, data),
    onSuccess: async (result) => {
      await invalidateFinancialViews();
      const pagamentoLimitado = result.valorAplicado < result.valorSolicitado;
      const titulo = result.saldoRestante <= 0
        ? "Fatura quitada"
        : result.statusFatura === "parcialmente_paga" || result.statusFatura === "vencida_parcialmente_paga"
          ? "Pagamento parcial registrado"
          : "Pagamento registrado";
      const descricaoBase = pagamentoLimitado
        ? `Pagamento aplicado até o saldo restante: ${formatCurrencyBRL(result.valorAplicado)}.`
        : `Pagamento aplicado: ${formatCurrencyBRL(result.valorAplicado)}.`;
      toast({
        title: titulo,
        description: `${descricaoBase} Saldo restante: ${formatCurrencyBRL(result.saldoRestante)}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao registrar pagamento",
        description: error instanceof Error ? error.message : "Não foi possível registrar o pagamento da fatura.",
        variant: "destructive",
      });
    },
  });

  const cancelInvoicePaymentMutation = useMutation({
    mutationFn: ({
      cartaoId,
      monthReference,
      pagamentoId,
    }: {
      cartaoId: string;
      monthReference: string;
      pagamentoId: string;
    }) => cancelCartaoFaturaPagamento(cartaoId, monthReference, pagamentoId),
    onMutate: ({ pagamentoId }) => {
      setCancelPendingPaymentId(pagamentoId);
    },
    onSuccess: async (result) => {
      await invalidateFinancialViews();
      toast({
        title: "Pagamento desfeito com sucesso",
        description: `Saldo restante da fatura atualizado para ${formatCurrencyBRL(result.saldoRestante)}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível desfazer o pagamento",
        description: error instanceof Error ? error.message : "Falha ao desfazer o pagamento da fatura.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setCancelPendingPaymentId(null);
    },
  });

  const runUndoableAction = (
    params: {
      title: string;
      description?: string;
      undoTitle: string;
      undoDescription?: string;
      undo: () => Promise<void>;
    },
  ) => {
    toast({
      title: params.title,
      description: params.description,
      action: (
        <ToastAction
          altText="Desfazer ação"
          onClick={() => {
            void params.undo()
              .then(async () => {
                await invalidateFinancialViews();
                toast({
                  title: params.undoTitle,
                  description: params.undoDescription,
                });
              })
              .catch((error: unknown) => {
                toast({
                  title: "Não foi possível desfazer",
                  description: error instanceof Error ? error.message : "Tente novamente em instantes.",
                  variant: "destructive",
                });
              });
          }}
        >
          Desfazer
        </ToastAction>
      ),
    });
  };

  const handleTriggerVencimentoAction = async (item: VencimentoItem) => {
    if (item.kind === "cartao_fatura") {
      if (!item.cartaoId || !item.monthReference) return;
      setInvoicePaymentTarget({
        cartaoId: item.cartaoId,
        monthReference: item.monthReference,
      });
      return;
    }

    const todayIso = format(new Date(), "yyyy-MM-dd");

    if (item.kind === "servico") {
      if (!item.servicoId || !item.monthReference) return;
      setPendingVencimentoActionId(item.id);
      try {
        const payment = await registrarServicoCobrancaPagamento({
          servicoId: item.servicoId,
          monthReference: item.monthReference,
          valorPago: item.valor,
          dataPagamento: todayIso,
        });
        await invalidateFinancialViews();
        runUndoableAction({
          title: "Cobrança marcada como paga",
          description: `${item.nome} foi baixado em ${formatCurrencyBRL(item.valor)}.`,
          undoTitle: "Pagamento desfeito",
          undoDescription: `${item.nome} voltou para os próximos vencimentos.`,
          undo: async () => {
            await cancelarServicoCobrancaPagamento(item.servicoId!, payment.id);
          },
        });
      } catch (error) {
        toast({
          title: "Não foi possível registrar o pagamento",
          description: error instanceof Error ? error.message : "Tente novamente em instantes.",
          variant: "destructive",
        });
      } finally {
        setPendingVencimentoActionId(null);
      }
      return;
    }

    if (item.kind === "cartao_parcela") {
      if (!item.parcelaCompraId) return;
      const confirmed = typeof window === "undefined"
        ? true
        : window.confirm(`Marcar a parcela "${item.nome}" como paga no cartão?`);
      if (!confirmed) return;

      setPendingVencimentoActionId(item.id);
      try {
        await updateParcelaCompraStatusCartao(item.parcelaCompraId, true, todayIso);
        await invalidateFinancialViews();
        runUndoableAction({
          title: "Pagamento registrado",
          description: `A parcela de ${item.nome} foi marcada como paga no cartão.`,
          undoTitle: "Pagamento da parcela desfeito",
          undoDescription: `${item.nome} voltou para o estado pendente.`,
          undo: () => updateParcelaCompraStatusCartao(item.parcelaCompraId!, false),
        });
      } catch (error) {
        toast({
          title: "Não foi possível registrar o pagamento",
          description: error instanceof Error ? error.message : "Tente novamente em instantes.",
          variant: "destructive",
        });
      } finally {
        setPendingVencimentoActionId(null);
      }
      return;
    }

    if (item.kind === "divida_pagar" || item.kind === "divida_receber") {
      const confirmed = typeof window === "undefined"
        ? true
        : window.confirm(
          item.kind === "divida_receber"
            ? `Marcar "${item.nome}" como recebido?`
            : `Marcar "${item.nome}" como pago?`,
        );
      if (!confirmed) return;

      setPendingVencimentoActionId(item.id);
      try {
        if (item.parcelaId) {
          await updateParcela(item.parcelaId, {
            status: "pago",
            dataPagamento: todayIso,
            formaPagamento: "dashboard",
          });
        } else if (item.dividaId) {
          await marcarDividaPessoaComoPaga({
            id: item.dividaId,
            formaPagamento: "dashboard",
            dataPagamento: todayIso,
          });
        }
        await invalidateFinancialViews();
        runUndoableAction({
          title: item.kind === "divida_receber" ? "Recebimento registrado" : "Pagamento registrado",
          description: item.kind === "divida_receber"
            ? `${item.nome} foi marcado como recebido.`
            : `${item.nome} foi marcado como pago.`,
          undoTitle: item.kind === "divida_receber" ? "Recebimento desfeito" : "Pagamento desfeito",
          undoDescription: `${item.nome} voltou para o estado pendente.`,
          undo: async () => {
            if (item.parcelaId) {
              await updateParcela(item.parcelaId, {
                status: "pendente",
                dataPagamento: null,
                formaPagamento: null,
              });
              return;
            }
            if (item.dividaId) {
              await reverterDividaPessoaParaPendente(item.dividaId);
            }
          },
        });
      } catch (error) {
        toast({
          title: "Não foi possível registrar a ação",
          description: error instanceof Error ? error.message : "Tente novamente em instantes.",
          variant: "destructive",
        });
      } finally {
        setPendingVencimentoActionId(null);
      }
    }
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

    registerInvoicePaymentMutation.mutate({
      cartaoId: invoicePaymentTarget.cartaoId,
      monthReference: invoicePaymentTarget.monthReference,
      data: payload,
    });
  };

  const handleCancelInvoicePayment = (paymentId: string) => {
    if (!invoicePaymentTarget) {
      toast({
        title: "Pagamento indisponível",
        description: "Não foi possível localizar a fatura selecionada para desfazer o pagamento.",
        variant: "destructive",
      });
      return;
    }

    cancelInvoicePaymentMutation.mutate({
      cartaoId: invoicePaymentTarget.cartaoId,
      monthReference: invoicePaymentTarget.monthReference,
      pagamentoId: paymentId,
    });
  };
  const summaryCards = [
    {
      id: "receber",
      title: "A receber",
      value: maskValue(formatCurrencyBRL(totalReceber), visible),
      icon: ArrowUpRight,
      trend: `${dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").length} pendentes`,
      color: "bg-emerald-500/10 text-emerald-600",
      valueColor: "text-emerald-600",
      tooltipLines: aReceberTooltip,
    },
    {
      id: "pagar",
      title: "A pagar",
      value: maskValue(formatCurrencyBRL(totalPagar), visible),
      icon: ArrowDownRight,
      trend: `${dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} pendentes`,
      color: "bg-red-500/10 text-red-600",
      valueColor: "text-red-600",
      tooltipLines: aPagarTooltip,
    },
    {
      id: "servicos",
      title: "Gastos fixos",
      value: maskValue(formatCurrencyBRL(totalServicos), visible),
      icon: Receipt,
      trend: `${servicosAtivosCount} serviço${servicosAtivosCount === 1 ? "" : "s"} ativo${servicosAtivosCount === 1 ? "" : "s"}`,
      color: "bg-amber-500/10 text-amber-600",
      tooltipLines: gastosFixosTooltip,
    },
    {
      id: "renda",
      title: "Renda mensal",
      value: maskValue(formatCurrencyBRL(totalRenda), visible),
      icon: DollarSign,
      trend: `${rendas.filter((r) => r.ativo).length} fontes ativas`,
      color: "bg-emerald-500/10 text-emerald-600",
      valueColor: "text-emerald-600",
      tooltipLines: rendaMensalTooltip,
    },
    {
      id: "patrimonio",
      title: "Patrimônio",
      value: maskValue(formatCurrencyBRL(totalPatrimonio), visible),
      icon: PiggyBank,
      trend: `${patrimonios.length} itens`,
      color: "bg-blue-500/10 text-blue-600",
      valueColor: "text-blue-600",
      tooltipLines: patrimonioTooltip,
    },
  ];
  const desktopSettingsContent = (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <div>
            <Label htmlFor="mobile-mode" className="cursor-pointer font-medium">Modo Celular</Label>
            <p className="text-xs text-muted-foreground">Interface otimizada para toque</p>
          </div>
        </div>
        <Switch
          id="mobile-mode"
          checked={prefs.mobileMode}
          onCheckedChange={(checked) => setMobileModeManual(checked)}
          data-testid="toggle-mobile-mode"
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {isMobileModeAuto ? "Modo automático ativo (segue tamanho da tela)." : "Modo manual ativo."}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={setMobileModeAuto}
          disabled={isMobileModeAuto}
        >
          Usar automático
        </Button>
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2">
        <Label htmlFor="compact-mode" className="font-medium">Modo Compacto</Label>
        <Switch
          id="compact-mode"
          checked={prefs.dashboardCompact}
          onCheckedChange={toggleCompact}
        />
      </div>
      <div className="space-y-2">
        <Label className="px-2 text-sm text-muted-foreground">Cards visíveis</Label>
        {allDashCards.map((card) => (
          <div key={card.id} className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-muted/50">
            <span className="text-sm">{card.title}</span>
            <Switch
              checked={!prefs.hiddenDashCards.includes(card.id)}
              onCheckedChange={() => toggleDashCard(card.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );

  if (isEssentialMode) {
    return (
      <div className="app-page-shell app-section-stack" data-testid="dashboard-essencial">
        <div className="fintech-page-header border border-border/60 bg-card/95 shadow-sm">
          <div className="fintech-page-header-row gap-2.5 sm:gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.8rem] font-semibold tracking-tight sm:text-3xl">Painel Essencial</h1>
              <p className="text-[13px] leading-5 text-muted-foreground/90 sm:text-sm">Visão simplificada para decisões rápidas.</p>
            </div>
            <div className="fintech-actions-wrap w-full lg:w-auto">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-9 w-full min-w-0 rounded-xl text-sm sm:h-10 lg:w-[220px]" data-testid="select-month-essencial">
                  <SelectValue placeholder="Selecionar mês" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-center gap-2 rounded-xl sm:h-10 lg:w-auto">
                    <Settings2 className="h-4 w-4" />
                    Ajustes
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ajustes do painel</DialogTitle>
                    <DialogDescription className="sr-only">
                      Ajuste o modo celular e as preferências rápidas exibidas no painel essencial.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <div>
                          <Label htmlFor="mobile-mode-essencial" className="cursor-pointer font-medium">Modo Celular</Label>
                          <p className="text-xs text-muted-foreground">Interface otimizada para toque</p>
                        </div>
                      </div>
                      <Switch
                        id="mobile-mode-essencial"
                        checked={prefs.mobileMode}
                        onCheckedChange={(checked) => setMobileModeManual(checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-muted-foreground">
                        {isMobileModeAuto ? "Modo automático ativo (segue tamanho da tela)." : "Modo manual ativo."}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={setMobileModeAuto}
                        disabled={isMobileModeAuto}
                      >
                        Usar automático
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {sectionStatus.saldo.isLoading ? (
          <FintechLoadingSurface className="rounded-2xl" contentClassName="p-4 sm:p-5">
            <Skeleton className="h-3 w-28 rounded-full bg-muted/60" />
            <Skeleton className="mt-3 h-10 w-40 rounded-xl bg-muted/70" />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[1, 2].map((idx) => (
                <FintechLoadingSurface
                  key={idx}
                  tone="inset"
                  className="rounded-xl shadow-none"
                  contentClassName="px-3 py-3"
                >
                  <Skeleton className="h-3 w-16 rounded-full bg-muted/55" />
                  <Skeleton className="mt-2 h-4 w-24 rounded-full bg-muted/70" />
                </FintechLoadingSurface>
              ))}
            </div>
          </FintechLoadingSurface>
        ) : sectionStatus.saldo.isError ? (
          <SectionErrorState message={sectionStatus.saldo.message} />
        ) : (
          <Card className={`border-0 shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`} data-testid="essencial-hero">
            <CardContent className="p-4 sm:p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-90">Seu dinheiro este mês</p>
              <p className="fin-value-hero">{maskValue(formatCurrencyBRL(saldoPrevisto), visible)}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] opacity-80">Entrou</p>
                  <p className="text-base font-semibold">{maskValue(formatCurrencyBRL(totalEntradas), visible)}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] opacity-80">Saiu</p>
                  <p className="text-base font-semibold">{maskValue(formatCurrencyBRL(totalSaidas), visible)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="flex flex-col shadow-sm" data-testid="essencial-proxima-conta">
            <CardHeader className="pb-2">
            <CardTitle className="text-base">Próxima conta</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-2">
            {sectionStatus.proximosVencimentos.isLoading ? (
              <FintechLoadingSurface
                tone="inset"
                className="rounded-2xl shadow-none"
                contentClassName="space-y-3 p-4"
              >
                <Skeleton className="h-3 w-28 rounded-full bg-muted/60" />
                <Skeleton className="h-4 w-2/3 rounded-full bg-muted/65" />
                <Skeleton className="h-8 w-28 rounded-xl bg-muted/75" />
                <Skeleton className="h-11 w-full rounded-xl bg-muted/60" />
              </FintechLoadingSurface>
            ) : sectionStatus.proximosVencimentos.isError ? (
              <SectionErrorState compact message={sectionStatus.proximosVencimentos.message} />
            ) : !proximoVencimento ? (
                <FintechEmptyState
                  icon={<CalendarClock className="h-5 w-5 text-muted-foreground/70" />}
                  title="Nenhuma conta pendente no período."
                  size="compact"
                  className="min-h-[132px] bg-background/80 px-4 py-6"
                  titleClassName="text-sm"
                />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {diasProximoVencimento !== null
                      ? diasProximoVencimento < 0
                        ? `Conta vencida há ${Math.abs(diasProximoVencimento)} dia(s)`
                        : diasProximoVencimento === 0
                          ? "Conta vence hoje"
                          : `Próxima conta em ${diasProximoVencimento} dia(s)`
                      : "Próxima conta"}
                  </p>
                  <p className="text-sm font-semibold">{proximoVencimento.nome}</p>
                  <p className="text-2xl font-bold leading-tight tracking-tight">
                    {maskValue(formatCurrencyBRL(proximoVencimento.valor), visible)}
                  </p>
                  <div className="mt-auto grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      className="h-11 w-full justify-center rounded-xl text-sm"
                      onClick={() => {
                        void handleTriggerVencimentoAction(proximoVencimento);
                      }}
                      disabled={pendingVencimentoActionId === proximoVencimento.id}
                    >
                      {pendingVencimentoActionId === proximoVencimento.id ? "Processando..." : proximoVencimento.actionLabel}
                    </Button>
                    <Button
                      type="button"
                      className="h-11 w-full justify-center rounded-xl text-sm"
                      variant="outline"
                      onClick={() => setLocation(resolveVencimentoPath(proximoVencimento))}
                    >
                      Ver contas
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col shadow-sm" data-testid="essencial-receber">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dinheiro para receber</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              {totalReceber > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">Você tem {maskValue(formatCurrencyBRL(totalReceber), visible)} para receber.</p>
                  {principalReceberNome && (
                    <p className="text-sm text-muted-foreground">
                      Principal pendência: <span className="font-medium text-foreground">{principalReceberNome}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem valores pendentes para receber neste período.</p>
              )}
              <Button
                type="button"
                className="mt-auto h-11 w-full justify-center rounded-xl text-sm"
                variant="outline"
                onClick={() => setLocation("/pessoas")}
              >
                Ver pessoas
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 shadow-sm" data-testid="essencial-atalhos-uteis">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atalhos úteis</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardQuickActions
              onGoPessoas={() => setLocation("/pessoas")}
              onGoCartoes={() => setLocation("/cartoes")}
              onGoServicos={() => setLocation("/servicos")}
              onGoPerfil={() => setLocation("/perfil")}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (prefs.mobileMode) {
    const visibleCards = allDashCards.filter(c => !prefs.hiddenDashCards.includes(c.id));
    const cardDataMap: Record<string, { value: string; icon: any; iconColor: string; bg: string; valueColor: string }> = {
      receber: { value: maskValue(formatCurrencyBRL(totalReceber), visible), icon: ArrowUpRight, iconColor: "text-emerald-600", bg: "bg-emerald-500/10", valueColor: "text-emerald-600" },
      pagar: { value: maskValue(formatCurrencyBRL(totalPagar), visible), icon: ArrowDownRight, iconColor: "text-red-500", bg: "bg-red-500/10", valueColor: "text-red-600" },
      servicos: { value: maskValue(formatCurrencyBRL(totalServicos), visible), icon: Receipt, iconColor: "text-amber-500", bg: "bg-amber-500/10", valueColor: "text-foreground" },
      saldo: { value: maskValue(formatCurrencyBRL(saldoPrevisto), visible), icon: saldoPrevisto >= 0 ? TrendingUp : TrendingDown, iconColor: saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-500", bg: saldoPrevisto >= 0 ? "bg-emerald-500/10" : "bg-red-500/10", valueColor: saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-600" },
      renda: { value: maskValue(formatCurrencyBRL(totalRenda), visible), icon: DollarSign, iconColor: "text-emerald-600", bg: "bg-emerald-500/10", valueColor: "text-emerald-600" },
      patrimonio: { value: maskValue(formatCurrencyBRL(totalPatrimonio), visible), icon: PiggyBank, iconColor: "text-blue-500", bg: "bg-blue-500/10", valueColor: "text-blue-600" },
    };

    return (
      <div className="min-h-full w-full max-w-full overflow-x-hidden bg-background pb-[calc(var(--app-bottom-nav-height)+env(safe-area-inset-bottom))]" data-testid="dashboard-mobile">
        <div className="bg-card/80 backdrop-blur-sm border-b px-4 pt-5 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Painel</h1>
              <p className="text-xs text-muted-foreground capitalize">{selectedMonthLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    aria-label="Personalizar painel"
                    title="Personalizar"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Personalizar Painel</DialogTitle>
                    <DialogDescription className="sr-only">
                      Escolha quais cards ficam visíveis e ajuste as preferências do painel no modo celular.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-primary" />
                        <div>
                          <Label htmlFor="mobile-mode-m" className="font-medium cursor-pointer">Modo Celular</Label>
                          <p className="text-xs text-muted-foreground">Interface otimizada para toque</p>
                        </div>
                      </div>
                      <Switch
                        id="mobile-mode-m"
                        checked={prefs.mobileMode}
                        onCheckedChange={(checked) => setMobileModeManual(checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-muted-foreground">
                        {isMobileModeAuto ? "Modo automático ativo (segue tamanho da tela)." : "Modo manual ativo."}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={setMobileModeAuto}
                        disabled={isMobileModeAuto}
                      >
                        Usar automático
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground px-1 uppercase tracking-wide">Cards visíveis</Label>
                      {allDashCards.map((card) => (
                        <div key={card.id} className="flex items-center justify-between py-3 px-2 border-b last:border-b-0">
                          <span className="text-base">{card.title}</span>
                          <Switch
                            checked={!prefs.hiddenDashCards.includes(card.id)}
                            onCheckedChange={() => toggleDashCard(card.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-10 w-full text-sm rounded-xl border-0 bg-muted/50" data-testid="select-month-mobile">
              <SelectValue placeholder="Selecionar mês" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="py-3 text-base">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="px-4 pt-4 space-y-3">
          {sectionStatus.saldo.isLoading ? (
            <FintechLoadingSurface className="rounded-2xl" contentClassName="p-[14px]">
              <Skeleton className="h-3 w-24 rounded-full bg-muted/60" />
              <Skeleton className="mt-3 h-10 w-40 rounded-xl bg-muted/70" />
              <div className="mt-4 flex gap-4">
                {[1, 2].map((idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full bg-muted/60" />
                    <Skeleton className="h-5 w-20 rounded-full bg-muted/70" />
                  </div>
                ))}
              </div>
            </FintechLoadingSurface>
          ) : sectionStatus.saldo.isError ? (
            <SectionErrorState message={sectionStatus.saldo.message} />
          ) : (
            <div
              className={`rounded-2xl p-[14px] shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}
              data-testid="mobile-saldo-hero"
            >
              <p className="mb-1 text-[12px] font-medium uppercase tracking-wide opacity-80">Saldo do mês</p>
              <p className="fin-value-hero mb-3">
                {maskValue(formatCurrencyBRL(saldoPrevisto), visible)}
              </p>
              <div className="flex gap-4 text-sm opacity-85">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{maskValue(formatCurrencyBRL(totalRenda), visible)}</span>
                </div>
                <div className="w-px bg-white/30" />
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>{maskValue(formatCurrencyBRL(totalCartoesMes + totalPagarMes + totalServicos), visible)}</span>
                </div>
              </div>
            </div>
          )}

          {visibleCards.filter(c => c.id !== "saldo").length > 0 ? (
            sectionStatus.cardsResumo.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((idx) => (
                  <FintechLoadingMetricCard
                    key={idx}
                    compact
                    titleWidth="w-20"
                    valueWidth="w-28"
                    iconSizeClassName="h-7 w-7"
                  />
                ))}
              </div>
            ) : sectionStatus.cardsResumo.isError ? (
              <SectionErrorState compact message={sectionStatus.cardsResumo.message} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleCards.filter(c => c.id !== "saldo").map(card => {
                  const d = cardDataMap[card.id];
                  if (!d) return null;
                  const IconC = d.icon;
                  return (
                    <div
                      key={card.id}
                      className="bg-card rounded-2xl border border-border/50 p-[14px] shadow-sm min-h-[90px] flex flex-col justify-between"
                      data-testid={`mobile-card-${card.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] text-muted-foreground font-medium">{card.title}</p>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${d.bg}`}>
                          <IconC className={`w-3.5 h-3.5 ${d.iconColor}`} />
                        </div>
                      </div>
                      <p className={`fin-value-kpi ${d.valueColor}`}>
                        {d.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}

          {shouldRenderAlertasSection && (
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="font-semibold text-sm">Alertas importantes</span>
            </div>
            {sectionStatus.alertas.isLoading ? (
              <div className="space-y-2 px-4 pb-4">
                {[1, 2, 3].map((idx) => (
                  <FintechLoadingListItem
                    key={idx}
                    compact
                    titleWidth="w-full"
                    subtitleWidth="w-4/5"
                    showTrailing={false}
                    iconSizeClassName="h-4 w-4"
                    className="rounded-xl shadow-sm"
                  />
                ))}
              </div>
            ) : sectionStatus.alertas.isError ? (
              <div className="px-4 pb-4">
                <SectionErrorState compact message={sectionStatus.alertas.message} />
              </div>
            ) : (
              <div className="space-y-2 px-4 pb-4">
                {alertasUrgentes.map((alerta, index) => {
                  const IconComp = alerta.icon || AlertTriangle;
                  return (
                    <div key={`${alerta.texto}-${index}`} className={`rounded-md border p-3 ${alerta.bgColor}`}>
                      <div className={`flex items-start gap-2.5 ${alerta.color}`}>
                        <IconComp className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <p className="text-sm font-medium">{alerta.texto}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {showAdvancedResources && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm">Insights automáticos</span>
              </div>
              {sectionStatus.insights.isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {[1, 2].map((idx) => (
                    <FintechLoadingSurface
                      key={idx}
                      tone="muted"
                      className="rounded-xl shadow-sm"
                      contentClassName="p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <Skeleton className="mt-0.5 h-4 w-4 rounded-full bg-muted/70" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-3 w-full rounded-full bg-muted/65" />
                          <Skeleton className="h-3 w-3/4 rounded-full bg-muted/55" />
                          <Skeleton className="h-7 w-24 rounded-lg bg-muted/60" />
                        </div>
                      </div>
                    </FintechLoadingSurface>
                  ))}
                </div>
              ) : sectionStatus.insights.isError ? (
                <div className="px-4 pb-4">
                  <SectionErrorState compact message={sectionStatus.insights.message} />
                </div>
              ) : insightsOportunidades.length === 0 ? (
                <div className="px-4 pb-4 text-xs text-muted-foreground">Sem oportunidades relevantes no momento.</div>
              ) : (
                <div className="space-y-2 px-4 pb-4">
                  {insightsOportunidades.map((insight, i) => {
                    const IconComp = insightIconMap[insight.icone] || Lightbulb;
                    const insightAction = insight.acao
                      ? { label: insight.acao.label, path: insight.acao.path }
                      : fallbackInsightActionByIcon[insight.icone];
                    const isActionable = Boolean(insightAction?.path);
                    const styles = {
                      positivo: "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                      negativo: "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400",
                      neutro: "bg-muted/40 border-border text-muted-foreground",
                    };
                    return (
                      <div
                        key={i}
                        className={`rounded-md border p-3 ${styles[insight.tipo]} ${isActionable ? "cursor-pointer" : ""}`}
                        onClick={isActionable ? () => setLocation(insightAction.path) : undefined}
                      >
                        <div className="flex items-start gap-2.5">
                          <IconComp className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-medium">{insight.texto}</p>
                            {isActionable && insightAction && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setLocation(insightAction.path);
                                }}
                              >
                                {insightAction.label}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Próximos Vencimentos</span>
              {!sectionStatus.pagarSemana.isLoading && !sectionStatus.pagarSemana.isError && pagarSemana.length > 0 ? (
                <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {pagarSemana.length} na semana
                </span>
              ) : null}
            </div>
            {sectionStatus.proximosVencimentos.isLoading ? (
              <div className="space-y-2 px-4 pb-4">
                {[1, 2, 3].map((idx) => (
                  <FintechLoadingListItem
                    key={idx}
                    compact
                    titleWidth="w-1/2"
                    subtitleWidth="w-1/3"
                    trailingWidth="w-14"
                    iconSizeClassName="h-8 w-8"
                    className="rounded-2xl shadow-sm"
                  />
                ))}
              </div>
            ) : sectionStatus.proximosVencimentos.isError ? (
              <div className="px-4 pb-4">
                <SectionErrorState compact message={sectionStatus.proximosVencimentos.message} />
              </div>
            ) : proximosVencimentos.length === 0 ? (
              <div className="px-4 pb-4">
                <FintechEmptyState
                  icon={<CalendarClock className="h-5 w-5 text-muted-foreground/70" />}
                  title="Nenhum vencimento pendente"
                  size="compact"
                  className="bg-background/80 px-4 py-6"
                  titleClassName="text-sm"
                />
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {proximosVencimentos.slice(0, 6).map((item) => {
                  const isPast = item.dataVenc < today;
                  const isToday = item.dataVenc === today;
                  const isThisWeek = item.dataVenc > today && item.dataVenc <= in7Days;
                  const dotColor = isPast ? "bg-red-500" : isToday ? "bg-red-500" : isThisWeek ? "bg-amber-400" : "bg-emerald-400";
                  const TipoIcon = item.tipo === "cartao" ? CreditCard : item.tipo === "servico" ? Receipt : ArrowDownRight;
                  const tipoBg = item.tipo === "cartao" ? "bg-blue-500/10 text-blue-600" : item.tipo === "servico" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600";
                  return (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3" data-testid={`mobile-vencimento-${item.id}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tipoBg}`}>
                        <TipoIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words">{item.nome}</p>
                        <div className="mt-0.5 flex items-start gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                          <p className={`text-xs break-words ${isPast || isToday ? "text-red-600 font-medium" : isThisWeek ? "text-amber-600" : "text-muted-foreground"}`}>
                            {item.subtitulo}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold [overflow-wrap:anywhere]">
                            {maskValue(formatCurrencyBRL(item.valor), visible)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 min-h-7 rounded-full border-border/70 bg-background/80 px-2.5 text-[11px] font-medium shadow-none hover:bg-background"
                            onClick={() => {
                              void handleTriggerVencimentoAction(item);
                            }}
                            disabled={pendingVencimentoActionId === item.id}
                          >
                            {pendingVencimentoActionId === item.id ? "Processando..." : item.actionLabel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!sectionStatus.proximosVencimentos.isLoading && !sectionStatus.proximosVencimentos.isError ? (
              <div className="border-t border-border/60 px-4 py-3">
                {sectionStatus.pagarSemana.isLoading ? (
                  <FintechLoadingSurface
                    tone="inset"
                    className="rounded-xl shadow-sm"
                    contentClassName="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24 rounded-full bg-muted/60" />
                      <Skeleton className="h-4 w-20 rounded-full bg-muted/70" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full bg-muted/60" />
                  </FintechLoadingSurface>
                ) : sectionStatus.pagarSemana.isError ? (
                  <p className="text-xs text-muted-foreground">Resumo da semana indisponível no momento.</p>
                ) : pagarSemana.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-amber-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground">A pagar em 7 dias</p>
                      <p className="text-sm font-semibold text-red-600 [overflow-wrap:anywhere]">
                        {maskValue(formatCurrencyBRL(pagarSemanaTotal), visible)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {pagarSemana.length} item(ns)
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem pagamentos críticos nos próximos 7 dias.</p>
                )}
              </div>
            ) : null}
          </div>

          {showAdvancedResources && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden" data-testid="mobile-score">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Score detalhado</span>
              </div>
              {sectionStatus.scoreDetalhado.isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  <FintechLoadingSurface
                    tone="inset"
                    className="rounded-xl shadow-sm"
                    contentClassName="p-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Skeleton className="h-3 w-28 rounded-full bg-muted/60" />
                        <Skeleton className="h-3 w-16 rounded-full bg-muted/65" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-2 flex-1 rounded-full bg-muted/60" />
                        <Skeleton className="h-4 w-10 rounded-full bg-muted/70" />
                      </div>
                    </div>
                  </FintechLoadingSurface>
                  {[1, 2].map((idx) => (
                    <FintechLoadingSurface
                      key={idx}
                      tone="muted"
                      className="rounded-xl shadow-sm"
                      contentClassName="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <Skeleton className="h-3 w-28 rounded-full bg-muted/60" />
                      <Skeleton className="h-4 w-8 rounded-full bg-muted/70" />
                    </FintechLoadingSurface>
                  ))}
                </div>
              ) : sectionStatus.scoreDetalhado.isError ? (
                <div className="px-4 pb-4">
                  <SectionErrorState compact message={sectionStatus.scoreDetalhado.message} />
                </div>
              ) : (
                <div className="space-y-3 px-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Pontuação geral</span>
                        <span className={`text-xs font-bold ${scoreLabelColor}`}>{score.classificacao}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor}`} style={{ width: `${score.valor}%` }} />
                        </div>
                        <span className={`text-sm font-bold ${scoreLabelColor}`}>{score.valor}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {score.fatores.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-2 text-xs">
                        <span className="min-w-0 break-words text-muted-foreground">{f.label}</span>
                        <span className={`ml-2 flex-shrink-0 font-semibold ${f.tipo === "positivo" ? "text-emerald-600" : f.tipo === "negativo" ? "text-red-600" : "text-muted-foreground"}`}>
                          {f.impacto > 0 ? "+" : ""}{f.impacto}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showContextualTips && (
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Dica rápida</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Priorize quitar os itens vencidos da semana para proteger seu fluxo de caixa do mês.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
      <div className="app-page-shell app-section-stack" data-testid="dashboard-page">
      <DashboardPageHeader
        title="Painel"
        subtitle="Visão financeira consolidada do período."
        selectedMonth={selectedMonth}
        monthOptions={monthOptions}
        onMonthChange={setSelectedMonth}
        settingsContent={desktopSettingsContent}
        showAdvancedResources={showAdvancedResources}
        scoreStatus={sectionStatus.score}
        score={score}
        scoreBarColor={scoreBarColor}
        scoreLabelColor={scoreLabelColor}
      />

      {!prefs.hiddenDashCards.includes("saldo") && (
        sectionStatus.saldo.isLoading ? (
          <FintechLoadingSurface className="rounded-2xl" contentClassName="p-[14px] md:p-[18px]">
            <Skeleton className="h-3 w-24 rounded-full bg-muted/60" />
            <Skeleton className="mt-3 h-10 w-44 rounded-xl bg-muted/70" />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[1, 2].map((idx) => (
                <FintechLoadingSurface
                  key={idx}
                  tone="inset"
                  className="rounded-xl shadow-none"
                  contentClassName="px-3 py-2.5"
                >
                  <Skeleton className="h-3 w-16 rounded-full bg-muted/55" />
                  <Skeleton className="mt-2 h-4 w-24 rounded-full bg-muted/70" />
                </FintechLoadingSurface>
              ))}
            </div>
          </FintechLoadingSurface>
        ) : sectionStatus.saldo.isError ? (
          <SectionErrorState message={sectionStatus.saldo.message} />
        ) : (
          <Card
            className={`border-0 shadow-sm ${saldoPrevisto >= 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
            data-testid="desktop-saldo-hero"
          >
            <CardContent className="p-[14px] md:p-[18px]">
              <p className="mb-1 text-[12px] uppercase tracking-wide opacity-85">Saldo do mês</p>
              <p className="fin-value-hero">
                {maskValue(formatCurrencyBRL(saldoPrevisto), visible)}
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] uppercase tracking-wide opacity-80">Entradas</p>
                  <p className="text-sm font-semibold">{maskValue(formatCurrencyBRL(totalRenda), visible)}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <p className="text-[12px] uppercase tracking-wide opacity-80">Saídas</p>
                  <p className="text-sm font-semibold">
                    {maskValue(formatCurrencyBRL(totalCartoesMes + totalPagarMes + totalServicos), visible)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      )}

      <DashboardSummaryCards
        status={sectionStatus.cardsResumo}
        cards={summaryCards}
        hiddenCardIds={prefs.hiddenDashCards}
        compact={prefs.dashboardCompact}
      />

      <DashboardInsights
        shouldRenderAlertasSection={shouldRenderAlertasSection}
        showAdvancedResources={showAdvancedResources}
        alertasStatus={sectionStatus.alertas}
        insightsStatus={sectionStatus.insights}
        alertasUrgentes={alertasUrgentes}
        insightsOportunidades={insightsOportunidades}
        insightIconMap={insightIconMap}
        fallbackInsightActionByIcon={fallbackInsightActionByIcon}
        onNavigate={setLocation}
      />

      <DashboardFinancialOverview
        proximosStatus={sectionStatus.proximosVencimentos}
        scoreDetalhadoStatus={sectionStatus.scoreDetalhado}
        pagarSemanaStatus={sectionStatus.pagarSemana}
        proximosVencimentos={proximosVencimentos}
        pagarSemana={pagarSemana}
        pendingActionId={pendingVencimentoActionId}
        score={score}
        scoreBarColor={scoreBarColor}
        scoreLabelColor={scoreLabelColor}
        pessoasCount={pessoas.length}
        dividasQuitadas={dividas.filter((d) => d.status === "pago").length}
        showAdvancedResources={showAdvancedResources}
        showContextualTips={showContextualTips}
        today={today}
        in7Days={in7Days}
        formatMoney={(value) => maskValue(formatCurrencyBRL(value), visible)}
        onTriggerAction={(item) => {
          void handleTriggerVencimentoAction(item);
        }}
      />

      <CartaoFaturaPaymentDialog
        open={!!invoicePaymentTarget}
        onOpenChange={(open) => {
          if (!open) {
            setInvoicePaymentTarget(null);
          }
        }}
        cartao={selectedInvoicePaymentCartao}
        monthReference={invoicePaymentTarget?.monthReference ?? selectedMonth}
        snapshot={selectedInvoicePaymentSnapshot}
        payments={selectedInvoicePaymentHistory}
        installments={selectedInvoiceInstallments}
        isPending={registerInvoicePaymentMutation.isPending}
        cancelPendingPaymentId={cancelPendingPaymentId}
        formatCurrency={(value) => formatCurrencyBRL(value)}
        formatMonthLabel={(monthReference) => {
          const label = format(new Date(`${monthReference}-01T00:00:00`), "MMMM 'de' yyyy", { locale: ptBR });
          return label.charAt(0).toUpperCase() + label.slice(1);
        }}
        onSubmit={handleRegisterInvoicePayment}
        onCancelPayment={handleCancelInvoicePayment}
      />
    </div>
  );
}






