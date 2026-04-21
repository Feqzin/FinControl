import { apiRequest } from "@/lib/queryClient";
import { divide, formatMoneyFixed } from "@/lib/money";
import type { ParsedItem } from "@/pages/cartoes/import-parser";

type ImportSourceType = "texto" | "csv" | "ofx" | "qfx" | "manual";

export type ImportPreviewResponse = {
  importLogId: string;
  items: ParsedItem[];
  summary: {
    totalItems: number;
    importItems: number;
    skipItems: number;
    reviewItems: number;
    duplicateItems: number;
    averageConfidence: number;
  };
};

export type ImportConfirmResponse = {
  importLogId: string;
  createdCount: number;
  skippedCount: number;
  createdCompraIds: string[];
  alreadyConfirmed?: boolean;
};

export type ImportRollbackResponse = {
  importLogId: string;
  deletedCount: number;
  deletedCompraIds: string[];
  alreadyRolledBack?: boolean;
};

export type CartaoPayload = {
  nome: string;
  limite: string;
  melhorDiaCompra: string | number;
  diaVencimento: string | number;
  iconeId?: string | null;
};

export async function createCartao(payload: CartaoPayload): Promise<void> {
  await apiRequest("POST", "/api/cartoes", {
    ...payload,
    melhorDiaCompra: Number(payload.melhorDiaCompra),
    diaVencimento: Number(payload.diaVencimento),
    iconeId: payload.iconeId ?? null,
  });
}

export async function updateCartao(id: string, payload: CartaoPayload): Promise<void> {
  await apiRequest("PATCH", `/api/cartoes/${id}`, {
    nome: payload.nome,
    limite: payload.limite,
    melhorDiaCompra: Number(payload.melhorDiaCompra),
    diaVencimento: Number(payload.diaVencimento),
    iconeId: payload.iconeId ?? null,
  });
}

export async function deleteCartao(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/cartoes/${id}`);
}

export type CompraPayload = {
  cartaoId: string;
  descricao: string;
  valorTotal: string;
  parcelas: string | number;
  dataCompra: string;
  pessoaId?: string | null;
};

export async function createCompraCartao(payload: CompraPayload): Promise<void> {
  const parcelas = Number(payload.parcelas);
  const valorTotal = formatMoneyFixed(payload.valorTotal);
  if (!valorTotal) {
    throw new Error("Valor total invalido");
  }
  const valorParcela = divide(valorTotal, parcelas);

  await apiRequest("POST", "/api/compras-cartao", {
    cartaoId: payload.cartaoId,
    descricao: payload.descricao,
    valorTotal,
    pessoaId: payload.pessoaId || null,
    statusPessoa: payload.pessoaId ? "pendente" : null,
    parcelas,
    parcelaAtual: 1,
    valorParcela,
    dataCompra: payload.dataCompra,
  });
}

export type UpdateCompraPayload = {
  descricao: string;
  valorTotal: string;
  parcelas: string | number;
  pessoaId?: string | null;
  statusPessoa?: string | null;
};

export async function updateCompraCartao(id: string, payload: UpdateCompraPayload): Promise<void> {
  const parcelas = Number(payload.parcelas);
  const valorTotal = formatMoneyFixed(payload.valorTotal);
  if (!valorTotal) {
    throw new Error("Valor total invalido");
  }
  const valorParcela = divide(valorTotal, parcelas);
  const pessoaId = payload.pessoaId || null;

  await apiRequest("PATCH", `/api/compras-cartao/${id}`, {
    descricao: payload.descricao,
    valorTotal,
    parcelas,
    valorParcela,
    pessoaId,
    statusPessoa: pessoaId ? payload.statusPessoa || "pendente" : null,
  });
}

export async function deleteCompraCartao(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/compras-cartao/${id}`);
}

export async function updateCompraReembolso(id: string, pago: boolean): Promise<void> {
  await apiRequest("PATCH", `/api/compras-cartao/${id}`, {
    statusPessoa: pago ? "pago" : "pendente",
    dataPagamentoPessoa: pago ? new Date().toISOString().slice(0, 10) : null,
  });
}

export async function updateParcelaCompraStatusCartao(id: string, pago: boolean, dataPagamento?: string): Promise<void> {
  await apiRequest("PATCH", `/api/parcelas-compra/${id}`, {
    statusCartao: pago ? "pago" : "pendente",
    dataPagamentoCartao: pago ? dataPagamento || new Date().toISOString().slice(0, 10) : null,
  });
}

export async function updateParcelaCompraStatusPessoa(id: string, pago: boolean): Promise<void> {
  await apiRequest("PATCH", `/api/parcelas-compra/${id}`, {
    statusPessoa: pago ? "pago" : "pendente",
    dataPagamentoPessoa: pago ? new Date().toISOString().slice(0, 10) : null,
  });
}

export async function updateParcelaCompraValores(id: string, payload: { valor?: string; dataVencimento?: string }): Promise<void> {
  await apiRequest("PATCH", `/api/parcelas-compra/${id}`, {
    ...(payload.valor !== undefined ? { valor: payload.valor } : {}),
    ...(payload.dataVencimento !== undefined ? { dataVencimento: payload.dataVencimento } : {}),
  });
}

function toImportItemPayload(item: ParsedItem) {
  const duplicateId =
    item.duplicateId
    ?? (item.duplicata && typeof item.duplicata === "object" && "id" in item.duplicata
      ? String((item.duplicata as Record<string, unknown>).id ?? "")
      : null);

  return {
    id: item.id,
    descricao: item.descricao,
    valor: item.valor,
    valorParcela: item.valorParcela,
    parcelas: item.parcelas,
    parcelaAtual: item.parcelaAtual,
    dataCompra: item.dataCompra,
    vencimentoFatura: item.vencimentoFatura ?? null,
    tipo: item.tipo,
    action: item.action,
    duplicateId: duplicateId || null,
  };
}

export async function previewImportCompras(params: {
  cartaoId: string;
  sourceType: ImportSourceType;
  sourceName?: string;
  items: ParsedItem[];
}): Promise<ImportPreviewResponse> {
  const response = await apiRequest("POST", "/api/imports/preview", {
    cartaoId: params.cartaoId,
    sourceType: params.sourceType,
    sourceName: params.sourceName,
    items: params.items.map(toImportItemPayload),
  });
  return response.json();
}

export async function confirmImportCompras(params: {
  importLogId: string;
  items?: ParsedItem[];
}): Promise<ImportConfirmResponse> {
  const response = await apiRequest("POST", "/api/imports/confirm", {
    importLogId: params.importLogId,
    items: params.items ? params.items.map(toImportItemPayload) : undefined,
  });
  return response.json();
}

export async function rollbackImportCompras(importLogId: string): Promise<ImportRollbackResponse> {
  const response = await apiRequest("POST", `/api/imports/${importLogId}/rollback`);
  return response.json();
}

export async function importComprasLote(
  items: ParsedItem[],
  cartaoId: string,
  options?: { previewLogId?: string; sourceType?: ImportSourceType; sourceName?: string },
): Promise<ImportConfirmResponse> {
  let importLogId = options?.previewLogId;

  if (!importLogId) {
    const preview = await previewImportCompras({
      cartaoId,
      sourceType: options?.sourceType ?? "manual",
      sourceName: options?.sourceName,
      items,
    });
    importLogId = preview.importLogId;
  }

  return confirmImportCompras({
    importLogId,
    items,
  });
}
