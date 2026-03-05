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
    setFormData({ nome: "", tipo: "conta_bancaria", valorAtual: "0" });
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patrimônio</h1>
          <p className="text-muted-foreground">
            Gerencie seus bens, contas e investimentos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-patrimonio">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPatrimonio ? "Editar Patrimônio" : "Novo Patrimônio"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-primary" />
              Resumo Geral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Patrimônio Total</p>
              <h2 className="text-3xl font-bold" data-testid="text-total-patrimonio">
                {formatCurrency(totalPatrimonio)}
              </h2>
            </div>
            <div className="space-y-4">
              {breakdown.map((item) => (
                <div key={item.value} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <item.icon className="w-3 h-3" />
                      {item.label}
                    </span>
                    <span className="font-medium">{formatCurrency(item.valor)}</span>
                  </div>
                  <Progress value={item.percent} className="h-2" data-testid={`progress-${item.value}`} />
                  <p className="text-[10px] text-right text-muted-foreground">
                    {item.percent.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
          {patrimonios.length === 0 ? (
            <Card className="col-span-full py-12">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <PiggyBank className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold">Nenhum patrimônio cadastrado</h3>
                <p className="text-sm text-muted-foreground max-w-[250px]">
                  Comece adicionando suas contas bancárias, investimentos ou dinheiro em espécie.
                </p>
              </CardContent>
            </Card>
          ) : (
            patrimonios.map((p) => {
              const tipoInfo = TIPOS_PATRIMONIO.find((t) => t.value === p.tipo) || TIPOS_PATRIMONIO[4];
              return (
                <Card key={p.id} className="hover-elevate transition-all overflow-visible" data-testid={`card-patrimonio-${p.id}`}>
                  <CardContent className="p-4 flex justify-between items-start gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <tipoInfo.icon className="w-4 h-4 text-primary" />
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {tipoInfo.label}
                        </Badge>
                      </div>
                      <h3 className="font-semibold truncate mt-2" title={p.nome}>
                        {p.nome}
                      </h3>
                      <p className="text-xl font-bold text-primary" data-testid={`text-valor-${p.id}`}>
                        {formatCurrency(p.valorAtual)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`button-edit-${p.id}`}
                        onClick={() => {
                          setEditingPatrimonio(p);
                          setFormData({
                            nome: p.nome,
                            tipo: p.tipo,
                            valorAtual: p.valorAtual.toString(),
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        data-testid={`button-delete-${p.id}`}
                        onClick={() => {
                          if (confirm("Tem certeza que deseja remover este item?")) {
                            deleteMutation.mutate(p.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
