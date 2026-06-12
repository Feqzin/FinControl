import { useState, lazy, Suspense, useMemo } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useServicos } from "@/hooks/useServicos";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import { CompraCartaoSearchPicker } from "@/components/compra-cartao-search-picker";
import { DivisaoPanel } from "@/pages/servicos/components/divisao-panel";
import { sortServicosForView, type ServicoSortBy } from "@/pages/servicos/servicos-sort.utils";
import {
  buildServicoPeriodicidadeResumo,
  formatServicoBillingValue,
  resolveServicoBillingView,
  SERVICO_PERIODICIDADE_OPTIONS,
} from "@/pages/servicos/servico-periodicidade.utils";
import {
  decideLinkedCompraBillingValueFill,
  getCompraCartaoTotalForServico,
} from "@/pages/servicos/servico-linked-compra.utils";
import { Plus, Repeat, Trash2, Pause, Play, Users, ChevronUp, Pencil, CreditCard, Unlink2 } from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { fetchIconMatchRules, type IconMatchRuleApiModel } from "@/services/api/icon-match-rules";
import { type UserIconMatchRule } from "@/lib/purchase-icon-matching";
import { fetchUserIconLibrary, type UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";
import type { IconPickerSelectMeta } from "@/components/icon-picker";
import {
  resolveEntityIconIdForSave,
  resolveEntityIconReference,
  resolveEntityIconSuggestion,
} from "@/lib/entity-icon-suggestion";
import { formatCurrencyBRL } from "@/utils/formatters";
import type { Servico } from "@shared/schema";
import {
  calculateServicoRealMonthlyExpenseAmount,
  resolveServicoBillingFields,
  type ServicoPeriodicidade,
} from "@shared/servico-periodicidade";
import { FintechLoadingPageHeader, FintechLoadingSurface } from "@/components/layout/fintech-loading-shell";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const categorias = [
  { value: "streaming", label: "Streaming" },
  { value: "lazer", label: "Lazer" },
  { value: "software", label: "Software" },
  { value: "assinatura", label: "Assinatura" },
  { value: "cuidados_pessoais", label: "Cuidados pessoais" },
  { value: "outros", label: "Outros" },
];

const COMPRA_NONE_VALUE = "__none__";

const SERVICO_SORT_OPTIONS: Array<{ value: ServicoSortBy; label: string }> = [
  { value: "dia_cobranca_mais_proximo", label: "Dia de cobrança mais próximo" },
  { value: "dia_cobranca_mais_distante", label: "Dia de cobrança mais distante" },
  { value: "nome_az", label: "Nome A-Z" },
  { value: "nome_za", label: "Nome Z-A" },
  { value: "maior_valor", label: "Maior valor" },
  { value: "menor_valor", label: "Menor valor" },
  { value: "categoria", label: "Categoria" },
  { value: "status", label: "Status" },
  { value: "mais_recente", label: "Mais recente" },
  { value: "mais_antigo", label: "Mais antigo" },
];

const categoriaLabelByValue = new Map(categorias.map((categoria) => [categoria.value, categoria.label] as const));

function formatCategoriaFallback(categoria: string): string {
  return categoria
    .split(/[_-\s]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function hasFixedBillingDay(value: unknown): value is number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 31;
}

function formatServicoBillingDayLabel(value: unknown): string {
  if (!hasFixedBillingDay(value)) return "Sem data fixa";
  return `Dia ${Math.trunc(Number(value))}`;
}

export default function ServicosPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expandedDivisao, setExpandedDivisao] = useState<Set<string>>(new Set());
  const [servicosTab, setServicosTab] = useState<"ativos" | "pendentes" | "pagos" | "divisao" | "vinculos" | "pausados">("ativos");
  const [mesReferencia, setMesReferencia] = useState(format(new Date(), "yyyy-MM"));
  const [sortBy, setSortBy] = useState<ServicoSortBy>("dia_cobranca_mais_proximo");
  const [form, setForm] = useState({
    nome: "",
    categoria: "streaming",
    valorCobranca: "",
    periodicidadeCobranca: "mensal" as ServicoPeriodicidade,
    dataCobranca: "",
    formaPagamento: "cartao",
    compraCartaoId: COMPRA_NONE_VALUE,
  });
  const [createSemDataFixa, setCreateSemDataFixa] = useState(false);
  const [editingServico, setEditingServico] = useState<Servico | null>(null);
  const [editIcone, setEditIcone] = useState<string | null>(null);
  const [editIconPersistableId, setEditIconPersistableId] = useState<string | null>(null);
  const [editIconManualSelection, setEditIconManualSelection] = useState(false);
  const [newServicoIcone, setNewServicoIcone] = useState<string | null>(null);
  const [newServicoIconPersistableId, setNewServicoIconPersistableId] = useState<string | null>(null);
  const [newServicoIconManualSelection, setNewServicoIconManualSelection] = useState(false);
  const [editForm, setEditForm] = useState({
    nome: "",
    categoria: "streaming",
    valorCobranca: "",
    periodicidadeCobranca: "mensal" as ServicoPeriodicidade,
    dataCobranca: "",
    formaPagamento: "cartao",
    compraCartaoId: COMPRA_NONE_VALUE,
  });
  const [editSemDataFixa, setEditSemDataFixa] = useState(false);

  const {
    servicos,
    servicoPessoas,
    servicoPagamentos,
    pessoas,
    cartoes,
    compras,
    parcelasCompra,
    pessoaSaldoMovimentacoes,
    isLoading,
    createMutation,
    toggleStatusMutation,
    deleteMutation,
    updateMutation,
  } = useServicos();
  const { data: iconMatchRules = [] } = useQuery<IconMatchRuleApiModel[]>({
    queryKey: ["/api/icon-match-rules"],
    queryFn: fetchIconMatchRules,
    staleTime: 5 * 60_000,
  });
  const { data: userIconLibrary = [] } = useQuery<UserIconLibraryItemApiModel[]>({
    queryKey: ["/api/user-icon-library", "servicos"],
    queryFn: fetchUserIconLibrary,
    staleTime: 5 * 60_000,
  });

  const normalizedIconMatchRules = useMemo<UserIconMatchRule[]>(
    () => iconMatchRules.map((rule) => ({
      id: rule.id,
      iconId: rule.iconId,
      normalizedTerm: rule.normalizedTerm,
      originalTerm: rule.originalTerm,
    })),
    [iconMatchRules],
  );

  const resolveStrongAutoIconSuggestion = (text: string) =>
    resolveEntityIconSuggestion({
      name: text,
      userRules: normalizedIconMatchRules,
      userIcons: userIconLibrary,
    });

  const newServicoStrongIconSuggestion = useMemo(
    () => resolveStrongAutoIconSuggestion(form.nome),
    [form.nome, normalizedIconMatchRules, userIconLibrary],
  );
  const editServicoStrongIconSuggestion = useMemo(
    () => resolveStrongAutoIconSuggestion(editForm.nome),
    [editForm.nome, normalizedIconMatchRules, userIconLibrary],
  );

  const newServicoPreviewIconId = newServicoIconManualSelection
    ? newServicoIcone
    : (newServicoStrongIconSuggestion.shouldAutoApply ? newServicoStrongIconSuggestion.displayIconId : null);
  const editServicoPreviewIconId = editIconManualSelection
    ? editIcone
    : (editServicoStrongIconSuggestion.shouldAutoApply ? editServicoStrongIconSuggestion.displayIconId : null);

  const showNewServicoMediumSuggestion = !newServicoIconManualSelection
    && !newServicoStrongIconSuggestion.shouldAutoApply
    && newServicoStrongIconSuggestion.shouldSuggest
    && Boolean(newServicoStrongIconSuggestion.persistableIconId);
  const showEditServicoMediumSuggestion = !editIconManualSelection
    && !editServicoStrongIconSuggestion.shouldAutoApply
    && editServicoStrongIconSuggestion.shouldSuggest
    && Boolean(editServicoStrongIconSuggestion.persistableIconId);

  const resolveServiceIconId = (servico: Servico) => {
    const explicitDisplay = resolveEntityIconReference(servico.iconeId ?? null, userIconLibrary).displayIconId;
    if (explicitDisplay) return explicitDisplay;
    const suggestion = resolveStrongAutoIconSuggestion(servico.nome);
    return suggestion.shouldAutoApply ? suggestion.displayIconId : null;
  };

  const createBilling = useMemo(
    () =>
      resolveServicoBillingFields({
        periodicidadeCobranca: form.periodicidadeCobranca,
        valorCobranca: form.valorCobranca,
      }),
    [form.periodicidadeCobranca, form.valorCobranca],
  );

  const createBillingResumo = useMemo(
    () => buildServicoPeriodicidadeResumo(form.periodicidadeCobranca, form.valorCobranca),
    [form.periodicidadeCobranca, form.valorCobranca],
  );

  const editBilling = useMemo(
    () =>
      resolveServicoBillingFields({
        periodicidadeCobranca: editForm.periodicidadeCobranca,
        valorCobranca: editForm.valorCobranca,
      }),
    [editForm.periodicidadeCobranca, editForm.valorCobranca],
  );

  const editBillingResumo = useMemo(
    () => buildServicoPeriodicidadeResumo(editForm.periodicidadeCobranca, editForm.valorCobranca),
    [editForm.periodicidadeCobranca, editForm.valorCobranca],
  );

  const toggleDivisao = (id: string) => {
    setExpandedDivisao((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalMensal = servicos
    .filter((s) => s.status === "ativo")
    .reduce((sum, servico) => sum + calculateServicoRealMonthlyExpenseAmount(servico, mesReferencia), 0);

  const mesAtual = mesReferencia;

  const totalPessoasPendente = (() => {
    return servicoPessoas.reduce((sum, sp) => {
      const pago = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === mesAtual);
      return sum + (pago ? 0 : Number(sp.valorDevido));
    }, 0);
  })();

  const compraById = new Map(compras.map((compra) => [compra.id, compra] as const));
  const cartaoById = new Map(cartoes.map((cartao) => [cartao.id, cartao] as const));
  const servicoPessoasByServicoId = new Map<string, typeof servicoPessoas>();
  for (const sp of servicoPessoas) {
    const rows = servicoPessoasByServicoId.get(sp.servicoId) ?? [];
    rows.push(sp);
    servicoPessoasByServicoId.set(sp.servicoId, rows);
  }
  const parcelasByCompraId = new Map<string, typeof parcelasCompra>();
  for (const parcela of parcelasCompra) {
    const rows = parcelasByCompraId.get(parcela.compraCartaoId) ?? [];
    rows.push(parcela);
    parcelasByCompraId.set(parcela.compraCartaoId, rows);
  }

  type ServicoFormState = {
    compraCartaoId: string;
    formaPagamento: string;
    valorCobranca: string;
    periodicidadeCobranca: ServicoPeriodicidade;
  };

  const resolveFormWithLinkedCompra = <T extends ServicoFormState>(currentForm: T, compraId: string | null): T => {
    if (!compraId) {
      return {
        ...currentForm,
        compraCartaoId: COMPRA_NONE_VALUE,
      };
    }

    const compraSelecionada = compraById.get(compraId);
    if (!compraSelecionada) {
      return {
        ...currentForm,
        compraCartaoId: compraId,
        formaPagamento: "cartao",
      };
    }

    const suggestedTotal = getCompraCartaoTotalForServico(compraSelecionada);
    const suggestedFormatted = suggestedTotal != null ? formatCurrencyBRL(suggestedTotal) : null;
    const decision = decideLinkedCompraBillingValueFill({
      currentValorCobranca: currentForm.valorCobranca,
      periodicidadeCobranca: currentForm.periodicidadeCobranca,
      suggestedValorCobranca: suggestedTotal,
    });

    let nextValorCobranca = currentForm.valorCobranca;
    if (decision.decision === "prefill" && decision.suggestedValueInput) {
      nextValorCobranca = decision.suggestedValueInput;
    } else if (decision.decision === "confirm_overwrite" && decision.suggestedValueInput && suggestedFormatted) {
      const confirmed = window.confirm(
        `Usar o valor da compra vinculada?\n\nA compra selecionada tem valor total de ${suggestedFormatted}.`,
      );
      if (confirmed) {
        nextValorCobranca = decision.suggestedValueInput;
      }
    }

    return {
      ...currentForm,
      compraCartaoId: compraId,
      formaPagamento: "cartao",
      valorCobranca: nextValorCobranca,
    };
  };

  const handleCreateLinkedCompraChange = (compraId: string | null) => {
    setForm(resolveFormWithLinkedCompra(form, compraId));
  };

  const handleEditLinkedCompraChange = (compraId: string | null) => {
    setEditForm(resolveFormWithLinkedCompra(editForm, compraId));
  };

  const getOrigemPagamentoMesAtual = (servico: Servico) => {
    const vinculados = servicoPessoasByServicoId.get(servico.id) ?? [];
    const hasPagamentoPessoaMes = vinculados.some((sp) =>
      servicoPagamentos.some((pagamento) => pagamento.servicoPessoaId === sp.id && pagamento.mes === mesAtual),
    );
    if (hasPagamentoPessoaMes) {
      return { label: "Origem do mês atual: Pessoa", className: "text-blue-600" };
    }

    if (servico.compraCartaoId) {
      const parcelasDaCompra = parcelasByCompraId.get(servico.compraCartaoId) ?? [];
      const parcelasMesAtual = parcelasDaCompra.filter((parcela) =>
        typeof parcela.dataVencimento === "string" && parcela.dataVencimento.startsWith(mesAtual),
      );
      const pagoNoCartao = parcelasMesAtual.some((parcela) => parcela.statusCartao === "pago");
      if (pagoNoCartao) {
        return { label: "Origem do mês atual: Cartão (pago)", className: "text-emerald-600" };
      }
      if (parcelasMesAtual.length > 0) {
        return { label: "Origem do mês atual: Cartão (em aberto)", className: "text-amber-600" };
      }
      return { label: "Origem principal: Cartão vinculado", className: "text-blue-600" };
    }

    return { label: "Origem principal: Meu bolso", className: "text-muted-foreground" };
  };

  const getResumoServicoMes = (servico: Servico) => {
    const vinculados = servicoPessoasByServicoId.get(servico.id) ?? [];
    const totalVinculos = vinculados.length;
    const pagos = vinculados.filter((sp) => {
      const pagamento = servicoPagamentos.find((item) => item.servicoPessoaId === sp.id && item.mes === mesAtual);
      return pagamento?.status === "pago";
    }).length;
    const pendentes = Math.max(0, totalVinculos - pagos);
    return { totalVinculos, pagos, pendentes };
  };

  const servicosFiltradosPorAba = servicos.filter((servico) => {
    const resumoMes = getResumoServicoMes(servico);
    const isAtivo = servico.status === "ativo";
    switch (servicosTab) {
      case "ativos":
        return isAtivo;
      case "pendentes":
        return isAtivo && resumoMes.pendentes > 0;
      case "pagos":
        return isAtivo && resumoMes.totalVinculos > 0 && resumoMes.pendentes === 0;
      case "divisao":
        return resumoMes.totalVinculos > 0;
      case "vinculos":
        return Boolean(servico.compraCartaoId);
      case "pausados":
        return !isAtivo;
      default:
        return true;
    }
  });

  const servicosOrdenados = sortServicosForView(servicosFiltradosPorAba, {
    sortBy,
    referenceDay: new Date().getDate(),
  });

  const byCategory = servicosOrdenados.reduce<Array<{ value: string; label: string; servicos: Servico[]; total: number }>>(
    (groups, servico) => {
      const existing = groups.find((group) => group.value === servico.categoria);
      if (existing) {
        existing.servicos.push(servico);
        if (servico.status === "ativo") {
          existing.total += calculateServicoRealMonthlyExpenseAmount(servico, mesReferencia);
        }
        return groups;
      }

      groups.push({
        value: servico.categoria,
        label: categoriaLabelByValue.get(servico.categoria) ?? formatCategoriaFallback(servico.categoria),
        servicos: [servico],
        total: servico.status === "ativo" ? calculateServicoRealMonthlyExpenseAmount(servico, mesReferencia) : 0,
      });
      return groups;
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <FintechLoadingPageHeader
          showEyebrow={false}
          titleWidth="w-56"
          subtitleWidth="w-72 max-w-full"
          actions={
            <Skeleton className="h-11 w-full rounded-2xl bg-muted/65 sm:w-44" />
          }
        />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <FintechLoadingSurface key={i}>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-12 w-12 rounded-2xl bg-muted/70" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36 rounded-full bg-muted/65" />
                      <Skeleton className="h-4 w-24 rounded-full bg-muted/60" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20 rounded-full bg-muted/65" />
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {[1, 2, 3].map((metric) => (
                    <div key={metric} className="rounded-2xl border border-border/50 bg-background/80 p-3 shadow-sm">
                      <Skeleton className="h-3 w-20 rounded-full bg-muted/55" />
                      <Skeleton className="mt-2 h-4 w-24 rounded-full bg-muted/65" />
                    </div>
                  ))}
                </div>
              </div>
            </FintechLoadingSurface>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack" data-testid="servicos-page">
      <FintechPageHeader
        title="Serviços e Assinaturas"
        subtitle="Gerencie seus gastos recorrentes e divisões."
        rowClassName="items-start gap-4 xl:items-center"
        contentClassName="space-y-2"
        titleClassName="sm:text-3xl"
        badges={(
          <>
            <span className="rounded-full bg-muted/65 px-3 py-1.5 font-medium text-muted-foreground shadow-sm">
              {servicos.length} serviço{servicos.length !== 1 ? "s" : ""}
            </span>
            {servicoPessoas.length > 0 && (
              <span className="rounded-full border border-blue-500/10 bg-blue-500/10 px-3 py-1.5 font-medium text-blue-700 shadow-sm dark:text-blue-400">
                {servicoPessoas.length} vínculo{servicoPessoas.length !== 1 ? "s" : ""}
              </span>
            )}
          </>
        )}
        actionsClassName="flex w-full justify-stretch sm:w-auto sm:justify-end"
        actions={(
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) {
                setNewServicoIcone(null);
                setNewServicoIconPersistableId(null);
                setNewServicoIconManualSelection(false);
                setCreateSemDataFixa(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="h-10 w-full rounded-2xl px-4 font-medium shadow-sm sm:h-11 sm:w-auto sm:min-w-[190px]"
                data-testid="button-add-servico"
              >
                <Plus className="mr-2 h-4 w-4" /> Novo serviço
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Serviço</DialogTitle>
              <DialogDescription className="sr-only">
                Cadastre um serviço informando nome, categoria, valor, periodicidade, forma de pagamento e vínculo opcional com compra de cartão.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!createSemDataFixa && String(form.dataCobranca).trim().length === 0) {
                  toast({
                    title: "Dia de cobrança obrigatório",
                    description: "Preencha um dia de cobrança ou marque Sem data fixa.",
                    variant: "destructive",
                  });
                  return;
                }
                createMutation.mutate(
                  {
                    ...form,
                    valorMensal: createBilling.valorMensal,
                    valorCobranca: createBilling.valorCobranca,
                    periodicidadeCobranca: createBilling.periodicidadeCobranca,
                    dataCobranca: createSemDataFixa ? null : form.dataCobranca,
                    compraCartaoId: form.compraCartaoId === COMPRA_NONE_VALUE ? null : form.compraCartaoId,
                    iconeId: resolveEntityIconIdForSave({
                      isManualSelection: newServicoIconManualSelection,
                      manualPersistableIconId: newServicoIconPersistableId
                        ?? resolveEntityIconReference(newServicoIcone, userIconLibrary).persistableIconId,
                      autoSuggestion: newServicoStrongIconSuggestion,
                    }),
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setForm({
                        nome: "",
                        categoria: "streaming",
                        valorCobranca: "",
                        periodicidadeCobranca: "mensal",
                        dataCobranca: "",
                        formaPagamento: "cartao",
                        compraCartaoId: COMPRA_NONE_VALUE,
                      });
                      setCreateSemDataFixa(false);
                      setNewServicoIcone(null);
                      setNewServicoIconPersistableId(null);
                      setNewServicoIconManualSelection(false);
                      toast({ title: "Serviço adicionado" });
                    },
                    onError: (e: Error) => {
                      const planLimitError = parsePlanLimitError(e);
                      if (planLimitError) {
                        toast({
                          title: "Limite do plano Free atingido",
                          description: buildPlanLimitFriendlyMessage(planLimitError),
                          variant: "destructive",
                        });
                        return;
                      }

                      toast({ title: "Erro", description: e.message, variant: "destructive" });
                    },
                  },
                );
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Ícone</Label>
                <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                  <IconPicker
                    value={newServicoPreviewIconId}
                    name={form.nome}
                    autoApplySuggestion={false}
                    onChange={(nextIconId) => {
                      setNewServicoIcone(nextIconId);
                      if (nextIconId === null) {
                        setNewServicoIconPersistableId(null);
                        setNewServicoIconManualSelection(false);
                      }
                    }}
                    onSelectMeta={(meta: IconPickerSelectMeta) => {
                      if (meta.source === "reset") {
                        setNewServicoIcone(null);
                        setNewServicoIconPersistableId(null);
                        setNewServicoIconManualSelection(false);
                        return;
                      }

                      setNewServicoIcone(meta.displayValue);
                      setNewServicoIconPersistableId(meta.persistableIconId ?? null);
                      setNewServicoIconManualSelection(true);
                    }}
                    size="sm"
                  />
                </Suspense>
                {newServicoIconManualSelection ? (
                  <p className="text-xs text-muted-foreground">Ícone manual selecionado.</p>
                ) : newServicoStrongIconSuggestion.shouldAutoApply ? (
                  <p className="text-xs text-emerald-600">Ícone aplicado automaticamente por palavra-chave.</p>
                ) : null}
                {showNewServicoMediumSuggestion ? (
                  <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                    <p>Ícone sugerido: {newServicoStrongIconSuggestion.label ?? "Biblioteca"}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto px-0 text-xs"
                      onClick={() => {
                        setNewServicoIcone(newServicoStrongIconSuggestion.displayIconId);
                        setNewServicoIconPersistableId(newServicoStrongIconSuggestion.persistableIconId);
                        setNewServicoIconManualSelection(true);
                      }}
                    >
                      Usar este ícone
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Nome do serviço</Label>
                <Input
                  data-testid="input-servico-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Netflix, Spotify..."
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                    <SelectTrigger data-testid="select-servico-categoria">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor da cobrança</Label>
                  <Input
                    data-testid="input-servico-valor"
                    type="number"
                    step="0.01"
                    value={form.valorCobranca}
                    onChange={(e) => setForm({ ...form, valorCobranca: e.target.value })}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Periodicidade da cobrança</Label>
                <Select
                  value={form.periodicidadeCobranca}
                  onValueChange={(value) => setForm({ ...form, periodicidadeCobranca: value as ServicoPeriodicidade })}
                >
                  <SelectTrigger data-testid="select-servico-periodicidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICO_PERIODICIDADE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  <p>{createBillingResumo.primary}</p>
                  {createBillingResumo.secondary ? <p>{createBillingResumo.secondary}</p> : null}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Dia de cobrança</Label>
                  <Input
                    data-testid="input-servico-dia"
                    type="number"
                    min="1"
                    max="31"
                    value={form.dataCobranca}
                    onChange={(e) => setForm({ ...form, dataCobranca: e.target.value })}
                    required={!createSemDataFixa}
                    disabled={createSemDataFixa}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="checkbox-servico-sem-data"
                      checked={createSemDataFixa}
                      onCheckedChange={(checked) => {
                        const nextChecked = checked === true;
                        setCreateSemDataFixa(nextChecked);
                        if (nextChecked) {
                          setForm({ ...form, dataCobranca: "" });
                        }
                      }}
                    />
                    <Label htmlFor="checkbox-servico-sem-data" className="text-xs text-muted-foreground">
                      Sem data fixa
                    </Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select value={form.formaPagamento} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}>
                    <SelectTrigger data-testid="select-servico-pagamento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="debito">Débito automático</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Compra de cartão vinculada (opcional)</Label>
                <CompraCartaoSearchPicker
                  compras={compras}
                  cartoes={cartoes}
                  value={form.compraCartaoId === COMPRA_NONE_VALUE ? null : form.compraCartaoId}
                  onValueChange={handleCreateLinkedCompraChange}
                  placeholder="Sem vínculo com cartão"
                  noneLabel="Sem vínculo com cartão"
                  context={{
                    text: form.nome,
                    value: createBilling.valorMensalNumber || null,
                  }}
                  testId="select-servico-compra-vinculada"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-save-servico" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="rounded-2xl border border-border/60 bg-card/95 p-3 shadow-sm sm:p-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={servicosTab} onValueChange={(value) => setServicosTab(value as typeof servicosTab)} className="w-full min-w-0 xl:flex-1">
            <TabsList className="mobile-tabs-scroll h-10 w-max min-w-full justify-start rounded-xl border border-border/60 bg-muted/25 p-1 xl:w-auto">
              <TabsTrigger value="ativos" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium" data-testid="tab-servicos-ativos">Ativos</TabsTrigger>
              <TabsTrigger value="pendentes" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium" data-testid="tab-servicos-pendentes">Pendentes</TabsTrigger>
              <TabsTrigger value="pagos" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium" data-testid="tab-servicos-pagos">Pagos</TabsTrigger>
              <TabsTrigger value="divisao" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium" data-testid="tab-servicos-divisao">Divisão</TabsTrigger>
              <TabsTrigger value="vinculos" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium" data-testid="tab-servicos-vinculos">Vínculos cartão</TabsTrigger>
              <TabsTrigger value="pausados" className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium" data-testid="tab-servicos-pausados">Pausados</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end xl:w-auto">
            <div className="space-y-1">
              <Label htmlFor="servicos-mes-referencia" className="text-xs font-medium text-muted-foreground">
                Mês referência
              </Label>
              <Input
                id="servicos-mes-referencia"
                type="month"
                value={mesReferencia}
                onChange={(event) => setMesReferencia(event.target.value)}
                className="h-10 w-full rounded-xl border-border/70 bg-background/95 shadow-sm sm:w-[190px]"
                data-testid="input-servicos-mes-referencia"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="servicos-sort-by" className="text-xs font-medium text-muted-foreground">
                Ordenar por
              </Label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as ServicoSortBy)}>
                <SelectTrigger
                  id="servicos-sort-by"
                  className="h-10 w-full rounded-xl border-border/70 bg-background/95 text-sm shadow-sm sm:w-[250px]"
                  data-testid="select-servicos-sort-by"
                  aria-label="Ordenar serviços por"
                >
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICO_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="fintech-grid-fluid-260">
        <Card className="hover-elevate overflow-hidden border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground/90">Total real do mês em serviços ativos</p>
                <p className="fin-value-kpi mt-2 tracking-tight">{formatCurrencyBRL(totalMensal)}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/10 bg-amber-500/10 shadow-sm">
                <Repeat className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        {servicoPessoas.length > 0 && (
          <Card className="hover-elevate overflow-hidden border border-border/60 bg-card/95 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground/90">Pendente de pessoas ({mesReferencia})</p>
                  <p className="fin-value-kpi mt-2 tracking-tight text-amber-600">{formatCurrencyBRL(totalPessoasPendente)}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-500/10 bg-blue-500/10 shadow-sm">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {servicos.length === 0 ? (
        <FintechEmptyState
          icon={<Repeat className="h-6 w-6 text-muted-foreground/70" />}
          title="Nenhum serviço cadastrado"
          description="Adicione seus serviços e assinaturas"
          testId="empty-servicos"
        />
      ) : byCategory.length === 0 ? (
        <FintechEmptyState
          icon={<Repeat className="h-5 w-5 text-muted-foreground/70" />}
          title="Nenhum serviço encontrado"
          description={
            <>
              Nenhum serviço encontrado para a aba <span className="font-medium">{servicosTab}</span> no mês {mesReferencia}.
            </>
          }
          size="compact"
          contentClassName="max-w-lg"
        />
      ) : (
        <div className="space-y-6">
          {byCategory.map((cat) => (
            <div key={cat.value}>
              <div className="mb-3.5 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{cat.label}</h3>
                <span className="rounded-full bg-muted/65 px-3 py-1.5 text-sm font-medium shadow-sm">
                  {formatCurrencyBRL(cat.total)}/mês
                </span>
              </div>
              <div className="space-y-3">
                {cat.servicos.map((s) => {
                  const isServicoAtivo = s.status === "ativo";
                  const isServicoPausado = !isServicoAtivo;
                  const isDivisaoOpen = expandedDivisao.has(s.id);
                  const vinculados = servicoPessoas.filter((sp) => sp.servicoId === s.id);
                  const pendentesHoje = vinculados.filter(
                    (sp) => !servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === mesAtual),
                  ).length;
                  const compraVinculada = s.compraCartaoId ? compraById.get(s.compraCartaoId) : null;
                  const cartaoVinculado = compraVinculada ? cartaoById.get(compraVinculada.cartaoId) : null;
                  const origemMesAtual = getOrigemPagamentoMesAtual(s);
                  const billingView = resolveServicoBillingView(s);
                  const categoriaLabel = categoriaLabelByValue.get(s.categoria) ?? formatCategoriaFallback(s.categoria);
                  const periodicidadeLabel = SERVICO_PERIODICIDADE_OPTIONS.find(
                    (option) => option.value === billingView.periodicidade,
                  )?.label ?? billingView.periodicidade;
                  return (
                    <Card
                      key={s.id}
                      className="hover-elevate overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm transition-all duration-200"
                      data-testid={`card-servico-${s.id}`}
                    >
                      <CardContent className="space-y-3 p-3.5 sm:space-y-4 sm:p-5">
                        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start md:gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-muted/25 shadow-sm sm:h-12 sm:w-12">
                            <BrandIconDisplay name={s.nome} iconeId={resolveServiceIconId(s)} size="sm" />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`min-w-0 break-words text-[15px] font-semibold leading-tight tracking-tight sm:text-lg ${isServicoPausado ? "line-through text-muted-foreground" : ""}`}>
                                {s.nome}
                              </p>
                              {vinculados.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/10 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-700 shadow-sm dark:text-blue-400">
                                  <Users className="h-3 w-3" />
                                  {vinculados.length} pessoa{vinculados.length !== 1 ? "s" : ""}
                                  {pendentesHoje > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      {" "}
                                      · {pendentesHoje} pendente{pendentesHoje !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px]">
                              <span className="rounded-full bg-muted/65 px-2.5 py-1 font-medium text-muted-foreground shadow-sm">
                                {categoriaLabel}
                              </span>
                              <span className="rounded-full bg-muted/65 px-2.5 py-1 font-medium text-muted-foreground shadow-sm">
                                {periodicidadeLabel}
                              </span>
                              <span className="hidden rounded-full bg-muted/65 px-2.5 py-1 font-medium text-muted-foreground shadow-sm sm:inline-flex">
                                {formatServicoBillingDayLabel(s.dataCobranca)}
                              </span>
                              <span className="hidden rounded-full bg-muted/65 px-2.5 py-1 font-medium text-muted-foreground shadow-sm sm:inline-flex">
                                {s.formaPagamento}
                              </span>
                            </div>
                            <span className={`inline-flex w-fit rounded-full border border-transparent bg-muted/45 px-2.5 py-1 text-[10px] font-medium sm:text-[11px] ${origemMesAtual.className}`}>
                              {origemMesAtual.label}
                            </span>
                            {compraVinculada && (
                              <div className="hidden rounded-xl border border-blue-500/10 bg-blue-500/5 px-3 py-2 text-xs text-blue-700/90 sm:block dark:text-blue-400">
                                Vínculo de cartão: {cartaoVinculado?.nome ?? "Cartão"} · {compraVinculada.descricao}
                              </div>
                            )}
                          </div>
                          <div className="flex w-full min-w-0 flex-col items-start gap-1.5 md:w-auto md:min-w-[136px] md:items-end md:gap-2">
                            <span className="fin-value-person text-[clamp(18px,5vw,22px)] leading-none tracking-tight [overflow-wrap:anywhere] md:text-right">
                              {formatServicoBillingValue(s)}
                            </span>
                            <Badge
                              variant="outline"
                              className={`h-6 rounded-full px-3 text-center text-[11px] font-semibold shadow-sm sm:h-7 sm:text-xs ${
                                isServicoAtivo
                                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                                  : "border-border/60 bg-muted/65 text-muted-foreground hover:bg-muted/65"
                              }`}
                            >
                              {isServicoAtivo ? "Ativo" : "Pausado"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2.5 border-t border-border/50 pt-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pt-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {s.compraCartaoId && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/10 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-700 shadow-sm dark:text-blue-400">
                                <CreditCard className="h-3 w-3" />
                                Serviço vinculado ao cartão
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-end">
                            <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-border/60 bg-muted/[0.16] px-1.5 py-1.5 shadow-sm sm:rounded-xl sm:px-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                                onClick={() => toggleDivisao(s.id)}
                                aria-label={isDivisaoOpen ? "Recolher divisão entre pessoas" : "Abrir divisão entre pessoas"}
                                title="Divisão entre pessoas"
                                data-testid={`button-divisao-${s.id}`}
                              >
                                {isDivisaoOpen ? <ChevronUp className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                                onClick={() =>
                                  updateMutation.mutate(
                                    { id: s.id, compraCartaoId: null },
                                    { onSuccess: () => toast({ title: "Vínculo com cartão removido" }) },
                                  )
                                }
                                title="Remover vínculo com cartão"
                                data-testid={`button-unlink-cartao-servico-${s.id}`}
                                disabled={!s.compraCartaoId}
                                aria-label="Remover vínculo com cartão"
                              >
                                <Unlink2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                                onClick={() => {
                                  const billingView = resolveServicoBillingView(s);
                                  const resolvedIcon = resolveEntityIconReference(s.iconeId ?? null, userIconLibrary);
                                  setEditingServico(s);
                                  setEditIcone(resolvedIcon.displayIconId);
                                  setEditIconPersistableId(resolvedIcon.persistableIconId);
                                  setEditIconManualSelection(Boolean(s.iconeId));
                                  const servicoHasFixedBillingDay = hasFixedBillingDay(s.dataCobranca);
                                  setEditSemDataFixa(!servicoHasFixedBillingDay);
                                  setEditForm({
                                    nome: s.nome,
                                    categoria: s.categoria,
                                    valorCobranca: billingView.valorCobranca.toFixed(2),
                                    periodicidadeCobranca: billingView.periodicidade,
                                    dataCobranca: servicoHasFixedBillingDay ? String(s.dataCobranca) : "",
                                    formaPagamento: s.formaPagamento,
                                    compraCartaoId: s.compraCartaoId ?? COMPRA_NONE_VALUE,
                                  });
                                }}
                                data-testid={`button-edit-servico-${s.id}`}
                                aria-label="Editar serviço"
                                title="Editar serviço"
                              >
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                                onClick={() => {
                                  const shouldProceed = isServicoAtivo
                                    ? window.confirm(
                                      "Este serviço deixará de entrar nos totais ativos, mas o histórico será mantido.",
                                    )
                                    : window.confirm(
                                      "Este serviço voltará a entrar nos totais ativos.",
                                    );
                                  if (!shouldProceed) return;

                                  toggleStatusMutation.mutate(
                                    { id: s.id, status: s.status },
                                    {
                                      onSuccess: () =>
                                        toast({
                                          title: isServicoAtivo ? "Serviço pausado" : "Serviço reativado",
                                          description: isServicoAtivo
                                            ? "Este serviço deixou de entrar nos totais ativos."
                                            : "Este serviço voltou a entrar nos totais ativos.",
                                        }),
                                    },
                                  );
                                }}
                                data-testid={`button-toggle-servico-${s.id}`}
                                aria-label={isServicoAtivo ? "Pausar serviço" : "Reativar serviço"}
                                title={isServicoAtivo ? "Pausar serviço" : "Reativar serviço"}
                              >
                                {isServicoAtivo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                                onClick={() =>
                                  deleteMutation.mutate(s.id, {
                                    onSuccess: () => toast({ title: "Serviço removido" }),
                                  })
                                }
                                data-testid={`button-delete-servico-${s.id}`}
                                aria-label="Excluir serviço"
                                title="Excluir serviço"
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        {isDivisaoOpen && (
                          <DivisaoPanel
                            servico={s}
                            servicoPessoas={servicoPessoas}
                            servicoPagamentos={servicoPagamentos}
                            pessoas={pessoas}
                            pessoaSaldoMovimentacoes={pessoaSaldoMovimentacoes}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!editingServico}
        onOpenChange={(value) => {
          if (!value) {
            setEditingServico(null);
            setEditIcone(null);
            setEditIconPersistableId(null);
            setEditIconManualSelection(false);
            setEditSemDataFixa(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Serviço</DialogTitle>
            <DialogDescription className="sr-only">
              Atualize os dados do serviço selecionado, incluindo cobrança, periodicidade, forma de pagamento e vínculo com compra de cartão.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingServico) return;
              if (!editSemDataFixa && String(editForm.dataCobranca).trim().length === 0) {
                toast({
                  title: "Dia de cobrança obrigatório",
                  description: "Preencha um dia de cobrança ou marque Sem data fixa.",
                  variant: "destructive",
                });
                return;
              }
              updateMutation.mutate(
                {
                  id: editingServico.id,
                  ...editForm,
                  valorMensal: editBilling.valorMensal,
                  valorCobranca: editBilling.valorCobranca,
                  periodicidadeCobranca: editBilling.periodicidadeCobranca,
                  dataCobranca: editSemDataFixa ? null : editForm.dataCobranca,
                  compraCartaoId: editForm.compraCartaoId === COMPRA_NONE_VALUE ? null : editForm.compraCartaoId,
                  iconeId: resolveEntityIconIdForSave({
                    isManualSelection: editIconManualSelection,
                    manualPersistableIconId: editIconPersistableId
                      ?? resolveEntityIconReference(editIcone, userIconLibrary).persistableIconId,
                    autoSuggestion: editServicoStrongIconSuggestion,
                  }),
                },
                {
                  onSuccess: () => {
                    setEditingServico(null);
                    setEditIcone(null);
                    setEditIconPersistableId(null);
                    setEditIconManualSelection(false);
                    setEditSemDataFixa(false);
                    toast({ title: "Serviço atualizado" });
                  },
                  onError: (e: Error) =>
                    toast({ title: "Erro", description: e.message, variant: "destructive" }),
                },
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Ícone</Label>
              <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                <IconPicker
                  value={editServicoPreviewIconId}
                  name={editForm.nome}
                  autoApplySuggestion={false}
                  onChange={(nextIconId) => {
                    setEditIcone(nextIconId);
                    if (nextIconId === null) {
                      setEditIconPersistableId(null);
                      setEditIconManualSelection(false);
                    }
                  }}
                  onSelectMeta={(meta: IconPickerSelectMeta) => {
                    if (meta.source === "reset") {
                      setEditIcone(null);
                      setEditIconPersistableId(null);
                      setEditIconManualSelection(false);
                      return;
                    }

                    setEditIcone(meta.displayValue);
                    setEditIconPersistableId(meta.persistableIconId ?? null);
                    setEditIconManualSelection(true);
                  }}
                  size="sm"
                />
              </Suspense>
              {editIconManualSelection ? (
                <p className="text-xs text-muted-foreground">Ícone manual selecionado.</p>
              ) : editServicoStrongIconSuggestion.shouldAutoApply ? (
                <p className="text-xs text-emerald-600">Ícone aplicado automaticamente por palavra-chave.</p>
              ) : null}
              {showEditServicoMediumSuggestion ? (
                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  <p>Ícone sugerido: {editServicoStrongIconSuggestion.label ?? "Biblioteca"}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-0 text-xs"
                    onClick={() => {
                      setEditIcone(editServicoStrongIconSuggestion.displayIconId);
                      setEditIconPersistableId(editServicoStrongIconSuggestion.persistableIconId);
                      setEditIconManualSelection(true);
                    }}
                  >
                    Usar este ícone
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Nome do serviço</Label>
              <Input
                data-testid="input-edit-servico-nome"
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={editForm.categoria} onValueChange={(v) => setEditForm({ ...editForm, categoria: v })}>
                  <SelectTrigger data-testid="select-edit-servico-categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor da cobrança</Label>
                <Input
                  data-testid="input-edit-servico-valor"
                  type="number"
                  step="0.01"
                  value={editForm.valorCobranca}
                  onChange={(e) => setEditForm({ ...editForm, valorCobranca: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Periodicidade da cobrança</Label>
              <Select
                value={editForm.periodicidadeCobranca}
                onValueChange={(value) => setEditForm({ ...editForm, periodicidadeCobranca: value as ServicoPeriodicidade })}
              >
                <SelectTrigger data-testid="select-edit-servico-periodicidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICO_PERIODICIDADE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                <p>{editBillingResumo.primary}</p>
                {editBillingResumo.secondary ? <p>{editBillingResumo.secondary}</p> : null}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Dia de cobrança</Label>
                <Input
                  data-testid="input-edit-servico-datacobranca"
                  type="number"
                  min="1"
                  max="31"
                  value={editForm.dataCobranca}
                  onChange={(e) => setEditForm({ ...editForm, dataCobranca: e.target.value })}
                  required={!editSemDataFixa}
                  disabled={editSemDataFixa}
                />
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="checkbox-edit-servico-sem-data"
                    checked={editSemDataFixa}
                    onCheckedChange={(checked) => {
                      const nextChecked = checked === true;
                      setEditSemDataFixa(nextChecked);
                      if (nextChecked) {
                        setEditForm({ ...editForm, dataCobranca: "" });
                      }
                    }}
                  />
                  <Label htmlFor="checkbox-edit-servico-sem-data" className="text-xs text-muted-foreground">
                    Sem data fixa
                  </Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={editForm.formaPagamento} onValueChange={(v) => setEditForm({ ...editForm, formaPagamento: v })}>
                  <SelectTrigger data-testid="select-edit-servico-pagamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="debito">Débito automático</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Compra de cartão vinculada (opcional)</Label>
              <CompraCartaoSearchPicker
                compras={compras}
                cartoes={cartoes}
                value={editForm.compraCartaoId === COMPRA_NONE_VALUE ? null : editForm.compraCartaoId}
                onValueChange={handleEditLinkedCompraChange}
                placeholder="Sem vínculo com cartão"
                noneLabel="Sem vínculo com cartão"
                context={{
                  text: editForm.nome,
                  value: editBilling.valorMensalNumber || null,
                }}
                testId="select-edit-servico-compra-vinculada"
              />
            </div>
            <Button type="submit" className="w-full" data-testid="button-save-edit-servico" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

