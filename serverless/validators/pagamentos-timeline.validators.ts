import { z } from "zod";

export const pagamentoSourceType = z.enum(["parcela", "parcela_compra", "divida"]);

export const pagamentoSourceParams = z.object({
  sourceType: pagamentoSourceType,
  sourceId: z.string().min(1),
});

const observacaoField = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

export const pagamentoObservacaoBody = z.object({
  observacaoPagamento: observacaoField,
});

export const pagamentoComprovanteBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
  ]),
  // Aproximadamente 3MB reais em arquivo + overhead de base64/data-url.
  contentBase64: z.string().trim().min(1).max(4_200_000),
});

export type PagamentoSourceParamsInput = z.infer<typeof pagamentoSourceParams>;
export type PagamentoSourceType = z.infer<typeof pagamentoSourceType>;
export type PagamentoObservacaoBodyInput = z.infer<typeof pagamentoObservacaoBody>;
export type PagamentoComprovanteBodyInput = z.infer<typeof pagamentoComprovanteBody>;
