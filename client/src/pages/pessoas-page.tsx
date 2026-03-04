import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Phone, Trash2, Search } from "lucide-react";
import type { Pessoa, Divida } from "@shared/schema";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function PessoasPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [form, setForm] = useState({ nome: "", tipo: "me_deve", telefone: "", observacao: "" });

  const { data: pessoas = [], isLoading } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: dividas = [] } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/pessoas", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      setOpen(false);
      setForm({ nome: "", tipo: "me_deve", telefone: "", observacao: "" });
      toast({ title: "Pessoa adicionada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pessoas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      toast({ title: "Pessoa removida" });
    },
  });

  const getPessoaStats = (pessoaId: string) => {
    const pessoaDividas = dividas.filter((d) => d.pessoaId === pessoaId);
    const pendente = pessoaDividas.filter((d) => d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
    const pago = pessoaDividas.filter((d) => d.status === "pago").reduce((s, d) => s + Number(d.valor), 0);
    return { pendente, pago, total: pessoaDividas.length };
  };

  const filtered = pessoas
    .filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => filterTipo === "todos" || p.tipo === filterTipo);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="pessoas-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pessoas</h1>
          <p className="text-muted-foreground">Gerencie pessoas vinculadas as dividas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-pessoa">
              <Plus className="w-4 h-4 mr-2" /> Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Pessoa</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  data-testid="input-pessoa-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Nome da pessoa"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger data-testid="select-pessoa-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me_deve">Me deve</SelectItem>
                    <SelectItem value="eu_devo">Eu devo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telefone (opcional)</Label>
                <Input
                  data-testid="input-pessoa-telefone"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>Observacao</Label>
                <Textarea
                  data-testid="input-pessoa-obs"
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Notas sobre essa pessoa"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-save-pessoa" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-pessoa"
            className="pl-9"
            placeholder="Buscar pessoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[150px]" data-testid="filter-tipo-pessoa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="me_deve">Me devem</SelectItem>
            <SelectItem value="eu_devo">Eu devo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-pessoas">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma pessoa encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione uma pessoa para comecar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const stats = getPessoaStats(p.id);
            return (
              <Card key={p.id} className="hover-elevate" data-testid={`card-pessoa-${p.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {p.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.nome}</p>
                        {p.telefone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {p.telefone}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={p.tipo === "me_deve" ? "default" : "destructive"}>
                      {p.tipo === "me_deve" ? "Me deve" : "Eu devo"}
                    </Badge>
                  </div>
                  {p.observacao && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{p.observacao}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Pendente</p>
                      <p className="text-sm font-semibold">{formatCurrency(stats.pendente)}</p>
                    </div>
                    <div className="space-y-0.5 text-right">
                      <p className="text-xs text-muted-foreground">{stats.total} divida(s)</p>
                      <Badge variant={stats.pendente === 0 ? "secondary" : "outline"}>
                        {stats.pendente === 0 ? "Quitado" : "Em aberto"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(p.id)}
                      data-testid={`button-delete-pessoa-${p.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
