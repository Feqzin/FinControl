import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DashboardOverviewResponse } from "@shared/financial";
import type { FuturePurchaseSimulation, Parcela } from "@shared/schema";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Copy,
  CreditCard,
  FolderOpen,
  Loader2,
  PiggyBank,
  Plus,
  ReceiptText,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { parseMoney } from "@/lib/money";
import {
  buildFuturePurchaseSimulation,
  canBuildFuturePurchaseSimulationInput,
  listFuturePurchaseReceivablePersonOptions,
  type FuturePurchaseExtraReceivable,
  type FuturePurchaseSimulationInput,
  type FuturePurchaseSimulationSuggestion,
} from "@/pages/simulador/future-purchase-simulation";
import { fetchDashboardOverview } from "@/services/api/dashboard";
import {
  createFuturePurchaseSimulation,
  deleteFuturePurchaseSimulation,
  getFuturePurchaseSimulation,
  listFuturePurchaseSimulations,
  updateFuturePurchaseSimulation,
} from "@/services/api/simulador";

type FuturePurchaseTabProps = {
  resetSignal: number;
};

type ExtraReceivableFormRow = {
  id: string;
  descricao: string;
  valor: string;
  data: string;
  recorrente: boolean;
};

const FUTURE_PURCHASE_SIMULATION_DEBOUNCE_MS = 250;
const SAVED_SIMULATIONS_QUERY_KEY = ["/api/simulador/compra-futura/simulacoes"] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "Agora";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function numberToInputValue(value: string | number | null | undefined): string {
  const parsed = parseMoney(typeof value === "number" ? String(value) : value ?? "");
  if (parsed == null || parsed === 0) return "";
  return String(parsed);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

function createExtraReceivableRow(defaultMonth: string): ExtraReceivableFormRow {
  return {
    id: `extra-${Math.random().toString(36).slice(2, 11)}`,
    descricao: "",
    valor: "",
    data: `${defaultMonth}-05`,
    recorrente: false,
  };
}

function buildSuggestionIcon(suggestion: FuturePurchaseSimulationSuggestion) {
  if (suggestion.kind === "fit") {
    return <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />;
  }
  if (suggestion.kind === "installments") {
    return <CreditCard className="mt-0.5 h-4 w-4 text-sky-600" />;
  }
  if (suggestion.kind === "extra_income" || suggestion.kind === "timing") {
    return <ArrowUpRight className="mt-0.5 h-4 w-4 text-emerald-600" />;
  }
  if (suggestion.kind === "reserve") {
    return <PiggyBank className="mt-0.5 h-4 w-4 text-amber-600" />;
  }
  if (suggestion.kind === "card_limit") {
    return <CreditCard className="mt-0.5 h-4 w-4 text-red-600" />;
  }
  return <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />;
}

function getSimpleStatusLabel(status: "Pode comprar" | "Atenção" | "Não recomendado"): string {
  if (status === "Pode comprar") return "A compra cabe no orçamento";
  if (status === "Atenção") return "A compra cabe, mas aperta o orçamento";
  return "Melhor não comprar agora";
}

export function FuturePurchaseTab({ resetSignal }: FuturePurchaseTabProps) {
  const { visible } = useValuesVisibility();
  const { toast } = useToast();
  const currentMonth = format(new Date(), "yyyy-MM");
  const fc = (value: number) => maskValue(formatCurrency(value), visible);

  const overviewQuery = useQuery<DashboardOverviewResponse>({
    queryKey: ["/api/dashboard/overview", currentMonth],
    queryFn: () => fetchDashboardOverview(currentMonth),
  });
  const parcelasQuery = useQuery<Parcela[]>({
    queryKey: ["/api/parcelas"],
  });
  const savedSimulationsQuery = useQuery<FuturePurchaseSimulation[]>({
    queryKey: [...SAVED_SIMULATIONS_QUERY_KEY],
    queryFn: listFuturePurchaseSimulations,
  });

  const isLoading = overviewQuery.isLoading || parcelasQuery.isLoading;
  const error = overviewQuery.error ?? parcelasQuery.error;

  const [nomeSimulacao, setNomeSimulacao] = useState("");
  const [nomeCompra, setNomeCompra] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [parcelas, setParcelas] = useState("10");
  const [cartaoId, setCartaoId] = useState("");
  const [mesPrimeiraParcela, setMesPrimeiraParcela] = useState(currentMonth);
  const [reservaMinima, setReservaMinima] = useState("");
  const [entradasExtras, setEntradasExtras] = useState<ExtraReceivableFormRow[]>([]);
  const [includeLiquidAssets, setIncludeLiquidAssets] = useState(true);
  const [includePersonalDebts, setIncludePersonalDebts] = useState(true);
  const [includeCardCommitments, setIncludeCardCommitments] = useState(true);
  const [includeExpectedReceivables, setIncludeExpectedReceivables] = useState(false);
  const [includePersonalReceivables, setIncludePersonalReceivables] = useState(true);
  const [includeCardReceivables, setIncludeCardReceivables] = useState(true);
  const [selectedReceivablePersonIds, setSelectedReceivablePersonIds] = useState<string[]>([]);
  const [savedSimulationsOpen, setSavedSimulationsOpen] = useState(false);
  const [activeSimulationId, setActiveSimulationId] = useState<string | null>(null);
  const [loadingSavedSimulationId, setLoadingSavedSimulationId] = useState<string | null>(null);

  const resetLocalScenario = (nextCardId?: string) => {
    setActiveSimulationId(null);
    setNomeSimulacao("");
    setNomeCompra("");
    setValorTotal("");
    setParcelas("10");
    setCartaoId(nextCardId ?? "");
    setMesPrimeiraParcela(currentMonth);
    setReservaMinima("");
    setEntradasExtras([]);
    setIncludeLiquidAssets(true);
    setIncludePersonalDebts(true);
    setIncludeCardCommitments(true);
    setIncludeExpectedReceivables(false);
    setIncludePersonalReceivables(true);
    setIncludeCardReceivables(true);
    setSelectedReceivablePersonIds([]);
  };

  useEffect(() => {
    if (!cartaoId && overviewQuery.data?.cartoes[0]?.id) {
      setCartaoId(overviewQuery.data.cartoes[0].id);
    }
  }, [cartaoId, overviewQuery.data]);

  useEffect(() => {
    resetLocalScenario(overviewQuery.data?.cartoes[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const entradasExtrasNormalizadas = useMemo<FuturePurchaseExtraReceivable[]>(
    () => entradasExtras.map((row) => ({
      id: row.id,
      descricao: row.descricao,
      valor: parseMoney(row.valor) ?? 0,
      data: row.data,
      recorrente: row.recorrente,
    })),
    [entradasExtras],
  );

  const immediateSimulationInput = useMemo<FuturePurchaseSimulationInput>(() => ({
    nomeCompra,
    valorTotal: parseMoney(valorTotal) ?? 0,
    parcelas: Math.max(1, Math.trunc(Number(parcelas) || 1)),
    cartaoId,
    mesPrimeiraParcela,
    reservaMinima: parseMoney(reservaMinima) ?? 0,
    entradasExtras: entradasExtrasNormalizadas,
    includeLiquidAssets,
    includePersonalDebts,
    includeCardCommitments,
    includeExpectedReceivables,
    includePersonalReceivables,
    includeCardReceivables,
    selectedReceivablePersonIds,
  }), [cartaoId, entradasExtrasNormalizadas, includeCardCommitments, includeCardReceivables, includeExpectedReceivables, includeLiquidAssets, includePersonalDebts, includePersonalReceivables, mesPrimeiraParcela, nomeCompra, parcelas, reservaMinima, selectedReceivablePersonIds, valorTotal]);

  const debouncedSimulationInput = useDebouncedValue(
    immediateSimulationInput,
    FUTURE_PURCHASE_SIMULATION_DEBOUNCE_MS,
  );

  const simulationContext = useMemo(() => {
    if (!overviewQuery.data || !parcelasQuery.data) return null;

    return {
      cartoes: overviewQuery.data.cartoes,
      compras: overviewQuery.data.compras,
      parcelasCompra: overviewQuery.data.parcelasCompra,
      cartaoFaturaPagamentos: overviewQuery.data.cartaoFaturaPagamentos,
      dividas: overviewQuery.data.dividas,
      parcelas: parcelasQuery.data,
      servicos: overviewQuery.data.servicos,
      servicoCobrancaPagamentos: overviewQuery.data.servicoCobrancaPagamentos,
      rendas: overviewQuery.data.rendas,
      patrimonios: overviewQuery.data.patrimonios,
      pessoas: overviewQuery.data.pessoas,
    };
  }, [overviewQuery.data, parcelasQuery.data]);

  const receivablePersonOptions = useMemo(
    () => simulationContext ? listFuturePurchaseReceivablePersonOptions(simulationContext) : [],
    [simulationContext],
  );

  const handleExpectedReceivablesToggle = (checked: boolean) => {
    setIncludeExpectedReceivables(checked);
    if (checked && selectedReceivablePersonIds.length === 0) {
      setSelectedReceivablePersonIds(receivablePersonOptions.map((pessoa) => pessoa.id));
    }
  };

  const handleReceivablePersonToggle = (personId: string, checked: boolean) => {
    setSelectedReceivablePersonIds((current) => (
      checked
        ? Array.from(new Set([...current, personId]))
        : current.filter((id) => id !== personId)
    ));
  };

  const canSimulateImmediately = Boolean(simulationContext)
    && canBuildFuturePurchaseSimulationInput(immediateSimulationInput);
  const canSimulateDebounced = Boolean(simulationContext)
    && canBuildFuturePurchaseSimulationInput(debouncedSimulationInput);
  const isSimulationUpdating = canSimulateImmediately && debouncedSimulationInput !== immediateSimulationInput;

  const simulation = useMemo(() => {
    if (!canSimulateDebounced || !simulationContext) return null;
    return buildFuturePurchaseSimulation(simulationContext, debouncedSimulationInput);
  }, [canSimulateDebounced, debouncedSimulationInput, simulationContext]);

  const selectedCard = useMemo(
    () => overviewQuery.data?.cartoes.find((card) => card.id === cartaoId) ?? null,
    [cartaoId, overviewQuery.data],
  );

  const buildSavePayload = () => {
    if (!simulation) return null;

    return {
      nome: nomeSimulacao.trim() || nomeCompra.trim() || "Simulação de compra futura",
      purchaseName: nomeCompra.trim() || null,
      totalAmount: parseMoney(valorTotal) ?? 0,
      installmentCount: Math.max(1, Math.trunc(Number(parcelas) || 1)),
      cardId: cartaoId || null,
      firstInstallmentMonth: mesPrimeiraParcela,
      minimumReserve: parseMoney(reservaMinima) ?? 0,
      includeLiquidAssets,
      includePersonalDebts,
      includeCardCommitments,
      includeExpectedReceivables,
      includePersonalReceivables,
      includeCardReceivables,
      selectedReceivablePersonIds,
      extraIncomes: entradasExtrasNormalizadas,
      resultStatus: simulation.status,
      worstMonth: simulation.worstMonth?.monthReference ?? null,
      lowestBalance: simulation.lowestBalance,
      safePurchaseAmount: simulation.safePurchaseAmount,
      recommendedInstallments: simulation.recommendedInstallmentCount,
      monthlyTimelineSnapshot: simulation.months,
    };
  };

  const applySavedSimulationToForm = (savedSimulation: FuturePurchaseSimulation) => {
    setActiveSimulationId(savedSimulation.id);
    setNomeSimulacao(savedSimulation.nome ?? "");
    setNomeCompra(savedSimulation.purchaseName ?? "");
    setValorTotal(numberToInputValue(savedSimulation.totalAmount));
    setParcelas(String(savedSimulation.installmentCount ?? 1));
    setCartaoId(savedSimulation.cardId ?? "");
    setMesPrimeiraParcela(savedSimulation.firstInstallmentMonth);
    setReservaMinima(numberToInputValue(savedSimulation.minimumReserve));
    setIncludeLiquidAssets(savedSimulation.includeLiquidAssets !== false);
    setIncludePersonalDebts(savedSimulation.includePersonalDebts !== false);
    setIncludeCardCommitments(savedSimulation.includeCardCommitments !== false);
    setIncludeExpectedReceivables(savedSimulation.includeExpectedReceivables === true);
    setIncludePersonalReceivables(savedSimulation.includePersonalReceivables !== false);
    setIncludeCardReceivables(savedSimulation.includeCardReceivables !== false);
    setSelectedReceivablePersonIds(
      savedSimulation.selectedReceivablePersonIds == null && savedSimulation.includeExpectedReceivables === true
        ? receivablePersonOptions.map((pessoa) => pessoa.id)
        : savedSimulation.selectedReceivablePersonIds ?? [],
    );
    setEntradasExtras((savedSimulation.extraIncomes ?? []).map((entry) => ({
      id: entry.id,
      descricao: entry.descricao,
      valor: String(entry.valor),
      data: entry.data,
      recorrente: entry.recorrente,
    })));
  };

  const saveSimulationMutation = useMutation({
    mutationFn: async (mode: "create" | "update") => {
      const payload = buildSavePayload();
      if (!payload) {
        throw new Error("Preencha os dados mínimos e gere a projeção antes de salvar.");
      }

      if (mode === "update" && activeSimulationId) {
        return updateFuturePurchaseSimulation(activeSimulationId, payload);
      }

      return createFuturePurchaseSimulation(payload);
    },
    onSuccess: async (savedSimulation, mode) => {
      setActiveSimulationId(savedSimulation.id);
      setNomeSimulacao(savedSimulation.nome ?? "");
      await queryClient.invalidateQueries({ queryKey: [...SAVED_SIMULATIONS_QUERY_KEY] });
      toast({
        title: mode === "update" ? "Simulação atualizada" : "Simulação salva",
        description: "O cenário foi armazenado sem criar compra real no banco.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar simulação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSimulationMutation = useMutation({
    mutationFn: async (simulationId: string) => {
      await deleteFuturePurchaseSimulation(simulationId);
      return simulationId;
    },
    onSuccess: async (simulationId) => {
      if (activeSimulationId === simulationId) {
        setActiveSimulationId(null);
      }
      await queryClient.invalidateQueries({ queryKey: [...SAVED_SIMULATIONS_QUERY_KEY] });
      toast({
        title: "Simulação excluída",
        description: "A simulação salva foi removida sem afetar dados reais.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir simulação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addExtraReceivable = () => {
    setEntradasExtras((current) => [...current, createExtraReceivableRow(mesPrimeiraParcela)]);
  };

  const handleOpenSavedSimulation = async (simulationId: string) => {
    setLoadingSavedSimulationId(simulationId);
    try {
      const savedSimulation = await getFuturePurchaseSimulation(simulationId);
      applySavedSimulationToForm(savedSimulation);
      setSavedSimulationsOpen(false);
      toast({
        title: "Simulação carregada",
        description: "Os dados salvos preencheram o formulário atual.",
      });
    } catch (error) {
      toast({
        title: "Erro ao abrir simulação",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setLoadingSavedSimulationId(null);
    }
  };

  const handleDuplicateSavedSimulation = (savedSimulation: FuturePurchaseSimulation) => {
    applySavedSimulationToForm(savedSimulation);
    setActiveSimulationId(null);
    setNomeSimulacao(`${savedSimulation.nome} (cópia)`);
    setSavedSimulationsOpen(false);
    toast({
      title: "Simulação duplicada",
      description: "A cópia foi carregada no formulário sem sobrescrever a original.",
    });
  };

  const handleDeleteSavedSimulation = async (savedSimulation: FuturePurchaseSimulation) => {
    const confirmed = window.confirm(`Excluir a simulação "${savedSimulation.nome}"?`);
    if (!confirmed) return;
    await deleteSimulationMutation.mutateAsync(savedSimulation.id);
  };

  const savedCardName = (cardId: string | null) => {
    if (!cardId) return "Sem cartão";
    return overviewQuery.data?.cartoes.find((card) => card.id === cardId)?.nome ?? "Cartão removido";
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/25 bg-red-500/5">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600">
                <ShieldAlert className="h-4 w-4" />
                <p className="font-semibold">Não foi possível carregar a simulação de compra futura</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Tente novamente em instantes."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void overviewQuery.refetch();
                void parcelasQuery.refetch();
              }}
            >
              Recarregar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6" data-testid="simulador-compra-futura-tab">
        <Card className={
          simulation?.status === "Não recomendado"
            ? "border-red-500/30 bg-red-500/5"
            : simulation?.status === "Atenção"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
        }
        >
          <CardContent className="pt-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      simulation?.status === "Não recomendado"
                        ? "w-fit border-red-500/30 bg-red-500/10 text-red-700"
                        : simulation?.status === "Atenção"
                          ? "w-fit border-amber-500/30 bg-amber-500/10 text-amber-700"
                          : "w-fit border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                    }
                  >
                    {simulation ? getSimpleStatusLabel(simulation.status) : "Aguardando dados"}
                  </Badge>
                  {activeSimulationId ? (
                    <Badge variant="outline" className="border-border/70 bg-background/80 text-foreground">
                      Simulação salva em edição
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-semibold tracking-tight">Compra Futura</h3>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Simule uma compra parcelada sem mexer nos seus dados reais e veja mês a mês se o cenário segue saudável.
                  </p>
                  {simulation ? (
                    <p className={`text-sm font-medium ${
                      simulation.status === "Não recomendado"
                        ? "text-red-700"
                        : simulation.status === "Atenção"
                          ? "text-amber-700"
                          : "text-emerald-700"
                    }`}
                    >
                      {simulation.status === "Pode comprar"
                        ? `Depois de pagar a compra e os compromissos marcados, o menor saldo previsto é ${fc(simulation.lowestBalance)}.`
                        : simulation.cardLimitAssessment.applicable && !simulation.cardLimitAssessment.fits
                          ? `O cartão não tem limite suficiente: faltam ${fc(simulation.cardLimitShortfall)}.`
                          : simulation.status === "Atenção"
                            ? `No mês mais apertado, o saldo pode cair para ${fc(simulation.lowestBalance)} e ficar abaixo da reserva desejada.`
                            : `No mês mais apertado, faltariam ${fc(Math.abs(simulation.lowestBalance))} para fechar as contas.`}
                    </p>
                  ) : null}
                  {simulation?.lateExtraIncomeWarning ? (
                    <p className="text-xs font-medium text-amber-700">
                      {simulation.lateExtraIncomeWarning}
                    </p>
                  ) : null}
                  {isSimulationUpdating ? (
                    <p className="text-xs font-medium text-muted-foreground">
                      Atualizando simulação...
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                    {includeLiquidAssets
                      ? `Patrimônio usado como saldo inicial: ${simulation ? fc(simulation.initialAvailableBalance) : fc(0)}`
                      : "Patrimônio fora do cálculo"}
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                    Dívidas pessoais {includePersonalDebts ? "incluídas" : "ignoradas"}
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                    Faturas atuais {includeCardCommitments ? "incluídas" : "ignoradas no orçamento"}
                  </span>
                  {selectedCard ? (
                    <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                      Cartão: {selectedCard.nome} · vencimento dia {selectedCard.diaVencimento}
                    </span>
                  ) : null}
                  {simulation?.cardLimitAssessment.applicable ? (
                    <span className={`rounded-full border px-3 py-1 ${
                      simulation.cardLimitAssessment.fits
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : "border-red-500/30 bg-red-500/10 text-red-700"
                    }`}
                    >
                      {simulation.cardLimitAssessment.fits ? "Cabe no limite do cartão" : "Não cabe no limite do cartão"}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[520px]">
                <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total da compra</p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {simulation ? fc(parseMoney(valorTotal) ?? 0) : fc(0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Parcela por mês</p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {simulation ? fc(simulation.installmentAmount) : fc(0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Dinheiro extra informado</p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {simulation ? fc(simulation.totalSimulatedExtraIncome) : fc(0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mês mais apertado</p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {simulation?.worstMonth?.label ?? "Defina a compra"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Menor saldo previsto</p>
                  <p className={`mt-2 text-base font-semibold ${simulation && simulation.lowestBalance < 0 ? "text-red-600" : "text-foreground"}`}>
                    {simulation ? fc(simulation.lowestBalance) : fc(0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Limite que sobra</p>
                  <p className={`mt-2 text-base font-semibold ${
                    simulation?.cardLimitAssessment.applicable && !simulation.cardLimitAssessment.fits
                      ? "text-red-600"
                      : "text-foreground"
                  }`}
                  >
                    {simulation?.cardLimitAssessment.applicable
                      ? fc(simulation.cardLimitAssessment.availableAfterPurchase)
                      : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4" />
                Dados da compra simulada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="future-simulation-name">Nome da simulação</Label>
                  <Input
                    id="future-simulation-name"
                    value={nomeSimulacao}
                    onChange={(event) => setNomeSimulacao(event.target.value)}
                    placeholder="Ex.: GPU outubro 2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="future-purchase-name">Nome da compra</Label>
                  <Input
                    id="future-purchase-name"
                    value={nomeCompra}
                    onChange={(event) => setNomeCompra(event.target.value)}
                    placeholder="Ex.: Notebook novo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="future-purchase-value">Valor total</Label>
                  <Input
                    id="future-purchase-value"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={valorTotal}
                    onChange={(event) => setValorTotal(event.target.value)}
                    placeholder="2000,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="future-purchase-installments">Número de parcelas</Label>
                  <Input
                    id="future-purchase-installments"
                    type="number"
                    min="1"
                    max="48"
                    step="1"
                    value={parcelas}
                    onChange={(event) => setParcelas(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cartão usado</Label>
                  <Select value={cartaoId} onValueChange={setCartaoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      {(overviewQuery.data?.cartoes ?? []).map((cartao) => (
                        <SelectItem key={cartao.id} value={cartao.id}>
                          {cartao.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="future-purchase-month">Mês da primeira parcela</Label>
                  <Input
                    id="future-purchase-month"
                    type="month"
                    min={currentMonth}
                    value={mesPrimeiraParcela}
                    onChange={(event) => setMesPrimeiraParcela(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="future-purchase-reserve">Reserva mínima desejada</Label>
                  <Input
                    id="future-purchase-reserve"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={reservaMinima}
                    onChange={(event) => setReservaMinima(event.target.value)}
                    placeholder="500,00"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/15 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">O que deve entrar no cálculo?</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Marque somente o dinheiro e os compromissos que você quer considerar. O limite real do cartão sempre será respeitado.
                  </p>
                </div>

                <div className="grid gap-3 2xl:grid-cols-2">
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-4">
                    <div className="space-y-1">
                      <Label htmlFor="include-liquid-assets" className="cursor-pointer font-medium">Patrimônio disponível hoje</Label>
                      <p className="text-xs leading-5 text-muted-foreground">Usa contas bancárias, dinheiro e poupança como saldo inicial.</p>
                    </div>
                    <Switch id="include-liquid-assets" checked={includeLiquidAssets} onCheckedChange={setIncludeLiquidAssets} />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-4">
                    <div className="space-y-1">
                      <Label htmlFor="include-personal-debts" className="cursor-pointer font-medium">Dívidas pessoais a pagar</Label>
                      <p className="text-xs leading-5 text-muted-foreground">Desconta as dívidas pessoais previstas durante as parcelas.</p>
                    </div>
                    <Switch id="include-personal-debts" checked={includePersonalDebts} onCheckedChange={setIncludePersonalDebts} />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-4">
                    <div className="space-y-1">
                      <Label htmlFor="include-card-commitments" className="cursor-pointer font-medium">Faturas e compras dos cartões</Label>
                      <p className="text-xs leading-5 text-muted-foreground">Desconta as faturas atuais do orçamento projetado.</p>
                    </div>
                    <Switch id="include-card-commitments" checked={includeCardCommitments} onCheckedChange={setIncludeCardCommitments} />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-4">
                    <div className="space-y-1">
                      <Label htmlFor="include-expected-receivables" className="cursor-pointer font-medium">Valores que outras pessoas devem</Label>
                      <p className="text-xs leading-5 text-muted-foreground">Fica desligado por padrão para não depender de um recebimento incerto.</p>
                    </div>
                    <Switch id="include-expected-receivables" checked={includeExpectedReceivables} onCheckedChange={handleExpectedReceivablesToggle} />
                  </div>
                </div>

                {includeExpectedReceivables && (
                  <div className="space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">De quem você espera receber?</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Selecione apenas pessoas em quem você quer confiar nesta projeção. Valores vencidos entram no primeiro mês.
                        </p>
                      </div>
                      <p className="text-xs font-medium text-sky-600">
                        {selectedReceivablePersonIds.length} {selectedReceivablePersonIds.length === 1 ? "pessoa selecionada" : "pessoas selecionadas"}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-3">
                        <div className="space-y-1">
                          <Label htmlFor="include-personal-receivables" className="cursor-pointer text-sm font-medium">Dívidas pessoais</Label>
                          <p className="text-xs text-muted-foreground">Inclui dívidas manuais com expectativa de recebimento.</p>
                        </div>
                        <Switch id="include-personal-receivables" checked={includePersonalReceivables} onCheckedChange={setIncludePersonalReceivables} />
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-3">
                        <div className="space-y-1">
                          <Label htmlFor="include-card-receivables" className="cursor-pointer text-sm font-medium">Parcelas de cartão</Label>
                          <p className="text-xs text-muted-foreground">Inclui reembolsos pendentes de compras vinculadas.</p>
                        </div>
                        <Switch id="include-card-receivables" checked={includeCardReceivables} onCheckedChange={setIncludeCardReceivables} />
                      </div>
                    </div>

                    {receivablePersonOptions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                        Nenhuma pessoa possui dívida pessoal esperada ou reembolso de cartão pendente.
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {receivablePersonOptions.map((pessoa) => {
                          const checked = selectedReceivablePersonIds.includes(pessoa.id);
                          return (
                            <label
                              key={pessoa.id}
                              htmlFor={`receivable-person-${pessoa.id}`}
                              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/80 p-3 transition-colors hover:border-sky-500/40 hover:bg-sky-500/5"
                            >
                              <Checkbox
                                id={`receivable-person-${pessoa.id}`}
                                checked={checked}
                                onCheckedChange={(value) => handleReceivablePersonToggle(pessoa.id, value === true)}
                              />
                              <span className="min-w-0 space-y-2">
                                <span className="block truncate text-sm font-medium text-foreground">{pessoa.nome}</span>
                                <span className="flex flex-wrap gap-1.5">
                                  {pessoa.hasPersonalReceivables && <Badge variant="outline">Dívidas pessoais</Badge>}
                                  {pessoa.hasCardReceivables && <Badge variant="outline">Cartão</Badge>}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-xs leading-5 text-muted-foreground">
                      Dívidas marcadas como “Sem expectativa” continuam fora do cálculo, mesmo quando a pessoa estiver selecionada.
                    </p>
                  </div>
                )}
              </div>

              {simulation ? (
                <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 md:grid-cols-2 2xl:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Compra máxima segura</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{fc(simulation.safePurchaseAmount)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Limitado por {simulation.safePurchaseAmountLimitedBy === "limite_cartao"
                        ? "limite do cartão"
                        : simulation.safePurchaseAmountLimitedBy === "ambos"
                          ? "fluxo e limite"
                          : "fluxo de caixa"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sugestão de parcelas</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {simulation.recommendedInstallmentCount ? `${simulation.recommendedInstallmentCount}x` : "Nenhuma segura"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Meses abaixo da reserva</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{simulation.monthsBelowReserveCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Meses no vermelho</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{simulation.monthsNegativeCount}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                  Preencha ao menos o valor, a quantidade de parcelas, o cartão e o mês da primeira parcela para gerar a projeção.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                Entradas extras simuladas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Adicione entradas futuras sem salvar nada no sistema. Elas entram apenas nesta projeção e respeitam o mês em que foram definidas.
              </p>

              <div className="space-y-3">
                {entradasExtras.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 p-4 text-sm text-muted-foreground">
                    Nenhuma entrada extra simulada por enquanto.
                  </div>
                ) : entradasExtras.map((entrada) => (
                  <div key={entrada.id} className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Input
                          value={entrada.descricao}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setEntradasExtras((current) => current.map((item) => (
                              item.id === entrada.id ? { ...item, descricao: nextValue } : item
                            )));
                          }}
                          placeholder="Ex.: freela, bônus, venda"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valor</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={entrada.valor}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setEntradasExtras((current) => current.map((item) => (
                              item.id === entrada.id ? { ...item, valor: nextValue } : item
                            )));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data</Label>
                        <Input
                          type="date"
                          value={entrada.data}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setEntradasExtras((current) => current.map((item) => (
                              item.id === entrada.id ? { ...item, data: nextValue } : item
                            )));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                          value={entrada.recorrente ? "recorrente" : "unica"}
                          onValueChange={(value) => {
                            setEntradasExtras((current) => current.map((item) => (
                              item.id === entrada.id ? { ...item, recorrente: value === "recorrente" } : item
                            )));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unica">Única</SelectItem>
                            <SelectItem value="recorrente">Recorrente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setEntradasExtras((current) => current.filter((item) => item.id !== entrada.id))}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={addExtraReceivable}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar entrada extra
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4" />
                Entenda o resultado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!simulation ? (
                <p className="text-sm text-muted-foreground">
                  A simulação vai mostrar aqui se a compra cabe, se pressiona a reserva ou se não é recomendada.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">O cálculo considerou</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                        <p className="text-sm font-medium text-foreground">Patrimônio disponível</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {simulation.calculationBasis.includeLiquidAssets
                            ? `${fc(simulation.calculationBasis.liquidAssetsUsed)} usados como saldo inicial`
                            : `Não considerado · disponível hoje: ${fc(simulation.calculationBasis.liquidAssetsAvailable)}`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                        <p className="text-sm font-medium text-foreground">Dívidas pessoais</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {simulation.calculationBasis.includePersonalDebts
                            ? `${fc(simulation.calculationBasis.personalDebtsConsidered)} descontados no período`
                            : "Não consideradas nesta simulação"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                        <p className="text-sm font-medium text-foreground">Faturas atuais</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {simulation.calculationBasis.includeCardCommitments
                            ? `${fc(simulation.calculationBasis.cardCommitmentsConsidered)} descontados no período`
                            : "Fora do orçamento; o limite real ainda foi respeitado"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                        <p className="text-sm font-medium text-foreground">Valores a receber</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {simulation.calculationBasis.includeExpectedReceivables
                            ? simulation.calculationBasis.selectedReceivablePeople.length > 0
                              ? `${fc(simulation.calculationBasis.expectedReceivablesConsidered)} de ${simulation.calculationBasis.selectedReceivablePeople.join(", ")}`
                              : "Nenhuma pessoa selecionada"
                            : "Não considerados, deixando a projeção mais conservadora"}
                        </p>
                        {simulation.calculationBasis.includeExpectedReceivables && simulation.calculationBasis.selectedReceivablePeople.length > 0 && (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            Dívidas pessoais: {fc(simulation.calculationBasis.personalReceivablesConsidered)} · Cartões: {fc(simulation.calculationBasis.cardReceivablesConsidered)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">O que você pode fazer</p>
                  <div className="space-y-3">
                    {simulation.suggestions.length === 0 ? (
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-4 text-sm text-muted-foreground">
                        Nenhuma observação adicional além do resultado principal.
                      </div>
                    ) : simulation.suggestions.map((suggestion) => (
                      <div key={`${suggestion.kind}-${suggestion.text}`} className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          {buildSuggestionIcon(suggestion)}
                          <p className="text-sm leading-6 text-foreground">{suggestion.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Dinheiro que você quer preservar</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{fc(immediateSimulationInput.reservaMinima)}</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Valor que faltaria para não apertar</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{fc(simulation.extraAmountNeeded)}</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Limite livre hoje</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {simulation.cardLimitAssessment.applicable
                          ? fc(simulation.cardLimitAssessment.availableBeforePurchase)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total usado após a compra</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {simulation.cardLimitAssessment.applicable
                          ? fc(simulation.cardLimitAssessment.committedAfterPurchase)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Limite que sobra</p>
                      <p className={`mt-1 text-lg font-semibold ${
                        simulation.cardLimitAssessment.applicable && !simulation.cardLimitAssessment.fits
                          ? "text-red-600"
                          : "text-foreground"
                      }`}
                      >
                        {simulation.cardLimitAssessment.applicable
                          ? fc(simulation.cardLimitAssessment.availableAfterPurchase)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quanto passaria do limite</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{fc(simulation.cardLimitShortfall)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                    Salvar simulação guarda apenas o cenário e o snapshot do resultado. Nenhuma compra, fatura, renda, dívida, serviço ou patrimônio real é alterado automaticamente.
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button disabled className="sm:flex-1">
                      Adicionar compra ao cartão
                    </Button>
                    <Button
                      className="sm:flex-1"
                      disabled={!simulation || saveSimulationMutation.isPending}
                      onClick={() => saveSimulationMutation.mutate(activeSimulationId ? "update" : "create")}
                    >
                      {saveSimulationMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {activeSimulationId ? "Atualizar simulação" : "Salvar simulação"}
                    </Button>
                    {activeSimulationId ? (
                      <Button
                        variant="outline"
                        disabled={!simulation || saveSimulationMutation.isPending}
                        onClick={() => saveSimulationMutation.mutate("create")}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Salvar como nova
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={() => setSavedSimulationsOpen(true)}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      Ver simulações salvas
                    </Button>
                    <Button variant="ghost" onClick={() => resetLocalScenario(overviewQuery.data?.cartoes[0]?.id)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Linha do tempo mensal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!simulation ? (
                <p className="text-sm text-muted-foreground">
                  Assim que a compra for preenchida, esta área vai projetar entradas, saídas, faturas, parcela simulada e saldo final mês a mês.
                </p>
              ) : simulation.months.map((month) => (
                <div key={month.monthReference} className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{month.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {month.simulatedInstallment > 0 ? (
                          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700">
                            Parcela simulada
                          </Badge>
                        ) : null}
                        {month.belowZero ? (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700">
                            No vermelho
                          </Badge>
                        ) : month.belowReserve ? (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">
                            Abaixo da reserva
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                            Saudável
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className={`text-right ${month.endingBalance < 0 ? "text-red-600" : month.belowReserve ? "text-amber-600" : "text-emerald-600"}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Saldo final previsto</p>
                      <p className="text-lg font-semibold">{fc(month.endingBalance)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-6">
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Saldo inicial</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{fc(month.startingBalance)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dinheiro que entra</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-600">{fc(month.actualIncome)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dinheiro extra</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-600">{fc(month.simulatedExtraIncome)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Contas fora do cartão</p>
                      <p className="mt-1 text-sm font-semibold text-rose-600">{fc(month.actualNonCardExpenses)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Faturas existentes</p>
                      <p className="mt-1 text-sm font-semibold text-rose-600">{fc(month.actualCardExpenses)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Parcela simulada</p>
                      <p className="mt-1 text-sm font-semibold text-sky-700">{fc(month.simulatedInstallment)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Entradas extras aplicadas</p>
                      {month.extraIncomeEntries.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">Nenhuma entrada extra neste mês.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {month.extraIncomeEntries.map((entry) => (
                            <div key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{entry.descricao || "Entrada extra"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {entry.data} {entry.recorrente ? "· recorrente" : "· única"}
                                </p>
                              </div>
                              <span className="shrink-0 font-semibold text-emerald-600">{fc(entry.valor)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Itens que mais pesaram</p>
                      {month.heaviestItems.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">Nenhum item relevante além do fluxo padrão.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {month.heaviestItems.map((item) => (
                            <div key={`${month.monthReference}-${item.source}-${item.label}`} className="flex items-start justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <p className="break-words font-medium text-foreground">{item.label}</p>
                                {item.subtitle ? (
                                  <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                                ) : null}
                              </div>
                              <span className="shrink-0 font-semibold text-rose-600">{fc(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Sheet open={savedSimulationsOpen} onOpenChange={setSavedSimulationsOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Simulações salvas</SheetTitle>
            <SheetDescription className="sr-only">
              Consulte, abra, duplique ou exclua cenários salvos da aba Compra Futura.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {savedSimulationsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-2xl" />
              ))
            ) : savedSimulationsQuery.error ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-700">
                Não foi possível carregar as simulações salvas agora.
              </div>
            ) : (savedSimulationsQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 p-4 text-sm text-muted-foreground">
                Sem simulações salvas no momento.
              </div>
            ) : savedSimulationsQuery.data?.map((savedSimulation) => (
              <div key={savedSimulation.id} className="rounded-2xl border border-border/60 bg-background/90 p-4 shadow-sm">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{savedSimulation.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {savedSimulation.purchaseName ?? "Sem nome de compra"} · {savedSimulation.installmentCount}x · {savedCardName(savedSimulation.cardId)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        savedSimulation.resultStatus === "Não recomendado"
                          ? "border-red-500/30 bg-red-500/10 text-red-700"
                          : savedSimulation.resultStatus === "Atenção"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                      }
                    >
                      {savedSimulation.resultStatus ?? "Sem status"}
                    </Badge>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Valor total</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{fc(parseMoney(savedSimulation.totalAmount) ?? 0)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Menor saldo</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{fc(parseMoney(savedSimulation.lowestBalance) ?? 0)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pior mês</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{savedSimulation.worstMonth ?? "N/D"}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Criada em</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatDateTime(savedSimulation.createdAt)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => void handleOpenSavedSimulation(savedSimulation.id)}
                      disabled={loadingSavedSimulationId === savedSimulation.id}
                    >
                      {loadingSavedSimulationId === savedSimulation.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FolderOpen className="mr-2 h-4 w-4" />
                      )}
                      Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDuplicateSavedSimulation(savedSimulation)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => void handleDeleteSavedSimulation(savedSimulation)}
                      disabled={deleteSimulationMutation.isPending}
                    >
                      {deleteSimulationMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default FuturePurchaseTab;
