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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl" data-testid="metas-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas Financeiras</h1>
          <p className="text-muted-foreground">Acompanhe seus objetivos e veja quanto economizar por mês</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-meta">
              <Plus className="w-4 h-4 mr-2" /> Nova meta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Meta Financeira</DialogTitle>
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
                <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
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
      </div>

      {metasList.length === 0 ? (
        <div className="text-center py-20">
          <Target className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma meta criada ainda</p>
          <p className="text-sm text-muted-foreground mt-1">Defina seu primeiro objetivo financeiro</p>
        </div>
      ) : (
        <div className="space-y-6">
          {ativas.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Em andamento ({ativas.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ativas.map((meta) => {
                  const progresso = calcularProgresso(meta);
                  const mensal = calcularMensalNecessario(meta);
                  const mesesRestantes = Math.max(0, differenceInMonths(parseISO(meta.prazo), new Date()));
                  const concluida = Number(meta.valorAtual) >= Number(meta.valorAlvo);

                  return (
                    <Card key={meta.id} className="hover-elevate" data-testid={`card-meta-${meta.id}`}>
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
                              <Target className="w-5 h-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{meta.nome}</p>
                              {meta.descricao && (
                                <p className="text-xs text-muted-foreground truncate">{meta.descricao}</p>
                              )}
                            </div>
                          </div>
                          {concluida
                            ? <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />Concluida</Badge>
                            : mesesRestantes <= 1
                            ? <Badge variant="destructive">Urgente</Badge>
                            : <Badge variant="outline">{mesesRestantes}m restantes</Badge>
                          }
                        </div>

                        <div>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium">{formatCurrency(Number(meta.valorAtual))}</span>
                            <span className="text-muted-foreground">{formatCurrency(Number(meta.valorAlvo))}</span>
                          </div>
                          <Progress value={progresso} className="h-3" />
                          <p className="text-xs text-muted-foreground mt-1 text-right">{progresso.toFixed(0)}% concluido</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-md bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">Faltam</p>
                            <p className="text-base font-bold">{formatCurrency(Math.max(0, Number(meta.valorAlvo) - Number(meta.valorAtual)))}</p>
                          </div>
                          <div className="rounded-md bg-primary/5 p-3">
                            <p className="text-xs text-muted-foreground">Por mês</p>
                            <p className="text-base font-bold text-primary">{formatCurrency(mensal)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="w-3 h-3" />
                          <span>Prazo: {format(parseISO(meta.prazo), "dd/MM/yyyy")}</span>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => setEditMeta(meta)}
                                data-testid={`button-update-meta-${meta.id}`}
                              >
                                <TrendingUp className="w-3 h-3 mr-1" /> Atualizar valor
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Atualizar {meta.nome}</DialogTitle>
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
                            onClick={() => deleteMutation.mutate(meta.id)}
                            data-testid={`button-delete-meta-${meta.id}`}
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
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Concluidas ({concluidas.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {concluidas.map((meta) => (
                  <Card key={meta.id} className="opacity-75" data-testid={`card-meta-done-${meta.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                          <span className="font-medium">{meta.nome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-emerald-600">{formatCurrency(Number(meta.valorAlvo))}</span>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(meta.id)}>
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
