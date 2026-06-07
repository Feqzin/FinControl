import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import { FintechSurfaceCard, FintechSurfaceIconChip } from "@/components/layout/fintech-surface-card";
import { FintechLoadingSurface } from "@/components/layout/fintech-loading-shell";
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
import { Plus, DollarSign, Trash2, Pencil, Power, PowerOff } from "lucide-react";
import type { Renda } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";

const rendaFormSchema = z.object({
  tipo: z.enum(["fixo", "variavel"]),
  descricao: z.string().min(1, "Descrição obrigatória"),
  valor: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, { message: "Valor inválido" }),
  diaRecebimento: z.number().int().min(1).max(31),
  ativo: z.boolean(),
});
type RendaFormData = z.infer<typeof rendaFormSchema>;

function formatCurrency(value: number | string): string {
  const val = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export default function RendaPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingRenda, setEditingRenda] = useState<Renda | null>(null);

  const { data: rendas = [], isLoading } = useQuery<Renda[]>({
    queryKey: ["/api/rendas"],
  });

  const form = useForm<RendaFormData>({
    resolver: zodResolver(rendaFormSchema),
    defaultValues: {
      descricao: "",
      valor: "",
      tipo: "fixo",
      diaRecebimento: 5,
      ativo: true,
    },
  });

  const createRendaMutation = useMutation({
    mutationFn: async (data: RendaFormData) => {
      const res = await apiRequest("POST", "/api/rendas", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rendas"] });
      setOpen(false);
      form.reset();
      toast({ title: "Renda adicionada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao adicionar renda", description: error.message, variant: "destructive" });
    },
  });

  const updateRendaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RendaFormData> }) => {
      const res = await apiRequest("PATCH", `/api/rendas/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rendas"] });
      setOpen(false);
      setEditingRenda(null);
      form.reset();
      toast({ title: "Renda atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar renda", description: error.message, variant: "destructive" });
    },
  });

  const deleteRendaMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/rendas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rendas"] });
      toast({ title: "Renda removida com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover renda", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: RendaFormData) => {
    if (editingRenda) {
      updateRendaMutation.mutate({ id: editingRenda.id, data });
    } else {
      createRendaMutation.mutate(data);
    }
  };

  const handleEdit = (renda: Renda) => {
    setEditingRenda(renda);
    form.reset({
      descricao: renda.descricao,
      valor: renda.valor.toString(),
      tipo: renda.tipo as "fixo" | "variavel",
      diaRecebimento: renda.diaRecebimento,
      ativo: renda.ativo,
    });
    setOpen(true);
  };

  const toggleAtivo = (renda: Renda) => {
    updateRendaMutation.mutate({
      id: renda.id,
      data: { ativo: !renda.ativo },
    });
  };

  const totalAtivo = rendas
    .filter((r) => r.ativo)
    .reduce((acc, r) => acc + parseFloat(r.valor.toString()), 0);

  const totalFixo = rendas
    .filter((r) => r.ativo && r.tipo === "fixo")
    .reduce((acc, r) => acc + parseFloat(r.valor.toString()), 0);

  const totalVariavel = rendas
    .filter((r) => r.ativo && r.tipo === "variavel")
    .reduce((acc, r) => acc + parseFloat(r.valor.toString()), 0);

  const totalAtivas = rendas.filter((r) => r.ativo).length;

  return (
    <div className="app-page-shell app-section-stack pb-20 md:pb-8">
      <FintechPageHeader
        title="Renda"
        subtitle="Gerencie suas fontes de renda mensais."
        rowClassName="items-start gap-4 xl:items-center"
        contentClassName="space-y-2"
        titleClassName="sm:text-3xl"
        badges={(
          <>
            <span className="rounded-full bg-muted/65 px-3 py-1.5 font-medium text-muted-foreground shadow-sm">
              {rendas.length} renda{rendas.length !== 1 ? "s" : ""}
            </span>
            <span className="rounded-full border border-emerald-500/10 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700 shadow-sm dark:text-emerald-400">
              {totalAtivas} ativa{totalAtivas !== 1 ? "s" : ""}
            </span>
            <span className="rounded-full border border-primary/10 bg-primary/10 px-3 py-1.5 font-medium text-primary shadow-sm">
              Total ativo {formatCurrency(totalAtivo)}
            </span>
          </>
        )}
        actionsClassName="flex w-full justify-stretch sm:w-auto sm:justify-end"
        actions={(
          <Dialog open={open} onOpenChange={(val) => {
            setOpen(val);
            if (!val) {
              setEditingRenda(null);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button
                className="h-10 w-full rounded-2xl px-4 font-medium shadow-sm sm:h-11 sm:w-auto sm:min-w-[190px]"
                data-testid="button-add-renda"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Renda
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingRenda ? "Editar Renda" : "Nova Renda"}</DialogTitle>
                <DialogDescription className="sr-only">
                  Cadastre ou edite uma fonte de renda informando descrição, valor e recorrência.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="descricao"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Descrição</Label>
                        <FormControl>
                          <Input placeholder="Ex: Salário, Freelance..." {...field} data-testid="input-descricao" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="valor"
                      render={({ field }) => (
                        <FormItem>
                          <Label>Valor (R$)</Label>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-valor" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="diaRecebimento"
                      render={({ field }) => (
                        <FormItem>
                          <Label>Dia do Recebimento</Label>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="31"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-dia-recebimento"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="tipo"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Tipo</Label>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tipo">
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fixo">Fixo</SelectItem>
                            <SelectItem value="variavel">Variável</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ativo"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <Label>Ativo</Label>
                          <p className="text-xs text-muted-foreground">Rendas inativas não somam no total.</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-ativo"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" className="w-full" disabled={createRendaMutation.isPending || updateRendaMutation.isPending}>
                      {editingRenda ? "Atualizar" : "Salvar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="fintech-grid-fluid-260">
        <FintechSurfaceCard interactive className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground/90">Total Ativo</CardTitle>
            <FintechSurfaceIconChip size="sm" className="border-primary/10 bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </FintechSurfaceIconChip>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="fin-value-kpi tracking-tight text-primary" data-testid="text-total-ativo">
              {formatCurrency(totalAtivo)}
            </div>
          </CardContent>
        </FintechSurfaceCard>
        <FintechSurfaceCard interactive className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground/90">Fixo</CardTitle>
            <Badge variant="outline" className="rounded-full border-border/60 bg-background/90 px-2.5 py-0.5 shadow-sm">Fixo</Badge>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="fin-value-kpi tracking-tight" data-testid="text-total-fixo">
              {formatCurrency(totalFixo)}
            </div>
          </CardContent>
        </FintechSurfaceCard>
        <FintechSurfaceCard interactive className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground/90">Variável</CardTitle>
            <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 shadow-sm">Variável</Badge>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="fin-value-kpi tracking-tight" data-testid="text-total-variavel">
              {formatCurrency(totalVariavel)}
            </div>
          </CardContent>
        </FintechSurfaceCard>
      </div>

      <div className="fintech-grid-fluid-260">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <FintechLoadingSurface key={i} className="overflow-hidden rounded-2xl">
              <div className="space-y-3 px-6 pb-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32 rounded-lg bg-muted/65" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-14 rounded-full bg-muted/60" />
                      <Skeleton className="h-5 w-16 rounded-full bg-muted/60" />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Skeleton className="h-8 w-8 rounded-lg bg-muted/65" />
                    <Skeleton className="h-8 w-8 rounded-lg bg-muted/65" />
                    <Skeleton className="h-8 w-8 rounded-lg bg-muted/65" />
                  </div>
                </div>
              </div>
              <div className="px-6 pb-6 pt-0">
                <Skeleton className="h-9 w-32 rounded-lg bg-muted/70" />
              </div>
            </FintechLoadingSurface>
          ))
        ) : rendas.length === 0 ? (
          <FintechEmptyState
            icon={<DollarSign className="h-6 w-6 text-muted-foreground/70" />}
            title="Nenhuma renda cadastrada"
            description="Adicione suas fontes de renda para acompanhar melhor sua entrada mensal."
            className="col-span-full"
          />
        ) : (
          rendas.map((renda) => (
            <Card
              key={renda.id}
              className={`hover-elevate flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm transition-all duration-200 ${!renda.ativo ? "opacity-70" : ""}`}
              data-testid={`card-renda-${renda.id}`}
            >
              <CardHeader className="gap-4 space-y-0 border-b border-border/50 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <CardTitle className="max-w-[220px] truncate text-base font-semibold tracking-tight sm:max-w-[280px]" title={renda.descricao}>
                      {renda.descricao}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={renda.tipo === "fixo" ? "outline" : "secondary"}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] shadow-sm ${
                          renda.tipo === "fixo" ? "border-border/60 bg-background/90" : ""
                        }`}
                      >
                        {renda.tipo === "fixo" ? "Fixo" : "Variável"}
                      </Badge>
                      <span className="rounded-full bg-muted/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                        Dia {renda.diaRecebimento}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                          renda.ativo
                            ? "border border-emerald-500/10 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border border-border/60 bg-muted/65 text-muted-foreground"
                        }`}
                      >
                        {renda.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/[0.16] px-2 py-1.5 shadow-sm">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                      onClick={() => toggleAtivo(renda)}
                      aria-label={renda.ativo ? "Desativar renda" : "Ativar renda"}
                      title={renda.ativo ? "Desativar" : "Ativar"}
                      data-testid={`button-toggle-ativo-${renda.id}`}
                    >
                      {renda.ativo ? <Power className="h-4 w-4 text-emerald-600" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg transition-colors hover:bg-background/90"
                      onClick={() => handleEdit(renda)}
                      aria-label="Editar renda"
                      title="Editar renda"
                      data-testid={`button-edit-renda-${renda.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive transition-colors hover:bg-background/90"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta renda?")) {
                          deleteRendaMutation.mutate(renda.id);
                        }
                      }}
                      aria-label="Excluir renda"
                      title="Excluir renda"
                      data-testid={`button-delete-renda-${renda.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 pt-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Valor mensal
                  </p>
                  <div className="text-2xl font-bold tracking-tight sm:text-[1.8rem]" data-testid={`text-valor-renda-${renda.id}`}>
                    {formatCurrency(renda.valor)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

