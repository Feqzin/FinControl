import { useMemo } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
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
  abaterSaldoParcelaPessoa,
  abaterSaldoDividaPessoa,
  abaterSaldoServicoPessoa,
  createPessoaSaldoMovimentacao,
  createDividaPessoa,
  createPessoa,
  deletePessoa,
  desvincularPessoaDeCompra,
  getPessoaResumo,
  listPessoaSaldoMovimentacoes,
  listTimelinePagamentosByPessoa,
  marcarDividaPessoaComoPaga,
  marcarServicoPessoaComoPago,
  reverterDividaPessoaParaPendente,
  reverterServicoPessoaPago,
  vincularPessoaEmCompra,
  type PessoaSaldoMovimentacaoPayload,
  type PessoaSaldoMovimentacoesResponse,
  type PessoaResumo,
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

type ResumoDividaBloco = {
  pendente: number;
  pago: number;
  vencidas: number;
  quantidadePendentes: number;
};

export type PessoaResumoConsolidado = {
  source: "backend" | "fallback";
  consolidadoPendente: number;
  totalPago: number;
  dividas: {
    comigo: ResumoDividaBloco;
    euDevo: ResumoDividaBloco;
    pagueiDoMeuBolso: {
      pendente: number;
      pago: number;
      parcelasPendentes: number;
    };
  };
  comprasVinculadas: {
    pendentePessoa: number;
    pagoPessoa: number;
    parcelasPendentesPessoa: number;
    comprasComParcelasReais: number;
    comprasEmFallbackLegado: number;
  };
  servicosMesAtual: {
    escopo: "mes_atual";
    mesReferencia: string;
    pendente: number;
    pago: number;
    pendentesQuantidade: number;
    totalVinculos: number;
  };
  saldoPessoa: {
    creditos: number;
    debitos: number;
    saldoAtual: number;
    movimentacoes: number;
    ultimaMovimentacaoData: string | null;
  };
  alertas: {
    comprasAtrasadas: number;
    parcelasVencidasPessoa?: number;
    servicosPendentes: number;
    parcelasPendentesPessoa: number;
  };
};

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

function isPaidStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "pago";
}

function isCanceledStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "cancelado";
}

