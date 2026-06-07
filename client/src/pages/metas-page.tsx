import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import { FintechSurfaceCard, FintechSurfaceIconChip } from "@/components/layout/fintech-surface-card";
import {
  FintechLoadingMetricCard,
  FintechLoadingPageHeader,
  FintechLoadingSurface,
} from "@/components/layout/fintech-loading-shell";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Target, Trash2, TrendingUp, CalendarClock, CheckCircle, AlertCircle,
} from "lucide-react";
import type { Meta } from "@shared/schema";
import { format, differenceInMonths, parseISO } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function MetasPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editMeta, setEditMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState({
    nome: "", descricao: "", valorAlvo: "", valorAtual: "0", prazo: "",
  });

  const { data: metasList = [], isLoading } = useQuery<Meta[]>({ queryKey: ["/api/metas"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { await apiRequest("POST", "/api/metas", data); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metas"] });
      setOpen(false);
      setForm({ nome: "", descricao: "", valorAlvo: "", valorAtual: "0", prazo: "" });
      toast({ title: "Meta criada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/metas/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metas"] });
      setEditMeta(null);
      toast({ title: "Meta atualizada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/metas/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metas"] });
      toast({ title: "Meta removida" });
    },
  });

  const calcularMensalNecessario = (meta: Meta): number => {
    const restante = Number(meta.valorAlvo) - Number(meta.valorAtual);
    if (restante <= 0) return 0;
    const mesesRestantes = differenceInMonths(parseISO(meta.prazo), new Date());
    if (mesesRestantes <= 0) return restante;
    return restante / mesesRestantes;
  };

  const calcularProgresso = (meta: Meta): number => {
    const alvo = Number(meta.valorAlvo);
    if (alvo <= 0) return 0;
    return Math.min((Number(meta.valorAtual) / alvo) * 100, 100);
  };

  const isOnTrack = (meta: Meta): boolean => {
    const mesesDecorridos = differenceInMonths(new Date(), new Date(meta.prazo.substring(0, 7) + "-01")) * -1;
    const mesesTotais = differenceInMonths(parseISO(meta.prazo), new Date()) + mesesDecorridos;
    if (mesesTotais <= 0) return false;
    const progressoEsperado = (mesesDecorridos / mesesTotais) * 100;
    return calcularProgresso(meta) >= progressoEsperado * 0.8;
  };

  const ativas = metasList.filter((m) => m.status === "ativa");
  const concluidas = metasList.filter((m) => m.status === "concluida" || Number(m.valorAtual) >= Number(m.valorAlvo));
  const totalGuardado = metasList.reduce((acc, meta) => acc + Number(meta.valorAtual), 0);
  const totalAlvo = metasList.reduce((acc, meta) => acc + Number(meta.valorAlvo), 0);

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack max-w-5xl" data-testid="metas-page">
        <FintechLoadingPageHeader
          titleWidth="w-64"
          subtitleWidth="w-80 max-w-full"
          actions={<Skeleton className="h-11 w-full rounded-2xl bg-muted/65 sm:w-40" />}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <FintechLoadingMetricCard
              key={index}
              titleWidth="w-24"
              valueWidth="w-24"
              detailWidth="w-32"
              iconSizeClassName="h-10 w-10"
            />
          ))}
        </div>

        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, groupIndex) => (
            <div key={groupIndex} className="space-y-3">
              <Skeleton className="h-4 w-40 rounded-full" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Array.from({ length: 2 }).map((__, cardIndex) => (
                  <FintechLoadingSurface key={cardIndex}>
                    <div className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Skeleton className="h-11 w-11 rounded-2xl bg-muted/70" />
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-32 rounded-full bg-muted/65" />
                            <Skeleton className="h-4 w-24 rounded-full bg-muted/60" />
                          </div>
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full bg-muted/65" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between gap-3">
                          <Skeleton className="h-4 w-20 rounded-full bg-muted/60" />
                          <Skeleton className="h-4 w-20 rounded-full bg-muted/60" />
                        </div>
                        <Skeleton className="h-3 w-full rounded-full bg-muted/60" />
                        <Skeleton className="ml-auto h-3 w-16 rounded-full bg-muted/55" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FintechLoadingSurface tone="inset" className="rounded-2xl">
                          <div className="h-16" />
                        </FintechLoadingSurface>
                        <FintechLoadingSurface tone="inset" className="rounded-2xl">
                          <div className="h-16" />
                        </FintechLoadingSurface>
                      </div>
                      <Skeleton className="h-4 w-28 rounded-full bg-muted/60" />
                      <div className="flex gap-2">
                        <Skeleton className="h-9 flex-1 rounded-2xl bg-muted/65" />
                        <Skeleton className="h-9 w-9 rounded-xl bg-muted/65" />
                      </div>
                    </div>
                  </FintechLoadingSurface>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack max-w-5xl" data-testid="metas-page">
      <FintechPageHeader
        eyebrow={(
          <Badge variant="outline" className="w-fit rounded-full border-border/60 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
            Planejamento financeiro
          </Badge>
        )}
        title="Metas Financeiras"
        subtitle="Acompanhe seus objetivos e veja quanto economizar por mês."
        badges={(
          <>
            <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              {ativas.length} {ativas.length === 1 ? "meta em andamento" : "metas em andamento"}
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm dark:text-emerald-300">
              {concluidas.length} {concluidas.length === 1 ? "concluída" : "concluídas"}
            </Badge>
          </>
        )}
        actionsClassName="flex w-full justify-stretch sm:w-auto sm:justify-end"
        actions={(
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 w-full rounded-2xl px-5 shadow-sm sm:w-auto" data-testid="button-add-meta">
                <Plus className="mr-2 h-4 w-4" /> Nova meta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Meta Financeira</DialogTitle>
                <DialogDescription className="sr-only">
                  Cadastre uma meta financeira informando nome, valor desejado, prazo e progresso atual.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(form);
                }}
                className="space-y-4"
              >
                  <div className="space-y-2">
                    <Label>Nome da meta</Label>
                    <Input
                      data-testid="input-meta-nome"
                      value={form.nome}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      placeholder="Ex: Viagem para a Europa, Reserva de emergencia"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descricao (opcional)</Label>
                    <Textarea
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                      placeholder="Detalhes sobre a meta"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Valor alvo</Label>
                      <Input
                        data-testid="input-meta-alvo"
                        type="number"
                        step="0.01"
                        value={form.valorAlvo}
                        onChange={(e) => setForm({ ...form, valorAlvo: e.target.value })}
                        placeholder="30000"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ja tenho</Label>
                      <Input
                        data-testid="input-meta-atual"
                        type="number"
                        step="0.01"
                        value={form.valorAtual}
                        onChange={(e) => setForm({ ...form, valorAtual: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Prazo</Label>
                    <Input
                      data-testid="input-meta-prazo"
                      type="date"
                      value={form.prazo}
                      onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                      required
                    />
                  </div>
                  {form.valorAlvo && form.prazo && (
                    <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
                      <p className="text-sm">
                        <span className="text-muted-foreground">Precisa economizar: </span>
                        <span className="font-bold text-primary">
                          {formatCurrency(
                            Math.max(0, (parseFloat(form.valorAlvo) - parseFloat(form.valorAtual || "0")) /
                              Math.max(1, differenceInMonths(parseISO(form.prazo), new Date())))
                          )}/mês
                        </span>
                      </p>
                    </div>
                  )}
                  <Button type="submit" className="w-full" data-testid="button-save-meta" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar meta"}
                  </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FintechSurfaceCard>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Em andamento
                </p>
                <p className="text-3xl font-semibold tracking-tight text-foreground">{ativas.length}</p>
              </div>
              <FintechSurfaceIconChip size="md" className="border-primary/15 bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </FintechSurfaceIconChip>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Objetivos que ainda pedem acompanhamento e aporte mensal.
            </p>
          </CardContent>
        </FintechSurfaceCard>

        <FintechSurfaceCard>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Guardado
                </p>
                <p className="text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(totalGuardado)}</p>
              </div>
              <FintechSurfaceIconChip size="md" className="border-primary/15 bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </FintechSurfaceIconChip>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Soma do valor já acumulado em todas as metas cadastradas.
            </p>
          </CardContent>
        </FintechSurfaceCard>

        <FintechSurfaceCard>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Valor alvo
                </p>
                <p className="text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(totalAlvo)}</p>
              </div>
              <FintechSurfaceIconChip size="md" className="border-emerald-500/20 bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </FintechSurfaceIconChip>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Valor total que suas metas buscam alcançar no conjunto.
            </p>
          </CardContent>
        </FintechSurfaceCard>
      </div>

      {metasList.length === 0 ? (
        <FintechEmptyState
          icon={<Target className="h-7 w-7 text-primary" />}
          title="Nenhuma meta criada ainda"
          description="Defina seu primeiro objetivo financeiro para acompanhar progresso, prazo e valor mensal necessário."
          className="bg-card/80"
          iconWrapClassName="border-primary/15 bg-primary/10"
        />
      ) : (
        <div className="space-y-6">
          {ativas.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground shadow-sm">
                  Em andamento
                </Badge>
                <span className="text-sm font-medium text-muted-foreground">{ativas.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ativas.map((meta) => {
                  const progresso = calcularProgresso(meta);
                  const mensal = calcularMensalNecessario(meta);
                  const mesesRestantes = Math.max(0, differenceInMonths(parseISO(meta.prazo), new Date()));
                  const concluida = Number(meta.valorAtual) >= Number(meta.valorAlvo);

                  return (
                    <Card key={meta.id} className="hover-elevate rounded-[26px] border border-border/60 bg-card/95 shadow-sm" data-testid={`card-meta-${meta.id}`}>
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
                              <Target className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-base font-semibold tracking-tight text-foreground">{meta.nome}</p>
                              {meta.descricao && (
                                <p className="truncate text-xs leading-5 text-muted-foreground">{meta.descricao}</p>
                              )}
                            </div>
                          </div>
                          {concluida
                            ? <Badge variant="secondary" className="rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><CheckCircle className="w-3 h-3 mr-1" />Concluida</Badge>
                            : mesesRestantes <= 1
                            ? <Badge variant="destructive" className="rounded-full shadow-sm">Urgente</Badge>
                            : <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 shadow-sm">{mesesRestantes}m restantes</Badge>
                          }
                        </div>

                        <div className="rounded-3xl border border-border/60 bg-background/80 p-4 shadow-inner">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-semibold text-foreground">{formatCurrency(Number(meta.valorAtual))}</span>
                            <span className="text-muted-foreground">{formatCurrency(Number(meta.valorAlvo))}</span>
                          </div>
                          <Progress value={progresso} className="h-3" />
                          <p className="mt-2 text-xs font-medium text-muted-foreground text-right">{progresso.toFixed(0)}% concluido</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-border/50 bg-background/80 p-3 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Faltam</p>
                            <p className="mt-2 text-base font-semibold tracking-tight text-foreground">{formatCurrency(Math.max(0, Number(meta.valorAlvo) - Number(meta.valorAtual)))}</p>
                          </div>
                          <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Por mês</p>
                            <p className="mt-2 text-base font-semibold tracking-tight text-primary">{formatCurrency(mensal)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <CalendarClock className="w-3 h-3" />
                          <span>Prazo: {format(parseISO(meta.prazo), "dd/MM/yyyy")}</span>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 flex-1 rounded-2xl border-border/60 bg-background/80 shadow-sm"
                                onClick={() => setEditMeta(meta)}
                                data-testid={`button-update-meta-${meta.id}`}
                              >
                                <TrendingUp className="w-3 h-3 mr-1" /> Atualizar valor
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Atualizar {meta.nome}</DialogTitle>
                                <DialogDescription className="sr-only">
                                  Atualize o valor atual economizado para acompanhar o progresso desta meta financeira.
                                </DialogDescription>
                              </DialogHeader>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const val = (e.target as any).valor.value;
                                  updateMutation.mutate({ id: meta.id, data: { valorAtual: val } });
                                }}
                                className="space-y-4"
                              >
                                <div className="space-y-2">
                                  <Label>Valor atual economizado</Label>
                                  <Input
                                    name="valor"
                                    type="number"
                                    step="0.01"
                                    defaultValue={meta.valorAtual}
                                    data-testid="input-update-meta-valor"
                                    required
                                  />
                                </div>
                                <Button type="submit" className="w-full">Salvar</Button>
                              </form>
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl border border-border/60 bg-background/80 shadow-sm hover:bg-accent"
                            onClick={() => deleteMutation.mutate(meta.id)}
                            data-testid={`button-delete-meta-${meta.id}`}
                            aria-label="Excluir meta"
                            title="Excluir meta"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {concluidas.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="outline" className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-700 shadow-sm dark:text-emerald-300">
                  Concluidas
                </Badge>
                <span className="text-sm font-medium text-muted-foreground">{concluidas.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {concluidas.map((meta) => (
                  <Card key={meta.id} className="rounded-[24px] border border-emerald-500/15 bg-emerald-500/[0.05] shadow-sm" data-testid={`card-meta-done-${meta.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-background/80 shadow-sm">
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                          </div>
                          <span className="truncate font-semibold text-foreground">{meta.nome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-emerald-600">{formatCurrency(Number(meta.valorAlvo))}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl border border-border/60 bg-background/80 shadow-sm hover:bg-accent"
                            onClick={() => deleteMutation.mutate(meta.id)}
                            aria-label="Excluir meta concluída"
                            title="Excluir meta concluída"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
