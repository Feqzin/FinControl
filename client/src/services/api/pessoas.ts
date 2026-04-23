import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

export type PessoaPayload = {
  nome: string;
  tipo: string;
  telefone?: string;
  observacao?: string;
};

export type DividaPessoaPayload = {
  pessoaId: string;
  tipo: string;
  valor: string;
  dataVencimento?: string;
  descricao?: string;
  formaPagamento?: string;
};

export type PagamentoTimelineSourceType = "parcela" | "divida";

export type PagamentoTimelineEvent = {
  id: string;
  sourceType: PagamentoTimelineSourceType;
  sourceId: string;
  dividaId: string;
  tipoDivida: "receber" | "pagar";
  titulo: string;
  kind: "pagamento_realizado" | "pagamento_vencido" | "pagamento_pendente";
  status: "pago" | "vencido" | "pendente";
  dataEvento: string;
  dataPagamento: string | null;
  dataVencimento: string | null;
  valor: string;
  observacaoPagamento: string | null;
  comprovante: {
    nome: string;
    mimeType: string;
    tamanho: number;
    enviadoEm: string | null;
    downloadUrl: string;
  } | null;
};

export type PessoaSaldoMovimentacaoTipo = "credito" | "debito";

export type PessoaSaldoMovimentacao = {
  id: string;
  userId: string;
  pessoaId: string;
  tipo: PessoaSaldoMovimentacaoTipo;
  valor: string;
  data: string;
  origem: string;
  categoria: string | null;
  observacao: string | null;
  comprovanteReferencia: string | null;
  dividaId: string | null;
  compraCartaoId: string | null;
  parcelaCompraId: string | null;
  servicoPessoaId: string | null;
  createdAt: string;
  saldoAposMovimentacao?: number;
};

export type PessoaSaldoMovimentacoesResponse = {
  pessoa: {
    id: string;
    userId: string;
    nome: string;
    tipo: string;
    telefone: string | null;
    observacao: string | null;
  };
  resumo: {
    creditos: number;
    debitos: number;
    saldoAtual: number;
    movimentacoes: number;
    ultimaMovimentacaoData: string | null;
  };
  movimentacoes: PessoaSaldoMovimentacao[];
};

export type PessoaSaldoMovimentacaoPayload = {
  tipo: PessoaSaldoMovimentacaoTipo;
  valor: string;
  data?: string | null;
  origem?: string;
  categoria?: string | null;
  observacao?: string | null;
  comprovanteReferencia?: string | null;
  dividaId?: string | null;
  compraCartaoId?: string | null;
  parcelaCompraId?: string | null;
  servicoPessoaId?: string | null;
};

export type AbaterSaldoDividaPessoaPayload = {
  valor: string;
  data?: string | null;
  observacao?: string | null;
};

export type AbaterSaldoDividaPessoaResponse = {
  valorAbatido: number;
  valorPendenteAnterior: number;
  valorPendenteAtual: number;
  saldoAnterior: number;
  saldoAtual: number;
  quitada: boolean;
};

export type AbaterSaldoServicoPessoaPayload = {
  mes: string;
  valor: string;
  data?: string | null;
  observacao?: string | null;
};

export type AbaterSaldoServicoPessoaResponse = {
  mes: string;
  valorAbatido: number;
  valorPendenteAnterior: number;
  valorPendenteAtual: number;
  saldoAnterior: number;
  saldoAtual: number;
  quitado: boolean;
  pagamentoStatus: "parcial" | "pago";
};

