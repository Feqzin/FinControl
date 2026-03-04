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
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, CreditCard, Trash2, CalendarClock, ShoppingBag, User } from "lucide-react";
import type { Cartao, CompraCartao, Pessoa } from "@shared/schema";
import { format, addMonths, getDaysInMonth } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getNextInvoiceDate(diaVencimento: number): string {
  const now = new Date();
  const currentDay = now.getDate();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), diaVencimento);
  if (currentDay >= diaVencimento) {
    targetDate = addMonths(targetDate, 1);
  }
  return format(targetDate, "dd/MM/yyyy");
}

function getDaysUntilInvoice(diaVencimento: number): number {
  const now = new Date();
  const currentDay = now.getDate();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), diaVencimento);
  if (currentDay >= diaVencimento) {
    targetDate = addMonths(targetDate, 1);
  }
  return Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CartoesPage() {
  const { toast } = useToast();
  const [openCard, setOpenCard] = useState(false);
  const [openCompra, setOpenCompra] = useState(false);
  const [selectedCartao, setSelectedCartao] = useState<string>("");
  const [cardForm, setCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [compraForm, setCompraForm] = useState({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });

  const { data: cartoes = [], isLoading } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const createCardMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/cartoes", {
        ...data,
        melhorDiaCompra: parseInt(data.melhorDiaCompra),
        diaVencimento: parseInt(data.diaVencimento),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      setOpenCard(false);
      setCardForm({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
      toast({ title: "Cartao adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createCompraMutation = useMutation({
    mutationFn: async (data: any) => {
      const parcelas = parseInt(data.parcelas);
      const valorTotal = parseFloat(data.valorTotal);
      const valorParcela = (valorTotal / parcelas).toFixed(2);
      await apiRequest("POST", "/api/compras-cartao", {
        cartaoId: selectedCartao,
        descricao: data.descricao,
        valorTotal: data.valorTotal,
        pessoaId: data.pessoaId || null,
        parcelas,
        parcelaAtual: 1,
        valorParcela,
        dataCompra: data.dataCompra,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      setOpenCompra(false);
      setCompraForm({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });
      toast({ title: "Compra registrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/cartoes/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      toast({ title: "Cartao removido" });
    },
  });

  const deleteCompraMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/compras-cartao/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      toast({ title: "Compra removida" });
    },
  });

  const getCardCompras = (cartaoId: string) => compras.filter((c) => c.cartaoId === cartaoId);
  const getCardTotal = (cartaoId: string) =>
    getCardCompras(cartaoId).reduce((s, c) => s + Number(c.valorParcela), 0);

  const totalFaturas = cartoes.reduce((s, c) => s + getCardTotal(c.id), 0);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="cartoes-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cartoes de Credito</h1>
          <p className="text-muted-foreground">Gerencie seus cartoes e compras parceladas</p>
        </div>
        <Dialog open={openCard} onOpenChange={setOpenCard}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-cartao">
              <Plus className="w-4 h-4 mr-2" /> Novo cartao
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Cartao</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createCardMutation.mutate(cardForm); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nome do cartao</Label>
                <Input
                  data-testid="input-cartao-nome"
                  value={cardForm.nome}
                  onChange={(e) => setCardForm({ ...cardForm, nome: e.target.value })}
                  placeholder="Ex: Nubank, Itau..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Limite total</Label>
                <Input
                  data-testid="input-cartao-limite"
                  type="number"
                  step="0.01"
                  value={cardForm.limite}
                  onChange={(e) => setCardForm({ ...cardForm, limite: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Melhor dia de compra</Label>
                  <Input
                    data-testid="input-cartao-melhordia"
                    type="number"
                    min="1"
                    max="31"
                    value={cardForm.melhorDiaCompra}
                    onChange={(e) => setCardForm({ ...cardForm, melhorDiaCompra: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dia de vencimento</Label>
                  <Input
                    data-testid="input-cartao-vencimento"
                    type="number"
                    min="1"
                    max="31"
                    value={cardForm.diaVencimento}
                    onChange={(e) => setCardForm({ ...cardForm, diaVencimento: e.target.value })}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" data-testid="button-save-cartao" disabled={createCardMutation.isPending}>
                {createCardMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {cartoes.length > 0 && (
        <Card className="hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Total de faturas abertas</p>
                <p className="text-2xl font-bold">{formatCurrency(totalFaturas)}</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={openCompra} onOpenChange={setOpenCompra}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Compra Parcelada</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); createCompraMutation.mutate(compraForm); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input
                data-testid="input-compra-descricao"
                value={compraForm.descricao}
                onChange={(e) => setCompraForm({ ...compraForm, descricao: e.target.value })}
                placeholder="O que comprou?"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor total</Label>
                <Input
                  data-testid="input-compra-valor"
                  type="number"
                  step="0.01"
                  value={compraForm.valorTotal}
                  onChange={(e) => setCompraForm({ ...compraForm, valorTotal: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Parcelas</Label>
                <Input
                  data-testid="input-compra-parcelas"
                  type="number"
                  min="1"
                  max="48"
                  value={compraForm.parcelas}
                  onChange={(e) => setCompraForm({ ...compraForm, parcelas: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data da compra</Label>
              <Input
                data-testid="input-compra-data"
                type="date"
                value={compraForm.dataCompra}
                onChange={(e) => setCompraForm({ ...compraForm, dataCompra: e.target.value })}
                required
              />
            </div>
            {pessoas.length > 0 && (
              <div className="space-y-2">
                <Label>Vincular a uma pessoa (opcional)</Label>
                <Select
                  value={compraForm.pessoaId || "__none__"}
                  onValueChange={(v) => setCompraForm({ ...compraForm, pessoaId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-compra-pessoa">
                    <SelectValue placeholder="Nenhuma (compra propria)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma (compra propria)</SelectItem>
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {compraForm.valorTotal && compraForm.parcelas && (
              <div className="p-3 rounded-md bg-muted/50">
                <p className="text-sm">
                  <span className="text-muted-foreground">Parcela: </span>
                  <span className="font-semibold">
                    {formatCurrency(parseFloat(compraForm.valorTotal) / parseInt(compraForm.parcelas || "1"))}
                  </span>
                  <span className="text-muted-foreground"> x {compraForm.parcelas}x</span>
                </p>
              </div>
            )}
            <Button type="submit" className="w-full" data-testid="button-save-compra" disabled={createCompraMutation.isPending}>
              {createCompraMutation.isPending ? "Salvando..." : "Registrar compra"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {cartoes.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-cartoes">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum cartao cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione seu primeiro cartao</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cartoes.map((c) => {
            const limite = Number(c.limite);
            const faturaAtual = getCardTotal(c.id);
            const percentUsed = limite > 0 ? (faturaAtual / limite) * 100 : 0;
            const cardCompras = getCardCompras(c.id);
            const daysUntil = getDaysUntilInvoice(Number(c.diaVencimento));
            const nextDate = getNextInvoiceDate(Number(c.diaVencimento));
            const isUrgent = daysUntil <= 5;

            return (
              <Card key={c.id} data-testid={`card-cartao-${c.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-11 h-11 rounded-md bg-primary/10">
                        <CreditCard className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{c.nome}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Melhor compra: dia {c.melhorDiaCompra}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCardMutation.mutate(c.id)}
                      data-testid={`button-delete-cartao-${c.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Fatura atual</p>
                      <p className="text-lg font-bold">{formatCurrency(faturaAtual)}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Disponivel</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(limite - faturaAtual)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{formatCurrency(faturaAtual)} usados</span>
                      <span>Limite: {formatCurrency(limite)}</span>
                    </div>
                    <Progress
                      value={Math.min(percentUsed, 100)}
                      className={`h-2 ${percentUsed > 80 ? "[&>div]:bg-red-500" : percentUsed > 60 ? "[&>div]:bg-amber-500" : ""}`}
                    />
                  </div>

                  <div className={`flex items-center gap-2 p-3 rounded-md ${isUrgent ? "bg-red-500/5 border border-red-500/10" : "bg-muted/30"}`}>
                    <CalendarClock className={`w-4 h-4 flex-shrink-0 ${isUrgent ? "text-red-500" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">Proxima fatura</p>
                      <p className={`text-sm font-semibold ${isUrgent ? "text-red-600" : ""}`}>
                        {nextDate} · {daysUntil} dia(s)
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Compras parceladas ({cardCompras.length})</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedCartao(c.id); setOpenCompra(true); }}
                      data-testid={`button-add-compra-${c.id}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Adicionar
                    </Button>
                  </div>

                  {cardCompras.length > 0 && (
                    <div className="space-y-2">
                      {cardCompras.map((compra) => (
                        <div
                          key={compra.id}
                          className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 text-sm"
                          data-testid={`compra-${compra.id}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="truncate font-medium">{compra.descricao}</p>
                              {compra.pessoaId && (
                                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
                                  <User className="w-2.5 h-2.5" />
                                  {pessoas.find((p) => p.id === compra.pessoaId)?.nome ?? "Pessoa"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {compra.parcelaAtual}/{compra.parcelas}x de {formatCurrency(Number(compra.valorParcela))}
                              {" · "}total: {formatCurrency(Number(compra.valorTotal))}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <span className="font-semibold">{formatCurrency(Number(compra.valorParcela))}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteCompraMutation.mutate(compra.id)}
                              data-testid={`button-delete-compra-${compra.id}`}
                            >
                              <Trash2 className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cardCompras.length === 0 && (
                    <p className="text-center py-3 text-sm text-muted-foreground">
                      Nenhuma compra parcelada
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
