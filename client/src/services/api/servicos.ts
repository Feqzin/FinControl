import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

export type ServicoPayload = {
  nome: string;
  categoria: string;
  valorMensal?: string;
  valorCobranca?: string;
  periodicidadeCobranca?: "mensal" | "anual" | "semestral" | "trimestral" | "bimestral" | "semanal";
  dataCobranca: string | number;
  formaPagamento: string;
  compraCartaoId?: string | null;
  status?: string;
  iconeId?: string | null;
};

export type ServicoPessoaPayload = {
  servicoId: string;
  pessoaId: string;
  valorDevido: string;
};

export async function createServico(payload: ServicoPayload): Promise<void> {
  await apiRequest("POST", "/api/servicos", {
    ...payload,
    periodicidadeCobranca: payload.periodicidadeCobranca ?? "mensal",
    dataCobranca: Number(payload.dataCobranca),
    compraCartaoId: payload.compraCartaoId ?? null,
    status: payload.status || "ativo",
    iconeId: payload.iconeId ?? null,
  });
}

export async function updateServico(id: string, payload: Partial<ServicoPayload>): Promise<void> {
  await apiRequest("PATCH", `/api/servicos/${id}`, {
    ...payload,
    ...(payload.periodicidadeCobranca !== undefined ? { periodicidadeCobranca: payload.periodicidadeCobranca } : {}),
    ...(payload.dataCobranca !== undefined ? { dataCobranca: Number(payload.dataCobranca) } : {}),
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