export type PessoaResumo = {
  pessoa: {
    id: string;
    userId: string;
    nome: string;
    tipo: string;
    telefone: string | null;
    observacao: string | null;
  };
  totais: {
    dividas: {
      comigo: {
        pendente: number;
        pago: number;
        vencidas: number;
        quantidadePendentes: number;
      };
      euDevo: {
        pendente: number;
        pago: number;
        vencidas: number;
        quantidadePendentes: number;
      };
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
    consolidadoPendente: number;
  };
  alertas: {
    comprasAtrasadas: number;
    servicosPendentes: number;
    parcelasPendentesPessoa: number;
  };
};

export async function createPessoa(payload: PessoaPayload): Promise<void> {
  await apiRequest("POST", "/api/pessoas", payload);
}

export async function updatePessoa(id: string, payload: Partial<PessoaPayload>): Promise<void> {
  await apiRequest("PATCH", `/api/pessoas/${id}`, payload);
}

export async function deletePessoa(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/pessoas/${id}`);
}

export async function createDividaPessoa(payload: DividaPessoaPayload): Promise<void> {
  await apiRequest("POST", "/api/dividas", payload);
}

export async function marcarDividaPessoaComoPaga(params: {
  id: string;
  formaPagamento: string;
  dataPagamento?: string;
}): Promise<void> {
  await apiRequest("PATCH", `/api/dividas/${params.id}`, {
    status: "pago",
    dataPagamento: params.dataPagamento || format(new Date(), "yyyy-MM-dd"),
    formaPagamento: params.formaPagamento,
  });
}

export async function reverterDividaPessoaParaPendente(id: string): Promise<void> {
  await apiRequest("PATCH", `/api/dividas/${id}`, {
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
  });
}

export async function marcarServicoPessoaComoPago(params: {
  servicoPessoaId: string;
  mes: string;
  dataPagamento?: string;
}): Promise<void> {
  await apiRequest("POST", "/api/servico-pagamentos", {
    servicoPessoaId: params.servicoPessoaId,
    mes: params.mes,
    status: "pago",
    dataPagamento: params.dataPagamento || format(new Date(), "yyyy-MM-dd"),
  });
}

export async function reverterServicoPessoaPago(pagamentoId: string): Promise<void> {
  await apiRequest("DELETE", `/api/servico-pagamentos/${pagamentoId}`);
}

export async function desvincularPessoaDeCompra(compraId: string): Promise<void> {
  await apiRequest("PATCH", `/api/compras-cartao/${compraId}`, { pessoaId: null });
}

export async function listTimelinePagamentosByPessoa(pessoaId: string): Promise<PagamentoTimelineEvent[]> {
  const res = await apiRequest("GET", `/api/pessoas/${pessoaId}/timeline-pagamentos`);
  return (await res.json()) as PagamentoTimelineEvent[];
}

export async function getPessoaResumo(pessoaId: string): Promise<PessoaResumo> {
  const res = await apiRequest("GET", `/api/pessoas/${pessoaId}/resumo`);
  return (await res.json()) as PessoaResumo;
}

export async function listPessoaSaldoMovimentacoesByUser(): Promise<PessoaSaldoMovimentacao[]> {
  const res = await apiRequest("GET", "/api/pessoas/saldo-movimentacoes");
  return (await res.json()) as PessoaSaldoMovimentacao[];
}

export async function listPessoaSaldoMovimentacoes(pessoaId: string): Promise<PessoaSaldoMovimentacoesResponse> {
  const res = await apiRequest("GET", `/api/pessoas/${pessoaId}/saldo-movimentacoes`);
  return (await res.json()) as PessoaSaldoMovimentacoesResponse;
}

export async function createPessoaSaldoMovimentacao(
  pessoaId: string,
  payload: PessoaSaldoMovimentacaoPayload,
): Promise<PessoaSaldoMovimentacao> {
  const res = await apiRequest("POST", `/api/pessoas/${pessoaId}/saldo-movimentacoes`, payload);
  return (await res.json()) as PessoaSaldoMovimentacao;
}

export async function abaterSaldoDividaPessoa(
  pessoaId: string,
  dividaId: string,
  payload: AbaterSaldoDividaPessoaPayload,
): Promise<AbaterSaldoDividaPessoaResponse> {
  const res = await apiRequest("POST", `/api/pessoas/${pessoaId}/dividas/${dividaId}/abater-saldo`, payload);
  return (await res.json()) as AbaterSaldoDividaPessoaResponse;
}

export async function abaterSaldoServicoPessoa(
  pessoaId: string,
  servicoPessoaId: string,
  payload: AbaterSaldoServicoPessoaPayload,
): Promise<AbaterSaldoServicoPessoaResponse> {
  const res = await apiRequest("POST", `/api/pessoas/${pessoaId}/servicos/${servicoPessoaId}/abater-saldo`, payload);
  return (await res.json()) as AbaterSaldoServicoPessoaResponse;
}

export async function updateTimelinePagamentoObservacao(params: {
  sourceType: PagamentoTimelineSourceType;
  sourceId: string;
  observacaoPagamento: string | null;
}): Promise<void> {
  await apiRequest("PATCH", `/api/pagamentos/${params.sourceType}/${params.sourceId}/observacao`, {
    observacaoPagamento: params.observacaoPagamento,
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export async function uploadTimelinePagamentoComprovante(params: {
  sourceType: PagamentoTimelineSourceType;
  sourceId: string;
  file: File;
}): Promise<void> {
  const contentBase64 = await fileToBase64(params.file);
  await apiRequest("POST", `/api/pagamentos/${params.sourceType}/${params.sourceId}/comprovante`, {
    fileName: params.file.name,
    mimeType: params.file.type || "application/octet-stream",
    contentBase64,
  });
}
