import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Pessoa,
  Servico,
  ServicoPagamento,
  ServicoPessoa,
} from "@shared/schema";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import {
  createDividaPessoa,
  createPessoa,
  deletePessoa,
  desvincularPessoaDeCompra,
  listTimelinePagamentosByPessoa,
  marcarDividaPessoaComoPaga,
  marcarServicoPessoaComoPago,
  reverterServicoPessoaPago,
  updateTimelinePagamentoObservacao,
  updatePessoa,
  uploadTimelinePagamentoComprovante,
  type DividaPessoaPayload,
  type PagamentoTimelineEvent,
  type PagamentoTimelineSourceType,
  type PessoaPayload,
} from "@/services/api/pessoas";

type UsePessoasArgs = {
  search: string;
  filterTipo: string;
  historyPessoa: Pessoa | null;
  historyFilter: "todos" | "pendente";
};

type PessoaStats = {
  pendente: number;
  pago: number;
  total: number;
  emAberto: boolean;
};

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function usePessoas({
  search,
  filterTipo,
  historyPessoa,
  historyFilter,
}: UsePessoasArgs) {
  const invalidateTimeline = () => {
    if (historyPessoa?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", historyPessoa.id, "timeline-pagamentos"] });
    }
  };

  const { data: pessoas = [], isLoading } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: dividas = [] } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: comprasCartao = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: servicos = [] } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: historyTimelineEvents = [], isLoading: isTimelineLoading } = useQuery<PagamentoTimelineEvent[]>({
    queryKey: ["/api/pessoas", historyPessoa?.id, "timeline-pagamentos"],
    enabled: Boolean(historyPessoa?.id),
    queryFn: async () => {
      if (!historyPessoa?.id) return [];
      return listTimelinePagamentosByPessoa(historyPessoa.id);
    },
  });

  const createPessoaMutation = useMutation({
    mutationFn: (payload: PessoaPayload) => createPessoa(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    },
  });

  const createDividaMutation = useMutation({
    mutationFn: (payload: DividaPessoaPayload) => createDividaPessoa(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      invalidateTimeline();
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ id, formaPagamento }: { id: string; formaPagamento: string }) =>
      marcarDividaPessoaComoPaga({ id, formaPagamento }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      invalidateTimeline();
    },
  });

  const updatePessoaMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<PessoaPayload>) =>
      updatePessoa(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePessoa(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    },
  });

  const marcarServicoPagoMutation = useMutation({
    mutationFn: ({ servicoPessoaId, mes }: { servicoPessoaId: string; mes: string }) =>
      marcarServicoPessoaComoPago({ servicoPessoaId, mes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
    },
  });

  const reverterServicoPagoMutation = useMutation({
    mutationFn: (pagamentoId: string) => reverterServicoPessoaPago(pagamentoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
    },
  });

  const desvincularCompraMutation = useMutation({
    mutationFn: (id: string) => desvincularPessoaDeCompra(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
    },
  });

  const updateTimelineObservacaoMutation = useMutation({
    mutationFn: (payload: {
      sourceType: PagamentoTimelineSourceType;
      sourceId: string;
      observacaoPagamento: string | null;
    }) => updateTimelinePagamentoObservacao(payload),
    onSuccess: () => {
      invalidateTimeline();
    },
  });

  const uploadTimelineComprovanteMutation = useMutation({
    mutationFn: (payload: {
      sourceType: PagamentoTimelineSourceType;
      sourceId: string;
      file: File;
    }) => uploadTimelinePagamentoComprovante(payload),
    onSuccess: () => {
      invalidateTimeline();
    },
  });

  const getPessoaStats = (pessoaId: string): PessoaStats => {
    const list = dividas.filter((d) => d.pessoaId === pessoaId);
    const pendente = list
      .filter((d) => d.status === "pendente")
      .reduce((sum, d) => sum + Number(d.valor), 0);
    const pago = list
      .filter((d) => d.status === "pago")
      .reduce((sum, d) => sum + Number(d.valor), 0);
    const emAberto = list.some((d) => d.status === "pendente");
    return { pendente, pago, total: list.length, emAberto };
  };

  const getPessoaDividas = (pessoaId: string) =>
    dividas
      .filter((d) => d.pessoaId === pessoaId)
      .sort((a, b) => (b.dataVencimento ?? "").localeCompare(a.dataVencimento ?? ""));

  const filtered = useMemo(
    () =>
      pessoas
        .filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()))
        .filter((p) => filterTipo === "todos" || p.tipo === filterTipo),
    [filterTipo, pessoas, search],
  );

  const meAtual = format(new Date(), "yyyy-MM");

  const duplicatePessoaByName = (nome: string): Pessoa | null => {
    if (nome.trim().length < 2) return null;
    const target = normalizeName(nome);
    return (
      pessoas.find((p) => {
        const existing = normalizeName(p.nome);
        return existing === target || existing.includes(target) || target.includes(existing);
      }) || null
    );
  };

  const allHistoryDividas = historyPessoa ? getPessoaDividas(historyPessoa.id) : [];
  const allHistoryCompras = historyPessoa
    ? comprasCartao.filter((c) => c.pessoaId === historyPessoa.id)
    : [];
  const allHistoryServicoPessoas = historyPessoa
    ? servicoPessoas.filter((sp) => sp.pessoaId === historyPessoa.id)
    : [];

  const historyDividas = historyFilter === "pendente"
    ? allHistoryDividas.filter((d) => d.status !== "pago")
    : allHistoryDividas;

  const historyStats = historyPessoa ? getPessoaStats(historyPessoa.id) : null;

  const historyCompras = historyFilter === "pendente"
    ? allHistoryCompras.filter((c) => !c.statusPessoa || c.statusPessoa !== "pago")
    : allHistoryCompras;

  const historyServicoPessoas = historyFilter === "pendente"
    ? allHistoryServicoPessoas.filter((sp) => {
      const pago = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
      return !pago;
    })
    : allHistoryServicoPessoas;

  return {
    pessoas,
    dividas,
    comprasCartao,
    cartoes,
    servicoPessoas,
    servicoPagamentos,
    servicos,
    isLoading,
    filtered,
    meAtual,
    historyDividas,
    historyCompras,
    historyServicoPessoas,
    historyStats,
    historyTimelineEvents,
    isTimelineLoading,
    createPessoaMutation,
    createDividaMutation,
    payMutation,
    updatePessoaMutation,
    deleteMutation,
    marcarServicoPagoMutation,
    reverterServicoPagoMutation,
    desvincularCompraMutation,
    updateTimelineObservacaoMutation,
    uploadTimelineComprovanteMutation,
    getPessoaStats,
    duplicatePessoaByName,
  };
}
