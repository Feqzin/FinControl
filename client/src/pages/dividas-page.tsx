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
import { Plus, Receipt, Search, Check, Trash2 } from "lucide-react";
import type { Divida, Pessoa } from "@shared/schema";
import { format } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function DividasPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payingDivida, setPayingDivida] = useState<Divida | null>(null);
  const [payForm, setPayForm] = useState({ formaPagamento: "pix" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [form, setForm] = useState({
    pessoaId: "", tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix",
  });

  const { data: dividas = [], isLoading } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/dividas", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setOpen(false);
      setForm({ pessoaId: "", tipo: "receber", valor: "", dataVencimento: "", descricao: "", formaPagamento: "pix" });
      toast({ title: "Divida registrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, formaPagamento }: { id: string; formaPagamento: string }) => {
      await apiRequest("PATCH", `/api/dividas/${id}`, {
        status: "pago",
        dataPagamento: format(new Date(), "yyyy-MM-dd"),
        formaPagamento,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      setPayOpen(false);
      setPayingDivida(null);
      toast({ title: "Divida marcada como paga" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/dividas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      toast({ title: "Divida removida" });
    },
  });

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "—";

  const filtered = dividas
    .filter((d) => {
      const nome = getPessoaNome(d.pessoaId).toLowerCase();
      return nome.includes(search.toLowerCase()) || (d.descricao || "").toLowerCase().includes(search.toLowerCase());
    })
    .filter((d) => filterStatus === "todos" || d.status === filterStatus)
    .filter((d) => filterTipo === "todos" || d.tipo === filterTipo)
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

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
    <div className="p-6 space-y-6" data-testid="dividas-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dividas</h1>
          <p className="text-muted-foreground">Controle de valores a receber e a pagar</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-divida">
              <Plus className="w-4 h-4 mr-2" /> Nova divida
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Divida</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Pessoa</Label>
                <Select value={form.pessoaId} onValueChange={(v) => setForm({ ...form, pessoaId: v })}>
                  <SelectTrigger data-testid="select-divida-pessoa">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger data-testid="select-divida-tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receber">A receber</SelectItem>
                      <SelectItem value="pagar">A pagar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    data-testid="input-divida-valor"
                    type="number"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input
                    data-testid="input-divida-vencimento"
                    type="date"
                    value={form.dataVencimento}
                    onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pagamento</Label>
                  <Select value={form.formaPagamento} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}>
                    <SelectTrigger data-testid="select-divida-pagamento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao">Cartao</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descricao (opcional)</Label>
                <Input
                  data-testid="input-divida-descricao"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Descricao breve"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-save-divida" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-divida"
            className="pl-9"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            <SelectItem value="receber">A receber</SelectItem>
            <SelectItem value="pagar">A pagar</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {payingDivida && (
              <div className="p-4 rounded-md bg-muted/50">
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-lg font-bold">{formatCurrency(Number(payingDivida.valor))}</p>
                <p className="text-sm text-muted-foreground mt-1">Pessoa: {getPessoaNome(payingDivida.pessoaId)}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={payForm.formaPagamento} onValueChange={(v) => setPayForm({ formaPagamento: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao">Cartao</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (payingDivida) {
                  payMutation.mutate({ id: payingDivida.id, formaPagamento: payForm.formaPagamento });
                }
              }}
              disabled={payMutation.isPending}
              data-testid="button-confirm-pay"
            >
              {payMutation.isPending ? "Processando..." : "Confirmar pagamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {filtered.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-dividas">
          <Receipt className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhuma divida encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Registre uma nova divida</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const isOverdue = d.status === "pendente" && d.dataVencimento < format(new Date(), "yyyy-MM-dd");
            return (
              <Card key={d.id} className="hover-elevate" data-testid={`card-divida-${d.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-full min-h-[40px] rounded-full flex-shrink-0 ${
                        d.status === "pago" ? "bg-emerald-500" : isOverdue ? "bg-red-500" : "bg-amber-500"
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{getPessoaNome(d.pessoaId)}</p>
                          <Badge variant={d.tipo === "receber" ? "default" : "destructive"}>
                            {d.tipo === "receber" ? "Receber" : "Pagar"}
                          </Badge>
                          <Badge variant={d.status === "pago" ? "secondary" : "outline"}>
                            {d.status === "pago" ? "Pago" : isOverdue ? "Vencido" : "Pendente"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Venc: {d.dataVencimento}
                          {d.descricao && ` | ${d.descricao}`}
                          {d.dataPagamento && ` | Pago em: ${d.dataPagamento}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{formatCurrency(Number(d.valor))}</span>
                      {d.status === "pendente" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setPayingDivida(d); setPayOpen(true); }}
                          data-testid={`button-pay-${d.id}`}
                        >
                          <Check className="w-4 h-4 text-emerald-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(d.id)}
                        data-testid={`button-delete-divida-${d.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
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
