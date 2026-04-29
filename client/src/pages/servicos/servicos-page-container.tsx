import { useState, lazy, Suspense } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
import { Plus, Repeat, Trash2, X, Check, Users, ChevronUp, Pencil, CreditCard, Unlink2 } from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { formatCurrencyBRL } from "@/utils/formatters";
import type { Servico } from "@shared/schema";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const categorias = [
  { value: "streaming", label: "Streaming" },
  { value: "lazer", label: "Lazer" },
  { value: "software", label: "Software" },
  { value: "assinatura", label: "Assinatura" },
  { value: "outros", label: "Outros" },
];

const COMPRA_NONE_VALUE = "__none__";

export default function ServicosPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expandedDivisao, setExpandedDivisao] = useState<Set<string>>(new Set());
  const [servicosTab, setServicosTab] = useState<"ativos" | "pendentes" | "pagos" | "divisao" | "vinculos">("ativos");
  const [mesReferencia, setMesReferencia] = useState(format(new Date(), "yyyy-MM"));
  const [form, setForm] = useState({
    nome: "",
    categoria: "streaming",
    valorMensal: "",
    dataCobranca: "",
    formaPagamento: "cartao",
    compraCartaoId: COMPRA_NONE_VALUE,
  });
  const [editingServico, setEditingServico] = useState<Servico | null>(null);
  const [editIcone, setEditIcone] = useState<string | null>(null);
  const [newServicoIcone, setNewServicoIcone] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nome: "",
    categoria: "streaming",
    valorMensal: "",
    dataCobranca: "",
    formaPagamento: "cartao",
    compraCartaoId: COMPRA_NONE_VALUE,
  });

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
    .reduce((sum, sv) => sum + Number(sv.valorMensal), 0);

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
    switch (servicosTab) {
      case "ativos":
        return servico.status === "ativo";
      case "pendentes":
        return servico.status === "ativo" && resumoMes.pendentes > 0;
      case "pagos":
        return servico.status === "ativo" && resumoMes.totalVinculos > 0 && resumoMes.pendentes === 0;
      case "divisao":
        return resumoMes.totalVinculos > 0;
      case "vinculos":
        return Boolean(servico.compraCartaoId);
      default:
        return true;
    }
  });

  const byCategory = categorias
    .map((cat) => ({
      ...cat,
      servicos: servicosFiltradosPorAba.filter((s) => s.categoria === cat.value),
      total: servicosFiltradosPorAba
        .filter((s) => s.categoria === cat.value && s.status === "ativo")
        .reduce((sum, s) => sum + Number(s.valorMensal), 0),
    }))
    .filter((c) => c.servicos.length > 0);

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack" data-testid="servicos-page">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Serviços e Assinaturas</h1>
          <p className="text-muted-foreground">Gerencie seus gastos recorrentes e divisões</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" data-testid="button-add-servico">
              <Plus className="w-4 h-4 mr-2" /> Novo serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Serviço</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(
                  {
                    ...form,
                    compraCartaoId: form.compraCartaoId === COMPRA_NONE_VALUE ? null : form.compraCartaoId,
                    iconeId: newServicoIcone,
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setForm({
                        nome: "",
                        categoria: "streaming",
                        valorMensal: "",
                        dataCobranca: "",
                        formaPagamento: "cartao",
                        compraCartaoId: COMPRA_NONE_VALUE,
                      });
                      setNewServicoIcone(null);
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
                  <IconPicker value={newServicoIcone} name={form.nome} onChange={setNewServicoIcone} size="sm" />
                </Suspense>
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
                  <Label>Valor mensal</Label>
                  <Input
                    data-testid="input-servico-valor"
                    type="number"
                    step="0.01"
                    value={form.valorMensal}
                    onChange={(e) => setForm({ ...form, valorMensal: e.target.value })}
                    placeholder="0,00"
                    required
                  />
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
                    required
                  />
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
                  onValueChange={(value) => setForm({ ...form, compraCartaoId: value ?? COMPRA_NONE_VALUE })}
                  placeholder="Sem vínculo com cartão"
                  noneLabel="Sem vínculo com cartão"
                  context={{
                    text: form.nome,
                    value: Number(form.valorMensal) || null,
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
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={servicosTab} onValueChange={(value) => setServicosTab(value as typeof servicosTab)}>
          <TabsList className="mobile-tabs-scroll w-full justify-start lg:w-auto">
            <TabsTrigger value="ativos" data-testid="tab-servicos-ativos">Ativos</TabsTrigger>
            <TabsTrigger value="pendentes" data-testid="tab-servicos-pendentes">Pendentes</TabsTrigger>
            <TabsTrigger value="pagos" data-testid="tab-servicos-pagos">Pagos</TabsTrigger>
            <TabsTrigger value="divisao" data-testid="tab-servicos-divisao">Divisão</TabsTrigger>
            <TabsTrigger value="vinculos" data-testid="tab-servicos-vinculos">Vínculos cartão</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto">
          <Label htmlFor="servicos-mes-referencia" className="text-xs text-muted-foreground">
            Mês referência
          </Label>
          <Input
            id="servicos-mes-referencia"
            type="month"
            value={mesReferencia}
            onChange={(event) => setMesReferencia(event.target.value)}
            className="h-9 w-full sm:w-[180px]"
            data-testid="input-servicos-mes-referencia"
          />
        </div>
      </div>

      <div className="fintech-grid-fluid-260">
        <Card className="hover-elevate">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Total mensal em serviços</p>
                <p className="text-2xl font-bold">{formatCurrencyBRL(totalMensal)}</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-amber-500/10">
                <Repeat className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        {servicoPessoas.length > 0 && (
          <Card className="hover-elevate">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Pendente de pessoas ({mesReferencia})</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrencyBRL(totalPessoasPendente)}</p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-blue-500/10">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {servicos.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-servicos">
          <Repeat className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum serviço cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione seus serviços e assinaturas</p>
        </div>
      ) : byCategory.length === 0 ? (
        <div className="text-center py-12 rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Nenhum serviço encontrado para a aba <span className="font-medium">{servicosTab}</span> no mês {mesReferencia}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {byCategory.map((cat) => (
            <div key={cat.value}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{cat.label}</h3>
                <span className="text-sm font-medium">{formatCurrencyBRL(cat.total)}/mês</span>
              </div>
              <div className="space-y-2">
                {cat.servicos.map((s) => {
                  const isDivisaoOpen = expandedDivisao.has(s.id);
                  const vinculados = servicoPessoas.filter((sp) => sp.servicoId === s.id);
                  const pendentesHoje = vinculados.filter(
                    (sp) => !servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === mesAtual),
                  ).length;
                  const compraVinculada = s.compraCartaoId ? compraById.get(s.compraCartaoId) : null;
                  const cartaoVinculado = compraVinculada ? cartaoById.get(compraVinculada.cartaoId) : null;
                  const origemMesAtual = getOrigemPagamentoMesAtual(s);
                  return (
                    <Card key={s.id} className="hover-elevate overflow-hidden" data-testid={`card-servico-${s.id}`}>
                      <CardContent className="p-4 sm:p-5 space-y-3">
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                          <div className="pt-0.5 sm:pt-0">
                            <BrandIconDisplay name={s.nome} iconeId={s.iconeId} size="sm" />
                          </div>
                          <div className="min-w-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`font-medium leading-tight ${s.status === "cancelado" ? "line-through text-muted-foreground" : ""}`}>
                                  {s.nome}
                                </p>
                                {vinculados.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <Users className="w-2.5 h-2.5" />
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
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Dia {s.dataCobranca} | {s.formaPagamento}
                              </p>
                              <p className={`text-xs mt-0.5 ${origemMesAtual.className}`}>
                                {origemMesAtual.label}
                              </p>
                              {compraVinculada && (
                                <p className="text-xs text-blue-600 mt-0.5 truncate">
                                  Vínculo de cartão: {cartaoVinculado?.nome ?? "Cartão"} · {compraVinculada.descricao}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2 sm:col-span-1 sm:col-start-3 flex items-center justify-between sm:justify-end gap-2 sm:self-start">
                            <span className="text-xl leading-none font-semibold whitespace-nowrap">{formatCurrencyBRL(Number(s.valorMensal))}</span>
                            <Badge variant={s.status === "ativo" ? "default" : "secondary"} className="h-7 px-2.5 text-xs font-semibold whitespace-nowrap">
                              {s.status === "ativo" ? "Ativo" : "Cancelado"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-end">
                          <div className="flex flex-wrap items-center justify-end gap-1 rounded-lg border border-border/50 bg-muted/20 px-1.5 py-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleDivisao(s.id)}
                              title="Divisão entre pessoas"
                              data-testid={`button-divisao-${s.id}`}
                            >
                              {isDivisaoOpen ? <ChevronUp className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                updateMutation.mutate(
                                  { id: s.id, compraCartaoId: null },
                                  { onSuccess: () => toast({ title: "Vínculo com cartão removido" }) },
                                )
                              }
                              title="Remover vínculo com cartão"
                              data-testid={`button-unlink-cartao-servico-${s.id}`}
                              disabled={!s.compraCartaoId}
                            >
                              <Unlink2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingServico(s);
                                setEditIcone(s.iconeId || null);
                                setEditForm({
                                  nome: s.nome,
                                  categoria: s.categoria,
                                  valorMensal: String(s.valorMensal),
                                  dataCobranca: String(s.dataCobranca),
                                  formaPagamento: s.formaPagamento,
                                  compraCartaoId: s.compraCartaoId ?? COMPRA_NONE_VALUE,
                                });
                              }}
                              data-testid={`button-edit-servico-${s.id}`}
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                toggleStatusMutation.mutate(
                                  { id: s.id, status: s.status },
                                  { onSuccess: () => toast({ title: "Status atualizado" }) },
                                )
                              }
                              data-testid={`button-toggle-servico-${s.id}`}
                            >
                              {s.status === "ativo" ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                deleteMutation.mutate(s.id, {
                                  onSuccess: () => toast({ title: "Serviço removido" }),
                                })
                              }
                              data-testid={`button-delete-servico-${s.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                        {s.compraCartaoId && (
                          <div className="mt-2">
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <CreditCard className="w-2.5 h-2.5" />
                              Serviço vinculado ao cartão
                            </span>
                          </div>
                        )}

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
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Serviço</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingServico) return;
              updateMutation.mutate(
                {
                  id: editingServico.id,
                  ...editForm,
                  compraCartaoId: editForm.compraCartaoId === COMPRA_NONE_VALUE ? null : editForm.compraCartaoId,
                  iconeId: editIcone,
                },
                {
                  onSuccess: () => {
                    setEditingServico(null);
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
                <IconPicker value={editIcone} name={editForm.nome} onChange={setEditIcone} size="sm" />
              </Suspense>
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
                <Label>Valor mensal</Label>
                <Input
                  data-testid="input-edit-servico-valor"
                  type="number"
                  step="0.01"
                  value={editForm.valorMensal}
                  onChange={(e) => setEditForm({ ...editForm, valorMensal: e.target.value })}
                  required
                />
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
                  required
                />
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
                onValueChange={(value) => setEditForm({ ...editForm, compraCartaoId: value ?? COMPRA_NONE_VALUE })}
                placeholder="Sem vínculo com cartão"
                noneLabel="Sem vínculo com cartão"
                context={{
                  text: editForm.nome,
                  value: Number(editForm.valorMensal) || null,
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

