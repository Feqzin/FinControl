import { z } from "zod";
import { normalizeIsoDate } from "../../utils/date.js";
import { importFaturaExtratoItemStatusSchema } from "./import-fatura-extrato.validators.js";

const moneyField = z.union([z.string(), z.number()]);

const isoDateRequired = z.union([z.string(), z.date()]).transform((value, ctx) => {
  const normalized = normalizeIsoDate(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data invalida" });
    return z.NEVER;
  }
  return normalized;
});

const isoDateNullableOptional = z.union([z.string(), z.date(), z.null(), z.undefined()]).transform((value, ctx) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const normalized = normalizeIsoDate(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data invalida" });
    return z.NEVER;
  }
  return normalized;
});

export const importSourceType = z.enum(["texto", "csv", "ofx", "qfx", "pdf", "manual"]);
export const importAction = z.enum(["import", "skip"]);

export const importPreviewItemBody = z.object({
  itemId: z.string().optional(),
  id: z.string().optional(),
  descricao: z.string().min(1),
  estabelecimento: z.string().max(180).optional().nullable(),
  valor: moneyField,
  valorParcela: moneyField,
  parcelas: z.coerce.number().int().min(1).max(360),
  // parcelaAtual = parcela corrente em aberto (1..parcelas).
  parcelaAtual: z.coerce.number().int().min(1).max(360),
  // parcelasRestantes nao e aceito no contrato: backend deriva do par
  // (parcelas, parcelaAtual) para manter semantica unica.
  dataCompra: isoDateRequired,
  vencimentoFatura: isoDateNullableOptional,
  tipo: z.enum(["compra", "taxa"]).optional(),
  action: importAction.optional(),
  shouldImport: z.boolean().optional(),
  status: importFaturaExtratoItemStatusSchema.optional(),
  confidenceScore: z.number().min(0).max(100).optional(),
  confidenceLevel: z.enum(["alta", "media", "baixa"]).optional(),
  reviewRequired: z.boolean().optional(),
  validationIssues: z.array(z.string().min(1).max(180)).max(20).optional(),
  forceImport: z.boolean().optional(),
  duplicateId: z.string().optional().nullable(),
  duplicata: z.any().optional(),
});

export const importPreviewBody = z.object({
  cartaoId: z.string().min(1),
  sourceType: importSourceType,
  sourceName: z.string().optional(),
  items: z.array(importPreviewItemBody).min(1).max(1200),
});

export const importConfirmBody = z.object({
  importLogId: z.string().min(1),
  userConfirmed: z.boolean().optional(),
  items: z.array(importPreviewItemBody).min(1).max(1200).optional(),
});

export type ImportSourceType = z.infer<typeof importSourceType>;
export type ImportAction = z.infer<typeof importAction>;
export type ImportPreviewItemInput = z.infer<typeof importPreviewItemBody>;
export type ImportPreviewBodyInput = z.infer<typeof importPreviewBody>;
export type ImportConfirmBodyInput = z.infer<typeof importConfirmBody>;
