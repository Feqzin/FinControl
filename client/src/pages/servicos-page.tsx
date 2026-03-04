import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Repeat, Trash2, X, Check } from "lucide-react";
import type { Servico } from "@shared/schema";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const categorias = [
  { value: "streaming", label: "Streaming" },
  { value: "lazer", label: "Lazer" },
  { value: "software", label: "Software" },
  { value: "assinatura", label: "Assinatura" },
  { value: "outros", label: "Outros" },
];

export default function ServicosPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "", categoria: "streaming", valorMensal: "", dataCobranca: "", formaPagamento: "cartao",
  });

  const { data: servicos = [], isLoading } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/servicos", {
        ...data,
        dataCobranca: parseInt(data.dataCobranca),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      setOpen(false);
      setForm({ nome: "", categoria: "streaming", valorMensal: "", dataCobranca: "", formaPagamento: "cartao" });
      toast({ title: "Servico adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/servicos/${id}`, { status: status === "ativo" ? "cancelado" : "ativo" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      toast({ title: "Status atualizado" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/servicos/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      toast({ title: "Servico removido" });
    },
  });

  const totalMensal = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + Number(sv.valorMensal), 0);

  const byCategory = categorias.map((cat) => ({
    ...cat,
    servicos: servicos.filter((s) => s.categoria === cat.value),
    total: servicos
      .filter((s) => s.categoria === cat.value && s.status === "ativo")
      .reduce((sum, s) => sum + Number(s.valorMensal), 0),
  })).filter((c) => c.servicos.length > 0);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="servicos-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servicos e Assinaturas</h1>
          <p className="text-muted-foreground">Gerencie seus gastos recorrentes</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-servico">
              <Plus className="w-4 h-4 mr-2" /> Novo servico
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Servico</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nome do servico</Label>
                <Input
                  data-testid="input-servico-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Netflix, Spotify..."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                    <SelectTrigger data-testid="select-servico-categoria">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Dia de cobranca</Label>
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
                      <SelectItem value="cartao">Cartao</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="debito">Debito automatico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" data-testid="button-save-servico" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="hover-elevate">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Total mensal em servicos</p>
              <p className="text-2xl font-bold">{formatCurrency(totalMensal)}</p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-amber-500/10">
              <Repeat className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {servicos.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-servicos">
          <Repeat className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum servico cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione seus servicos e assinaturas</p>
        </div>
      ) : (
        <div className="space-y-6">
          {byCategory.map((cat) => (
            <div key={cat.value}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{cat.label}</h3>
                <span className="text-sm font-medium">{formatCurrency(cat.total)}/mes</span>
              </div>
              <div className="space-y-2">
                {cat.servicos.map((s) => (
                  <Card key={s.id} className="hover-elevate" data-testid={`card-servico-${s.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-8 rounded-full flex-shrink-0 ${s.status === "ativo" ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                          <div className="min-w-0">
                            <p className={`font-medium ${s.status === "cancelado" ? "line-through text-muted-foreground" : ""}`}>{s.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              Dia {s.dataCobranca} | {s.formaPagamento}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-semibold">{formatCurrency(Number(s.valorMensal))}</span>
                          <Badge variant={s.status === "ativo" ? "default" : "secondary"}>
                            {s.status === "ativo" ? "Ativo" : "Cancelado"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleStatusMutation.mutate({ id: s.id, status: s.status })}
                            data-testid={`button-toggle-servico-${s.id}`}
                          >
                            {s.status === "ativo" ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(s.id)}
                            data-testid={`button-delete-servico-${s.id}`}
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
          ))}
        </div>
      )}
    </div>
  );
}
