import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { ServicoCobrancaPagamento } from "@shared/schema";

export type ServicoPayload = {
  nome: string;
  categoria: string;
  valorMensal?: string;
  valorCobranca?: string;
  periodicidadeCobranca?: "mensal" | "anual" | "semestral" | "trimestral" | "bimestral" | "semanal";
  dataCobranca: string | number | null;
  mesCobranca?: string | number | null;
  formaPagamento: string;
  cartaoId?: string | null;
  projetarNaFaturaCartao?: boolean;
  compraCartaoId?: string | null;
  status?: string;
  iconeId?: string | null;
};

export type ServicoPessoaPayload = {
  servicoId: string;
  pessoaId: string;
  valorDevido: string;
};

export type ServicoCobrancaPagamentoPayload = {
  servicoId: string;
  monthReference: string;
  valorPago: string | number;
  dataPagamento?: string;
  observacao?: string | null;
};

function serializeServicoDataCobranca(value: ServicoPayload["dataCobranca"] | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function serializeServicoMesCobranca(value: ServicoPayload["mesCobranca"] | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

export async function createServico(payload: ServicoPayload): Promise<void> {
  const dataCobranca = serializeServicoDataCobranca(payload.dataCobranca);
  const mesCobranca = serializeServicoMesCobranca(payload.mesCobranca);
  await apiRequest("POST", "/api/servicos", {
    ...payload,
    periodicidadeCobranca: payload.periodicidadeCobranca ?? "mensal",
    dataCobranca: dataCobranca ?? null,
    mesCobranca: payload.periodicidadeCobranca === "anual" ? (mesCobranca ?? null) : null,
    cartaoId: payload.cartaoId ?? null,
    projetarNaFaturaCartao: payload.projetarNaFaturaCartao === true,
    compraCartaoId: payload.compraCartaoId ?? null,
    status: payload.status || "ativo",
    iconeId: payload.iconeId ?? null,
  });
}

export async function updateServico(id: string, payload: Partial<ServicoPayload>): Promise<void> {
  const hasDataCobranca = Object.prototype.hasOwnProperty.call(payload, "dataCobranca");
  const dataCobranca = hasDataCobranca ? serializeServicoDataCobranca(payload.dataCobranca) : undefined;
  const hasMesCobranca = Object.prototype.hasOwnProperty.call(payload, "mesCobranca");
  const mesCobranca = hasMesCobranca ? serializeServicoMesCobranca(payload.mesCobranca) : undefined;
  const hasCartaoId = Object.prototype.hasOwnProperty.call(payload, "cartaoId");
  const hasProjectionFlag = Object.prototype.hasOwnProperty.call(payload, "projetarNaFaturaCartao");
  await apiRequest("PATCH", `/api/servicos/${id}`, {
    ...payload,
    ...(payload.periodicidadeCobranca !== undefined ? { periodicidadeCobranca: payload.periodicidadeCobranca } : {}),
    ...(hasDataCobranca ? { dataCobranca: dataCobranca ?? null } : {}),
    ...(hasMesCobranca ? { mesCobranca: mesCobranca ?? null } : {}),
    ...(hasCartaoId ? { cartaoId: payload.cartaoId ?? null } : {}),
    ...(hasProjectionFlag ? { projetarNaFaturaCartao: payload.projetarNaFaturaCartao === true } : {}),
  });
}

export async function toggleServicoStatus(id: string, statusAtual: string): Promise<void> {
  await apiRequest("PATCH", `/api/servicos/${id}`, {
    status: statusAtual === "ativo" ? "pausado" : "ativo",
  });
}

export async function deleteServico(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/servicos/${id}`);
}

export async function addServicoPessoa(payload: ServicoPessoaPayload): Promise<void> {
  await apiRequest("POST", "/api/servico-pessoas", payload);
}

export async function updateServicoPessoaValor(id: string, valorDevido: string): Promise<void> {
  await apiRequest("PATCH", `/api/servico-pessoas/${id}`, { valorDevido });
}

export async function removeServicoPessoa(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/servico-pessoas/${id}`);
}

export async function marcarServicoPessoaPago(params: {
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

export async function fetchServicoCobrancaPagamentos(): Promise<ServicoCobrancaPagamento[]> {
  const response = await apiRequest("GET", "/api/servicos/cobranca-pagamentos");
  return response.json();
}

export async function registrarServicoCobrancaPagamento(
  payload: ServicoCobrancaPagamentoPayload,
): Promise<ServicoCobrancaPagamento> {
  const response = await apiRequest("POST", `/api/servicos/${payload.servicoId}/cobranca-pagamentos`, {
    monthReference: payload.monthReference,
    valorPago: String(payload.valorPago),
    dataPagamento: payload.dataPagamento ?? format(new Date(), "yyyy-MM-dd"),
    observacao: payload.observacao ?? null,
  });
  return response.json();
}

export async function cancelarServicoCobrancaPagamento(
  servicoId: string,
  paymentId: string,
  motivoCancelamento?: string | null,
): Promise<ServicoCobrancaPagamento> {
  const response = await apiRequest("POST", `/api/servicos/${servicoId}/cobranca-pagamentos/${paymentId}/cancelar`, {
    motivoCancelamento: motivoCancelamento ?? null,
  });
  return response.json();
}
