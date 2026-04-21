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
