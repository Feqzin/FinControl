import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Repeat, Trash2, X, Check, Users, ChevronUp, Pencil } from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { IconPicker } from "@/components/icon-picker";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Servico, ServicoPessoa, ServicoPagamento, Pessoa } from "@shared/schema";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getMeses(): string[] {
  const now = new Date();
  return [
    format(subMonths(now, 2), "yyyy-MM"),
    format(subMonths(now, 1), "yyyy-MM"),
    format(now, "yyyy-MM"),
  ];
}

function labelMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const d = new Date(parseInt(ano), parseInt(m) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
}

const categorias = [
  { value: "streaming", label: "Streaming" },
  { value: "lazer", label: "Lazer" },
  { value: "software", label: "Software" },
  { value: "assinatura", label: "Assinatura" },
  { value: "outros", label: "Outros" },
];

interface DivisaoProps {
  servico: Servico;
  servicoPessoas: ServicoPessoa[];
  servicoPagamentos: ServicoPagamento[];
  pessoas: Pessoa[];
}

function DivisaoPanel({ servico, servicoPessoas, servicoPagamentos, pessoas }: DivisaoProps) {
  const { toast } = useToast();
  const [openAdd, setOpenAdd] = useState(false);
  const [addForm, setAddForm] = useState({ pessoaId: "", valorDevido: "" });
  const [editingValorId, setEditingValorId] = useState<string | null>(null);
  const [editingValor, setEditingValor] = useState("");
  const meses = getMeses();

  const updateValorMutation = useMutation({
    mutationFn: async ({ id, valorDevido }: { id: string; valorDevido: string }) => {
      await apiRequest("PATCH", `/api/servico-pessoas/${id}`, { valorDevido });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      setEditingValorId(null);
      toast({ title: "Valor atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const vinculados = servicoPessoas.filter((sp) => sp.servicoId === servico.id);

  const getPagamento = (servicoPessoaId: string, mes: string) =>
    servicoPagamentos.find((p) => p.servicoPessoaId === servicoPessoaId && p.mes === mes);

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/servico-pessoas", {
        servicoId: servico.id,
        pessoaId: data.pessoaId,
        valorDevido: data.valorDevido,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      setOpenAdd(false);
      setAddForm({ pessoaId: "", valorDevido: "" });
      toast({ title: "Pessoa adicionada ao servico" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/servico-pessoas/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pessoa removida" });
    },
  });

  const marcarPagoMutation = useMutation({
    mutationFn: async ({ servicoPessoaId, mes }: { servicoPessoaId: string; mes: string }) => {
      await apiRequest("POST", "/api/servico-pagamentos", {
        servicoPessoaId,
        mes,
        status: "pago",
        dataPagamento: format(new Date(), "yyyy-MM-dd"),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pagamento registrado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const marcarPendenteMutation = useMutation({
    mutationFn: async (pagamentoId: string) => {
      await apiRequest("DELETE", `/api/servico-pagamentos/${pagamentoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pagamento revertido" });
    },
  });

  const pessoasDisponiveis = pessoas.filter((p) => !vinculados.some((sp) => sp.pessoaId === p.id));

  const totalRecebido = vinculados.reduce((sum, sp) => {
    const pagos = servicoPagamentos.filter((p) => p.servicoPessoaId === sp.id && p.status === "pago").length;
    return sum + pagos * Number(sp.valorDevido);
  }, 0);

  const totalPendenteMes = vinculados.reduce((sum, sp) => {
    const meAtual = meses[2];
    const pago = getPagamento(sp.id, meAtual);
    return sum + (pago ? 0 : Number(sp.valorDevido));
  }, 0);

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Divisao entre pessoas</p>
        <div className="flex items-center gap-2">
          {vinculados.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-600 font-medium">Recebido: {formatCurrency(totalRecebido)}</span>
              <span className="text-amber-600 font-medium">Pendente este mês: {formatCurrency(totalPendenteMes)}</span>
            </div>
          )}
          {pessoasDisponiveis.length > 0 && (
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid={`button-add-pessoa-servico-${servico.id}`}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar pessoa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar pessoa ao servico</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => { e.preventDefault(); addMutation.mutate(addForm); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label>Pessoa</Label>
                    <Select value={addForm.pessoaId} onValueChange={(v) => setAddForm({ ...addForm, pessoaId: v })}>
                      <SelectTrigger data-testid="select-pessoa-servico">
                        <SelectValue placeholder="Selecione uma pessoa" />
                      </SelectTrigger>
                      <SelectContent>
                        {pessoasDisponiveis.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor mensal devido</Label>
                    <Input
                      data-testid="input-valor-pessoa-servico"
                      type="number"
                      step="0.01"
                      value={addForm.valorDevido}
                      onChange={(e) => setAddForm({ ...addForm, valorDevido: e.target.value })}
                      placeholder={String(Number(servico.valorMensal) / (vinculados.length + 1))}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={addMutation.isPending || !addForm.pessoaId}
                    data-testid="button-confirm-add-pessoa-servico"
                  >
                    {addMutation.isPending ? "Salvando..." : "Adicionar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {vinculados.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Nenhuma pessoa vinculada. Adicione pessoas que dividem este servico.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left pb-2 font-medium">Pessoa</th>
                <th className="text-right pb-2 font-medium">Valor</th>
                {meses.map((m) => (
                  <th key={m} className="text-center pb-2 font-medium px-1 min-w-[80px]">{labelMes(m)}</th>
                ))}
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {vinculados.map((sp) => {
                const pessoa = pessoas.find((p) => p.id === sp.pessoaId);
                return (
                  <tr key={sp.id} data-testid={`row-servico-pessoa-${sp.id}`}>
                    <td className="py-2 pr-3 font-medium">{pessoa?.nome ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">
                      {editingValorId === sp.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-6 w-20 text-xs p-1"
                            value={editingValor}
                            onChange={(e) => setEditingValor(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateValorMutation.mutate({ id: sp.id, valorDevido: editingValor });
                              if (e.key === "Escape") setEditingValorId(null);
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => updateValorMutation.mutate({ id: sp.id, valorDevido: editingValor })}
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors group flex items-center gap-1 ml-auto"
                          onClick={() => { setEditingValorId(sp.id); setEditingValor(String(sp.valorDevido)); }}
                          data-testid={`button-edit-valor-${sp.id}`}
                        >
                          {formatCurrency(Number(sp.valorDevido))}
                          <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    {meses.map((mes) => {
                      const pag = getPagamento(sp.id, mes);
                      return (
                        <td key={mes} className="py-2 text-center px-1">
                          {pag ? (
                            <button
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              onClick={() => marcarPendenteMutation.mutate(pag.id)}
                              title="Clique para reverter"
                              data-testid={`button-reverter-pag-${sp.id}-${mes}`}
                            >
                              <Check className="w-3 h-3" /> Pago
                            </button>
                          ) : (
                            <button
                              className="inline-flex items-center text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                              onClick={() => marcarPagoMutation.mutate({ servicoPessoaId: sp.id, mes })}
                              data-testid={`button-marcar-pago-${sp.id}-${mes}`}
                            >
                              Pendente
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeMutation.mutate(sp.id)}
                        data-testid={`button-remove-pessoa-servico-${sp.id}`}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ServicosPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expandedDivisao, setExpandedDivisao] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    nome: "", categoria: "streaming", valorMensal: "", dataCobranca: "", formaPagamento: "cartao",
  });
  const [editingServico, setEditingServico] = useState<Servico | null>(null);
  const [editIcone, setEditIcone] = useState<string | null>(null);
  const [newServicoIcone, setNewServicoIcone] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nome: "", categoria: "streaming", valorMensal: "", dataCobranca: "", formaPagamento: "cartao",
  });

  const { data: servicos = [], isLoading } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/servicos", {
        ...data,
        dataCobranca: parseInt(data.dataCobranca),
        iconeId: newServicoIcone,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      setOpen(false);
      setForm({ nome: "", categoria: "streaming", valorMensal: "", dataCobranca: "", formaPagamento: "cartao" });
      setNewServicoIcone(null);
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, iconeId }: { id: string; data: any; iconeId?: string | null }) => {
      await apiRequest("PATCH", `/api/servicos/${id}`, {
        nome: data.nome,
        categoria: data.categoria,
        valorMensal: data.valorMensal,
        dataCobranca: parseInt(data.dataCobranca),
        formaPagamento: data.formaPagamento,
        iconeId: iconeId ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      setEditingServico(null);
      toast({ title: "Servico atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleDivisao = (id: string) => {
    setExpandedDivisao((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalMensal = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + Number(sv.valorMensal), 0);

  const totalPessoasPendente = (() => {
    const meAtual = format(new Date(), "yyyy-MM");
    return servicoPessoas.reduce((sum, sp) => {
      const pago = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
      return sum + (pago ? 0 : Number(sp.valorDevido));
    }, 0);
  })();

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
          <h1 className="text-2xl font-bold tracking-tight">Serviços e Assinaturas</h1>
          <p className="text-muted-foreground">Gerencie seus gastos recorrentes e divisões</p>
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
                <Label>Icone</Label>
                <IconPicker value={newServicoIcone} name={form.nome} onChange={setNewServicoIcone} size="sm" />
              </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        {servicoPessoas.length > 0 && (
          <Card className="hover-elevate">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Pendente de pessoas (mês atual)</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalPessoasPendente)}</p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-blue-500/10">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
                <span className="text-sm font-medium">{formatCurrency(cat.total)}/mês</span>
              </div>
              <div className="space-y-2">
                {cat.servicos.map((s) => {
                  const isDivisaoOpen = expandedDivisao.has(s.id);
                  const vinculados = servicoPessoas.filter((sp) => sp.servicoId === s.id);
                  const meAtual = format(new Date(), "yyyy-MM");
                  const pendentesHoje = vinculados.filter((sp) => !servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual)).length;
                  return (
                    <Card key={s.id} className="hover-elevate" data-testid={`card-servico-${s.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <BrandIconDisplay name={s.nome} iconeId={s.iconeId} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`font-medium ${s.status === "cancelado" ? "line-through text-muted-foreground" : ""}`}>{s.nome}</p>
                                {vinculados.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <Users className="w-2.5 h-2.5" />
                                    {vinculados.length} pessoa{vinculados.length !== 1 ? "s" : ""}
                                    {pendentesHoje > 0 && (
                                      <span className="text-amber-600 dark:text-amber-400"> · {pendentesHoje} pendente{pendentesHoje !== 1 ? "s" : ""}</span>
                                    )}
                                  </span>
                                )}
                              </div>
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
                              onClick={() => toggleDivisao(s.id)}
                              title="Divisao entre pessoas"
                              data-testid={`button-divisao-${s.id}`}
                            >
                              {isDivisaoOpen
                                ? <ChevronUp className="w-4 h-4" />
                                : <Users className="w-4 h-4" />
                              }
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingServico(s);
                                setEditIcone(s.iconeId || null);
                                setEditForm({
                                  nome: s.nome,
                                  categoria: s.categoria,
                                  valorMensal: String(s.valorMensal),
                                  dataCobranca: String(s.dataCobranca),
                                  formaPagamento: s.formaPagamento,
                                });
                              }}
                              data-testid={`button-edit-servico-${s.id}`}
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
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

                        {isDivisaoOpen && (
                          <DivisaoPanel
                            servico={s}
                            servicoPessoas={servicoPessoas}
                            servicoPagamentos={servicoPagamentos}
                            pessoas={pessoas}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editingServico} onOpenChange={(v) => { if (!v) { setEditingServico(null); setEditIcone(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Serviço</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingServico) return;
              updateMutation.mutate({ id: editingServico.id, data: editForm, iconeId: editIcone });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Ícone</Label>
              <IconPicker value={editIcone} name={editForm.nome} onChange={setEditIcone} size="sm" />
            </div>
            <div className="space-y-2">
              <Label>Nome do servico</Label>
              <Input
                data-testid="input-edit-servico-nome"
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={editForm.categoria} onValueChange={(v) => setEditForm({ ...editForm, categoria: v })}>
                  <SelectTrigger data-testid="select-edit-servico-categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor mensal</Label>
                <Input
                  data-testid="input-edit-servico-valor"
                  type="number"
                  step="0.01"
                  value={editForm.valorMensal}
                  onChange={(e) => setEditForm({ ...editForm, valorMensal: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dia de cobranca</Label>
                <Input
                  data-testid="input-edit-servico-datacobranca"
                  type="number"
                  min="1"
                  max="31"
                  value={editForm.dataCobranca}
                  onChange={(e) => setEditForm({ ...editForm, dataCobranca: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={editForm.formaPagamento} onValueChange={(v) => setEditForm({ ...editForm, formaPagamento: v })}>
                  <SelectTrigger data-testid="select-edit-servico-pagamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartao">Cartao</SelectItem>
                    <SelectItem value="debito">Debito automatico</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" data-testid="button-save-edit-servico" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
