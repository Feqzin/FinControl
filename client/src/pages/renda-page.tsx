import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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

  return (
    <div className="p-4 md:p-8 space-y-8 pb-20 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Renda</h1>
          <p className="text-muted-foreground">Gerencie suas fontes de renda mensais.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => {
          setOpen(val);
          if (!val) {
            setEditingRenda(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-renda">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Renda
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRenda ? "Editar Renda" : "Nova Renda"}</DialogTitle>
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
                <div className="grid grid-cols-2 gap-4">
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Ativo</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-total-ativo">
              {formatCurrency(totalAtivo)}
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fixo</CardTitle>
            <Badge variant="outline">Fixo</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-fixo">
              {formatCurrency(totalFixo)}
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Variável</CardTitle>
            <Badge variant="secondary">Variável</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-variavel">
              {formatCurrency(totalVariavel)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader>
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-1/3" />
              </CardContent>
            </Card>
          ))
        ) : rendas.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhuma renda cadastrada.
          </div>
        ) : (
          rendas.map((renda) => (
            <Card key={renda.id} className={`hover-elevate flex flex-col ${!renda.ativo ? "opacity-60" : ""}`} data-testid={`card-renda-${renda.id}`}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base truncate max-w-[150px]" title={renda.descricao}>
                    {renda.descricao}
                  </CardTitle>
                  <div className="flex gap-2 items-center">
                    <Badge variant={renda.tipo === "fixo" ? "outline" : "secondary"} className="text-[10px] px-1.5 h-4">
                      {renda.tipo === "fixo" ? "Fixo" : "Variável"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Dia {renda.diaRecebimento}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleAtivo(renda)}
                    title={renda.ativo ? "Desativar" : "Ativar"}
                    data-testid={`button-toggle-ativo-${renda.id}`}
                  >
                    {renda.ativo ? <Power className="h-4 w-4 text-green-500" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(renda)}
                    data-testid={`button-edit-renda-${renda.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm("Tem certeza que deseja excluir esta renda?")) {
                        deleteRendaMutation.mutate(renda.id);
                      }
                    }}
                    data-testid={`button-delete-renda-${renda.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-2xl font-bold" data-testid={`text-valor-renda-${renda.id}`}>
                  {formatCurrency(renda.valor)}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
