import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import {
  FintechLoadingMetricCard,
  FintechLoadingPageHeader,
  FintechLoadingSurface,
} from "@/components/layout/fintech-loading-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  PiggyBank,
  Trash2,
  Pencil,
  Wallet,
  Banknote,
  TrendingUp,
  MoreHorizontal,
} from "lucide-react";
import type { Patrimonio, InsertPatrimonio } from "@shared/schema";
import { BrandIconDisplay } from "@/lib/brand-icons";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const TIPOS_PATRIMONIO = [
  { value: "conta_bancaria", label: "Conta Bancária", icon: Wallet },
  { value: "dinheiro", label: "Dinheiro", icon: Banknote },
  { value: "poupanca", label: "Poupança", icon: PiggyBank },
  { value: "investimento", label: "Investimento", icon: TrendingUp },
  { value: "outros", label: "Outros", icon: MoreHorizontal },
];

function formatCurrency(value: number | string): string {
  const val = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(val || 0);
}

export default function PatrimonioPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingPatrimonio, setEditingPatrimonio] = useState<Patrimonio | null>(null);
  const [formData, setFormData] = useState<Partial<InsertPatrimonio>>({
    nome: "",
    tipo: "conta_bancaria",
    valorAtual: "0",
  });

  const { data: patrimonios = [], isLoading } = useQuery<Patrimonio[]>({
    queryKey: ["/api/patrimonios"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertPatrimonio) => {
      await apiRequest("POST", "/api/patrimonios", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonios"] });
      setOpen(false);
      resetForm();
      toast({ title: "Patrimônio adicionado com sucesso" });
    },
    onError: (e: any) => {
      toast({
        title: "Erro ao adicionar patrimônio",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertPatrimonio> }) => {
      await apiRequest("PATCH", `/api/patrimonios/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonios"] });
      setOpen(false);
      resetForm();
      toast({ title: "Patrimônio atualizado com sucesso" });
    },
    onError: (e: any) => {
      toast({
        title: "Erro ao atualizar patrimônio",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/patrimonios/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonios"] });
      toast({ title: "Patrimônio removido com sucesso" });
    },
    onError: (e: any) => {
      toast({
        title: "Erro ao remover patrimônio",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({ nome: "", tipo: "conta_bancaria", valorAtual: "0", iconeId: undefined });
    setEditingPatrimonio(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPatrimonio) {
      updateMutation.mutate({ id: editingPatrimonio.id, data: formData });
    } else {
      createMutation.mutate(formData as InsertPatrimonio);
    }
  };

  const totalPatrimonio = patrimonios.reduce(
    (acc, p) => acc + parseFloat(p.valorAtual as string),
    0
  );

  const breakdown = TIPOS_PATRIMONIO.map((tipo) => {
    const valor = patrimonios
      .filter((p) => p.tipo === tipo.value)
      .reduce((acc, p) => acc + parseFloat(p.valorAtual as string), 0);
    const percent = totalPatrimonio > 0 ? (valor / totalPatrimonio) * 100 : 0;
    return { ...tipo, valor, percent };
  }).filter((b) => b.valor > 0 || patrimonios.length === 0);

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <FintechLoadingPageHeader
          titleWidth="w-56"
          subtitleWidth="w-72 max-w-full"
          actions={<Skeleton className="h-11 w-full rounded-2xl bg-muted/65 sm:w-44" />}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <FintechLoadingSurface>
            <div className="space-y-6 p-6">
              <FintechLoadingMetricCard
                className="border-0 shadow-none"
                titleWidth="w-24"
                valueWidth="w-40"
                iconSizeClassName="h-12 w-12"
              />
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <FintechLoadingSurface key={index} tone="inset" className="rounded-2xl">
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-xl bg-muted/70" />
                          <Skeleton className="h-4 w-28 rounded-full bg-muted/65" />
                        </div>
                        <Skeleton className="h-4 w-20 rounded-full bg-muted/65" />
                      </div>
                      <Skeleton className="h-2 w-full rounded-full bg-muted/60" />
                      <Skeleton className="ml-auto h-3 w-10 rounded-full bg-muted/55" />
                    </div>
                  </FintechLoadingSurface>
                ))}
              </div>
            </div>
          </FintechLoadingSurface>

          <div className="xl:col-span-2 fintech-grid-fluid-280 content-start">
            {Array.from({ length: 3 }).map((_, index) => (
              <FintechLoadingSurface key={index}>
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-12 w-12 rounded-2xl bg-muted/70" />
                      <div className="space-y-3">
                        <Skeleton className="h-5 w-32 rounded-full bg-muted/65" />
                        <Skeleton className="h-4 w-24 rounded-full bg-muted/60" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-9 w-9 rounded-xl bg-muted/65" />
                      <Skeleton className="h-9 w-9 rounded-xl bg-muted/65" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-36 rounded-full bg-muted/75" />
                    <Skeleton className="h-4 w-28 rounded-full bg-muted/60" />
                  </div>
                </div>
              </FintechLoadingSurface>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack">
      <FintechPageHeader
        eyebrow={(
          <Badge variant="outline" className="w-fit rounded-full border-border/60 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
            Visão patrimonial
          </Badge>
        )}
        title="Patrimônio"
        subtitle="Gerencie seus bens, contas e investimentos."
        badges={(
          <>
            <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              {patrimonios.length} {patrimonios.length === 1 ? "item cadastrado" : "itens cadastrados"}
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm dark:text-emerald-300">
              Total {formatCurrency(totalPatrimonio)}
            </Badge>
          </>
        )}
        actionsClassName="flex w-full justify-stretch sm:w-auto sm:justify-end"
        actions={(
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="h-11 w-full rounded-2xl px-5 shadow-sm sm:w-auto" data-testid="button-add-patrimonio">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Item
              </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingPatrimonio ? "Editar Patrimônio" : "Novo Patrimônio"}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Cadastre ou edite um item do patrimônio informando descrição, categoria e valor.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ícone</Label>
                    <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                      <IconPicker
                        value={formData.iconeId || null}
                        name={formData.nome || ""}
                        onChange={(v) => setFormData({ ...formData, iconeId: v || undefined })}
                        size="md"
                      />
                    </Suspense>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome / Descrição</Label>
                    <Input
                      id="nome"
                      data-testid="input-nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Conta Corrente Itaú"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo</Label>
                    <Select
                      value={formData.tipo}
                      onValueChange={(v) => setFormData({ ...formData, tipo: v })}
                    >
                      <SelectTrigger data-testid="select-tipo">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_PATRIMONIO.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valorAtual">Valor Atual (R$)</Label>
                    <Input
                      id="valorAtual"
                      data-testid="input-valor"
                      type="number"
                      step="0.01"
                      value={formData.valorAtual}
                      onChange={(e) => setFormData({ ...formData, valorAtual: e.target.value })}
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      data-testid="button-submit-patrimonio"
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {editingPatrimonio ? "Salvar Alterações" : "Adicionar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
        )}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold text-foreground">
                  Resumo Geral
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Distribuição atual do seu patrimônio cadastrado.
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
                <PiggyBank className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/80 px-4 py-4 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Patrimônio Total
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground" data-testid="text-total-patrimonio">
                {formatCurrency(totalPatrimonio)}
              </h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {breakdown.map((item) => (
              <div key={item.value} className="space-y-3 rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card shadow-sm">
                      <item.icon className="h-4 w-4 text-primary" />
                    </span>
                    {item.label}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(item.valor)}
                  </span>
                </div>
                <Progress value={item.percent} className="h-2.5" data-testid={`progress-${item.value}`} />
                <p className="text-[11px] font-medium text-right text-muted-foreground">
                  {item.percent.toFixed(1)}%
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="xl:col-span-2 fintech-grid-fluid-280 content-start">
          {patrimonios.length === 0 ? (
            <FintechEmptyState
              icon={<PiggyBank className="h-7 w-7 text-primary" />}
              title="Nenhum patrimônio cadastrado"
              description="Comece adicionando suas contas bancárias, investimentos ou dinheiro em espécie."
              className="col-span-full bg-card/80"
              iconWrapClassName="border-primary/15 bg-primary/10"
            />
          ) : (
            patrimonios.map((p) => {
              const tipoInfo = TIPOS_PATRIMONIO.find((t) => t.value === p.tipo) || TIPOS_PATRIMONIO[4];
              return (
                <Card key={p.id} className="hover-elevate overflow-visible rounded-[26px] border border-border/60 bg-card/95 shadow-sm transition-all" data-testid={`card-patrimonio-${p.id}`}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        {p.iconeId ? (
                          <div className="shrink-0 rounded-2xl border border-border/60 bg-background/80 p-2 shadow-sm">
                            <BrandIconDisplay name={p.nome} iconeId={p.iconeId} size="sm" />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
                            <tipoInfo.icon className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground shadow-sm">
                              {tipoInfo.label}
                            </Badge>
                          </div>
                          <h3 className="truncate text-base font-semibold tracking-tight text-foreground" title={p.nome}>
                            {p.nome}
                          </h3>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl border border-border/60 bg-background/80 shadow-sm hover:bg-accent"
                          data-testid={`button-edit-${p.id}`}
                          aria-label="Editar patrimônio"
                          title="Editar patrimônio"
                          onClick={() => {
                            setEditingPatrimonio(p);
                            setFormData({
                              nome: p.nome,
                              tipo: p.tipo,
                              valorAtual: p.valorAtual.toString(),
                              iconeId: p.iconeId || undefined,
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl border border-destructive/20 bg-background/80 text-destructive shadow-sm hover:bg-destructive/10"
                          data-testid={`button-delete-${p.id}`}
                          aria-label="Excluir patrimônio"
                          title="Excluir patrimônio"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover este item?")) {
                              deleteMutation.mutate(p.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-background/80 px-4 py-4 shadow-inner">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Valor atual
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-primary" data-testid={`text-valor-${p.id}`}>
                        {formatCurrency(p.valorAtual)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

