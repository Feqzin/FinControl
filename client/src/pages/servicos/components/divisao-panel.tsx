import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { formatCurrencyBRL } from "@/utils/formatters";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Pessoa, PessoaSaldoMovimentacao, Servico, ServicoPagamento, ServicoPessoa } from "@shared/schema";
import {
  addServicoPessoa,
  marcarServicoPessoaPago,
  removeServicoPessoa,
  reverterServicoPessoaPago,
  updateServicoPessoaValor,
} from "@/services/api/servicos";
import {
  getMesAtualRef,
  getMesesIntervalo,
  getMesesRecentes,
  labelMes,
} from "@/pages/servicos/servicos.utils";

interface DivisaoProps {
  servico: Servico;
  servicoPessoas: ServicoPessoa[];
  servicoPagamentos: ServicoPagamento[];
  pessoas: Pessoa[];
  pessoaSaldoMovimentacoes: PessoaSaldoMovimentacao[];
}

type PeriodoHistorico = "6m" | "12m" | "custom";

export function DivisaoPanel({
  servico,
  servicoPessoas,
  servicoPagamentos,
  pessoas,
  pessoaSaldoMovimentacoes,
}: DivisaoProps) {
  const { toast } = useToast();
  const [openAdd, setOpenAdd] = useState(false);
  const [addForm, setAddForm] = useState({ pessoaId: "", valorDevido: "" });
  const [editingValorId, setEditingValorId] = useState<string | null>(null);
  const [editingValor, setEditingValor] = useState("");
  const mesAtual = getMesAtualRef();
  const [periodoHistorico, setPeriodoHistorico] = useState<PeriodoHistorico>("6m");
  const [mesInicioCustom, setMesInicioCustom] = useState(getMesesRecentes(6)[0] ?? mesAtual);
  const [mesFimCustom, setMesFimCustom] = useState(mesAtual);

  const meses = (() => {
    if (periodoHistorico === "6m") return getMesesRecentes(6);
    if (periodoHistorico === "12m") return getMesesRecentes(12);
    const range = getMesesIntervalo(mesInicioCustom, mesFimCustom);
    return range.length > 0 ? range : getMesesRecentes(6);
  })();
  // Semantica mensal: o resumo "pendente" sempre usa o ultimo mes exibido no periodo.
  const mesReferencia = meses[meses.length - 1] ?? mesAtual;

  const updateValorMutation = useMutation({
    mutationFn: ({ id, valorDevido }: { id: string; valorDevido: string }) =>
      updateServicoPessoaValor(id, valorDevido),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      setEditingValorId(null);
      toast({ title: "Valor atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const vinculados = servicoPessoas.filter((sp) => sp.servicoId === servico.id);

  const pagamentosIndex = new Map<string, ServicoPagamento>();
  for (const pagamento of servicoPagamentos) {
    const key = `${pagamento.servicoPessoaId}:${pagamento.mes}`;
    const existente = pagamentosIndex.get(key);
    if (!existente) {
      pagamentosIndex.set(key, pagamento);
      continue;
    }

    if (existente.status !== "pago" && pagamento.status === "pago") {
      pagamentosIndex.set(key, pagamento);
      continue;
    }
    if (existente.status !== "parcial" && pagamento.status === "parcial") {
      pagamentosIndex.set(key, pagamento);
      continue;
    }

    const dataExistente = String(existente.dataPagamento ?? "");
    const dataAtual = String(pagamento.dataPagamento ?? "");
    const deveTrocar = dataAtual > dataExistente || (dataAtual === dataExistente && pagamento.id > existente.id);
    if (deveTrocar) {
      pagamentosIndex.set(key, pagamento);
    }
  }

  // Chave unica de leitura por vinculo+mes para evitar inflar totais com duplicatas legadas.
  const getPagamento = (servicoPessoaId: string, mes: string) =>
    pagamentosIndex.get(`${servicoPessoaId}:${mes}`);

  const getCategoriaServicoMes = (mes: string) => `servico_mes:${mes}`;
  const getSaldoAbatidoServicoMes = (servicoPessoaId: string, mes: string) => {
    return pessoaSaldoMovimentacoes.reduce((sum, row) => {
      if (row.tipo !== "debito") return sum;
      if (row.servicoPessoaId !== servicoPessoaId) return sum;
      if ((row.origem ?? "").toLowerCase() !== "abatimento_servico") return sum;
      if ((row.categoria ?? "").toLowerCase() !== getCategoriaServicoMes(mes)) return sum;
      return sum + (Number(row.valor) || 0);
    }, 0);
  };

  const addMutation = useMutation({
    mutationFn: ({ pessoaId, valorDevido }: { pessoaId: string; valorDevido: string }) =>
      addServicoPessoa({
        servicoId: servico.id,
        pessoaId,
        valorDevido,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      setOpenAdd(false);
      setAddForm({ pessoaId: "", valorDevido: "" });
      toast({ title: "Pessoa adicionada ao serviço" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeServicoPessoa(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pessoa removida" });
    },
  });

  const marcarPagoMutation = useMutation({
    mutationFn: ({ servicoPessoaId, mes }: { servicoPessoaId: string; mes: string }) =>
      marcarServicoPessoaPago({
        servicoPessoaId,
        mes,
        dataPagamento: format(new Date(), "yyyy-MM-dd"),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pagamento registrado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const marcarPendenteMutation = useMutation({
    mutationFn: (pagamentoId: string) => reverterServicoPessoaPago(pagamentoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      toast({ title: "Pagamento revertido" });
    },
  });

  const pessoasDisponiveis = pessoas.filter((p) => !vinculados.some((sp) => sp.pessoaId === p.id));

  const pagamentosPorVinculo = new Map<string, number>();
  for (const pagamento of Array.from(pagamentosIndex.values())) {
    if (pagamento.status !== "pago") continue;
    pagamentosPorVinculo.set(
      pagamento.servicoPessoaId,
      (pagamentosPorVinculo.get(pagamento.servicoPessoaId) ?? 0) + 1,
    );
  }

  const totalRecebido = vinculados.reduce((sum, sp) => {
    const pagos = pagamentosPorVinculo.get(sp.id) ?? 0;
    return sum + pagos * Number(sp.valorDevido);
  }, 0);

  const totalPendenteMes = vinculados.reduce((sum, sp) => {
    const pago = getPagamento(sp.id, mesReferencia);
    if (pago?.status === "pago") return sum;
    const abatidoSaldo = getSaldoAbatidoServicoMes(sp.id, mesReferencia);
    const pendente = Math.max(0, Number(sp.valorDevido) - abatidoSaldo);
    return sum + pendente;
  }, 0);

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Divisão entre pessoas</p>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {vinculados.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground lg:w-auto lg:justify-end">
              <span className="text-emerald-600 font-medium">Recebido: {formatCurrencyBRL(totalRecebido)}</span>
              <span className="text-amber-600 font-medium">
                Pendente em {labelMes(mesReferencia)}: {formatCurrencyBRL(totalPendenteMes)}
              </span>
            </div>
          )}
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={periodoHistorico} onValueChange={(value) => setPeriodoHistorico(value as PeriodoHistorico)}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-[128px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="12m">Últimos 12 meses</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodoHistorico === "custom" && (
              <>
                <Input
                  type="month"
                  className="h-8 w-full text-xs sm:w-[132px]"
                  value={mesInicioCustom}
                  onChange={(event) => setMesInicioCustom(event.target.value)}
                  aria-label="Mês inicial"
                />
                <Input
                  type="month"
                  className="h-8 w-full text-xs sm:w-[132px]"
                  value={mesFimCustom}
                  onChange={(event) => setMesFimCustom(event.target.value)}
                  aria-label="Mês final"
                />
              </>
            )}
          </div>
          {pessoasDisponiveis.length > 0 && (
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:w-auto" data-testid={`button-add-pessoa-servico-${servico.id}`}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar pessoa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar pessoa ao serviço</DialogTitle>
                  <DialogDescription className="sr-only">
                    Adicione uma pessoa a este serviço e defina o valor mensal devido para acompanhar a divisão.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addMutation.mutate(addForm);
                  }}
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
          Nenhuma pessoa vinculada. Adicione pessoas que dividem este serviço.
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
                              if (e.key === "Enter") {
                                updateValorMutation.mutate({ id: sp.id, valorDevido: editingValor });
                              }
                              if (e.key === "Escape") setEditingValorId(null);
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => updateValorMutation.mutate({ id: sp.id, valorDevido: editingValor })}
                            aria-label="Salvar valor devido"
                            title="Salvar valor devido"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => setEditingValorId(null)}
                            aria-label="Cancelar edição de valor"
                            title="Cancelar edição de valor"
                          >
                            <X className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 text-xs hover:text-primary"
                          onClick={() => {
                            setEditingValorId(sp.id);
                            setEditingValor(String(sp.valorDevido));
                          }}
                        >
                          {formatCurrencyBRL(Number(sp.valorDevido))}
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                    {meses.map((m) => {
                      const pg = getPagamento(sp.id, m);
                      const saldoAbatidoMes = getSaldoAbatidoServicoMes(sp.id, m);
                      const isPago = pg?.status === "pago";
                      const isParcial = !isPago && (pg?.status === "parcial" || saldoAbatidoMes > 0);
                      return (
                        <td key={m} className="text-center py-2 px-1">
                          {isPago ? (
                            <button
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-red-500"
                              onClick={() => {
                                if (!pg?.id) return;
                                marcarPendenteMutation.mutate(pg.id);
                              }}
                              title={`Reverter ${labelMes(m)} para pendente`}
                              disabled={marcarPendenteMutation.isPending || saldoAbatidoMes > 0}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          ) : isParcial ? (
                            <button
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-emerald-600"
                              onClick={() => marcarPagoMutation.mutate({ servicoPessoaId: sp.id, mes: m })}
                              title={`Parcial em ${labelMes(m)} (${formatCurrencyBRL(saldoAbatidoMes)} abatido). Marcar como pago.`}
                              disabled={marcarPagoMutation.isPending}
                            >
                              ~
                            </button>
                          ) : (
                            <button
                              className="inline-flex items-center gap-1 text-muted-foreground hover:text-emerald-600"
                              onClick={() => marcarPagoMutation.mutate({ servicoPessoaId: sp.id, mes: m })}
                              title={`Marcar ${labelMes(m)} como pago`}
                              disabled={marcarPagoMutation.isPending}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right py-2 pl-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => removeMutation.mutate(sp.id)}
                        data-testid={`button-remove-pessoa-servico-${sp.id}`}
                        aria-label="Remover pessoa da divisão"
                        title="Remover pessoa da divisão"
                      >
                        <Trash2 className="w-4 h-4" />
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