function isOutstandingStatus(status: string | null | undefined): boolean {
  return !isPaidStatus(status) && !isCanceledStatus(status);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
  const { data: historySaldoData, isLoading: isSaldoLoading } = useQuery<PessoaSaldoMovimentacoesResponse>({
    queryKey: ["/api/pessoas", historyPessoa?.id, "saldo-movimentacoes"],
    enabled: Boolean(historyPessoa?.id),
    queryFn: async () => {
      if (!historyPessoa?.id) {
        throw new Error("Pessoa não selecionada");
      }
      return listPessoaSaldoMovimentacoes(historyPessoa.id);
    },
  });

  const pessoaResumoQueries = useQueries({
    queries: pessoas.map((pessoa) => ({
      queryKey: ["/api/pessoas", pessoa.id, "resumo"],
      enabled: Boolean(pessoa.id),
      staleTime: 30_000,
      queryFn: async () => getPessoaResumo(pessoa.id),
    })),
  });

  const pessoaResumoById = useMemo(() => {
    const map = new Map<string, PessoaResumo>();
    pessoas.forEach((pessoa, index) => {
      const resumo = pessoaResumoQueries[index]?.data;
      if (resumo) {
        map.set(pessoa.id, resumo);
      }
    });
    return map;
  }, [pessoaResumoQueries, pessoas]);

  const createPessoaMutation = useMutation({
    mutationFn: (payload: PessoaPayload) => createPessoa(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
    },
  });

  const createDividaMutation = useMutation({
    mutationFn: (payload: DividaPessoaPayload) => createDividaPessoa(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      invalidateTimeline();
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ id, formaPagamento }: { id: string; formaPagamento: string }) =>
      marcarDividaPessoaComoPaga({ id, formaPagamento }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      invalidateTimeline();
    },
  });

  const reverterDividaPagamentoMutation = useMutation({
    mutationFn: (id: string) => reverterDividaPessoaParaPendente(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
    },
  });

  const marcarServicoPagoMutation = useMutation({
    mutationFn: ({ servicoPessoaId, mes }: { servicoPessoaId: string; mes: string }) =>
      marcarServicoPessoaComoPago({ servicoPessoaId, mes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    },
  });

  const reverterServicoPagoMutation = useMutation({
    mutationFn: (pagamentoId: string) => reverterServicoPessoaPago(pagamentoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    },
  });

  const createSaldoMovimentacaoMutation = useMutation({
    mutationFn: ({ pessoaId, payload }: { pessoaId: string; payload: PessoaSaldoMovimentacaoPayload }) =>
      createPessoaSaldoMovimentacao(pessoaId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "saldo-movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "resumo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
    },
  });

  const abaterSaldoDividaMutation = useMutation({
    mutationFn: ({
      pessoaId,
      dividaId,
      valor,
      data,
      observacao,
    }: {
      pessoaId: string;
      dividaId: string;
      valor: string;
      data?: string | null;
      observacao?: string | null;
    }) => abaterSaldoDividaPessoa(pessoaId, dividaId, { valor, data, observacao }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "saldo-movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "resumo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
      invalidateTimeline();
    },
  });

  const abaterSaldoServicoMutation = useMutation({
    mutationFn: ({
      pessoaId,
      servicoPessoaId,
      mes,
      valor,
      data,
      observacao,
    }: {
      pessoaId: string;
      servicoPessoaId: string;
      mes: string;
      valor: string;
      data?: string | null;
      observacao?: string | null;
    }) => abaterSaldoServicoPessoa(pessoaId, servicoPessoaId, { mes, valor, data, observacao }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "saldo-movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "resumo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
      invalidateTimeline();
    },
  });

  const abaterSaldoParcelaMutation = useMutation({
    mutationFn: ({
      pessoaId,
      parcelaId,
      valor,
      data,
      observacao,
    }: {
      pessoaId: string;
      parcelaId: string;
      valor: string;
      data?: string | null;
      observacao?: string | null;
    }) => abaterSaldoParcelaPessoa(pessoaId, parcelaId, { valor, data, observacao }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "saldo-movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "resumo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
      invalidateTimeline();
    },
  });

  const desvincularCompraMutation = useMutation({
    mutationFn: (id: string) => desvincularPessoaDeCompra(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    },
  });

  const vincularCompraMutation = useMutation({
    mutationFn: ({ compraId, pessoaId }: { compraId: string; pessoaId: string }) =>
      vincularPessoaEmCompra(compraId, pessoaId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas", variables.pessoaId, "resumo"] });
      invalidateTimeline();
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
    const resumo = getPessoaResumoConsolidado(pessoaId);
    const pendente = resumo.consolidadoPendente;
    const pago = resumo.totalPago;
    const emAberto = pendente > 0;
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
        .filter((p) => filterTipo === "todos" || filterTipo === "atrasados" || p.tipo === filterTipo),
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
  const historySaldo = historySaldoData ?? null;

  const historyCompras = historyFilter === "pendente"
    ? allHistoryCompras.filter((c) => !c.statusPessoa || c.statusPessoa !== "pago")
    : allHistoryCompras;

  const historyServicoPessoas = historyFilter === "pendente"
    ? allHistoryServicoPessoas.filter((sp) => {
      const pago = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
      return !pago;
    })
    : allHistoryServicoPessoas;

  function getPessoaResumoConsolidado(pessoaId: string): PessoaResumoConsolidado {
    const backendResumo = pessoaResumoById.get(pessoaId);
    if (backendResumo) {
      const totalPago = backendResumo.totais.dividas.comigo.pago
        + backendResumo.totais.dividas.euDevo.pago
        + backendResumo.totais.comprasVinculadas.pagoPessoa
        + backendResumo.totais.servicosMesAtual.pago;

      return {
        source: "backend",
        consolidadoPendente: backendResumo.totais.consolidadoPendente,
        totalPago,
        dividas: {
          comigo: backendResumo.totais.dividas.comigo,
          euDevo: backendResumo.totais.dividas.euDevo,
          pagueiDoMeuBolso: backendResumo.totais.dividas.pagueiDoMeuBolso,
        },
        comprasVinculadas: backendResumo.totais.comprasVinculadas,
        servicosMesAtual: backendResumo.totais.servicosMesAtual,
        saldoPessoa: backendResumo.totais.saldoPessoa,
        alertas: backendResumo.alertas,
      };
    }

    // Fallback temporario de transicao. A fonte de verdade principal deve ser
    // o endpoint consolidado do backend (/api/pessoas/:pessoaId/resumo).
    const today = format(new Date(), "yyyy-MM-dd");
    const pessoaDividas = dividas.filter((d) => d.pessoaId === pessoaId);
    const pessoaCompras = comprasCartao.filter((c) => c.pessoaId === pessoaId);
    const pessoaServicoPessoas = servicoPessoas.filter((sp) => sp.pessoaId === pessoaId);

    let dividasComigoPendente = 0;
    let dividasComigoPago = 0;
    let dividasComigoVencidas = 0;
    let dividasComigoQtdPendentes = 0;
    let dividasEuDevoPendente = 0;
    let dividasEuDevoPago = 0;
    let dividasEuDevoVencidas = 0;
    let dividasEuDevoQtdPendentes = 0;

    for (const divida of pessoaDividas) {
      const valor = Number(divida.valor) || 0;
      const isComigo = divida.tipo === "receber";
      const paid = isPaidStatus(divida.status);
      const overdue = !paid && !!divida.dataVencimento && divida.dataVencimento < today;

      if (isComigo) {
        if (paid) {
          dividasComigoPago += valor;
        } else {
          dividasComigoPendente += valor;
          dividasComigoQtdPendentes += 1;
          if (overdue) dividasComigoVencidas += 1;
        }
      } else if (paid) {
        dividasEuDevoPago += valor;
      } else {
        dividasEuDevoPendente += valor;
        dividasEuDevoQtdPendentes += 1;
        if (overdue) dividasEuDevoVencidas += 1;
      }
    }

    let comprasPendentes = 0;
    let comprasPagas = 0;
    let parcelasPendentesPessoa = 0;
    for (const compra of pessoaCompras) {
      const valorParcela = Number(compra.valorParcela) || 0;
      const totalParcelas = Math.max(1, Number(compra.parcelas) || 1);
      const parcelaAtual = Math.max(1, Math.min(totalParcelas, Number(compra.parcelaAtual) || 1));

      if (isPaidStatus(compra.statusPessoa)) {
        comprasPagas += Number(compra.valorTotal) || (valorParcela * totalParcelas);
        continue;
      }
      if (isCanceledStatus(compra.statusPessoa)) {
        continue;
      }

      const restantes = Math.max(0, totalParcelas - parcelaAtual + 1);
      parcelasPendentesPessoa += restantes;
      comprasPendentes += valorParcela * restantes;
    }

    let servicosPendentes = 0;
    let servicosPagos = 0;
    let servicosPendentesQuantidade = 0;
    for (const sp of pessoaServicoPessoas) {
      const valor = Number(sp.valorDevido) || 0;
      const pagamentoMes = servicoPagamentos.find((p) => p.servicoPessoaId === sp.id && p.mes === meAtual);
      if (pagamentoMes) {
        servicosPagos += valor;
      } else {
        servicosPendentes += valor;
        servicosPendentesQuantidade += 1;
      }
    }

    const consolidadoPendente = round2(
      dividasComigoPendente + dividasEuDevoPendente + comprasPendentes + servicosPendentes,
    );
    const totalPago = round2(dividasComigoPago + dividasEuDevoPago + comprasPagas + servicosPagos);

    return {
      source: "fallback",
      consolidadoPendente,
      totalPago,
      dividas: {
        comigo: {
          pendente: round2(dividasComigoPendente),
          pago: round2(dividasComigoPago),
          vencidas: dividasComigoVencidas,
          quantidadePendentes: dividasComigoQtdPendentes,
        },
        euDevo: {
          pendente: round2(dividasEuDevoPendente),
          pago: round2(dividasEuDevoPago),
          vencidas: dividasEuDevoVencidas,
          quantidadePendentes: dividasEuDevoQtdPendentes,
        },
        pagueiDoMeuBolso: {
          pendente: round2(comprasPendentes),
          pago: round2(comprasPagas),
          parcelasPendentes: parcelasPendentesPessoa,
        },
      },
      comprasVinculadas: {
        pendentePessoa: round2(comprasPendentes),
        pagoPessoa: round2(comprasPagas),
        parcelasPendentesPessoa,
        comprasComParcelasReais: 0,
        comprasEmFallbackLegado: pessoaCompras.length,
      },
      servicosMesAtual: {
        escopo: "mes_atual",
        mesReferencia: meAtual,
        pendente: round2(servicosPendentes),
        pago: round2(servicosPagos),
        pendentesQuantidade: servicosPendentesQuantidade,
        totalVinculos: pessoaServicoPessoas.length,
      },
      saldoPessoa: {
        creditos: 0,
        debitos: 0,
        saldoAtual: 0,
        movimentacoes: 0,
        ultimaMovimentacaoData: null,
      },
      alertas: {
        comprasAtrasadas: 0,
        parcelasVencidasPessoa: 0,
        servicosPendentes: servicosPendentesQuantidade,
        parcelasPendentesPessoa,
      },
    };
  }

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
    historySaldo,
    historyTimelineEvents,
    isTimelineLoading,
    isSaldoLoading,
    getPessoaResumoConsolidado,
    createPessoaMutation,
    createDividaMutation,
    payMutation,
    reverterDividaPagamentoMutation,
    updatePessoaMutation,
    deleteMutation,
    marcarServicoPagoMutation,
    reverterServicoPagoMutation,
    createSaldoMovimentacaoMutation,
    abaterSaldoDividaMutation,
    abaterSaldoServicoMutation,
    abaterSaldoParcelaMutation,
    desvincularCompraMutation,
    vincularCompraMutation,
    updateTimelineObservacaoMutation,
    uploadTimelineComprovanteMutation,
    getPessoaStats,
    duplicatePessoaByName,
  };
}
