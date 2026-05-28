import { z } from "zod";
import { normalizeIsoDate } from "../../utils/date.js";
import { importFaturaExtratoItemStatusSchema } from "./import-fatura-extrato.validators.js";
import { resolveServicoCategoryValue } from "../../shared/service-categories.js";

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
const importServiceActionType = z.enum(["none", "create_new", "link_existing"]);
const importServiceActionCategory = z.string().trim().min(1).transform((value, ctx) => {
  const normalized = resolveServicoCategoryValue(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Categoria de servico invalida." });
    return z.NEVER;
  }
  return normalized;
});

const importServiceAction = z.object({
  type: importServiceActionType.default("none"),
  name: z.string().trim().max(120).optional(),
  category: importServiceActionCategory.optional(),
  monthlyValue: z.coerce.number().positive().optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional(),
  serviceId: z.string().trim().optional().nullable(),
  replaceExistingLink: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.type === "none") return;

  if (value.type === "link_existing") {
    if (!value.serviceId || value.serviceId.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceId"],
        message: "serviceId obrigatorio para link_existing.",
      });
    }
    return;
  }

  if (!value.name || value.name.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "Nome do servico obrigatorio para create_new.",
    });
  }

  if (!Number.isFinite(value.monthlyValue ?? Number.NaN) || (value.monthlyValue ?? 0) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["monthlyValue"],
      message: "Valor mensal obrigatorio para create_new.",
    });
  }

  if (!Number.isInteger(value.billingDay ?? Number.NaN) || (value.billingDay ?? 0) < 1 || (value.billingDay ?? 0) > 31) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["billingDay"],
      message: "Dia de cobranca obrigatorio para create_new.",
    });
  }
});

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
  serviceAction: importServiceAction.optional(),
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

export const importReconcilePurchaseBody = z.object({
  importLogId: z.string().trim().min(1).optional(),
  itemId: z.string().trim().min(1).optional(),
  existingCompraCartaoId: z.string().trim().min(1, "existingCompraCartaoId obrigatorio."),
  importItem: importPreviewItemBody,
  confirmValueChange: z.boolean().optional(),
  updateNameFromImport: z.boolean().optional(),
  // Compatibilidade retroativa: alguns clientes antigos ainda enviam updateDescription.
  // A semântica nova usa updateNameFromImport e preserva o nome por padrão.
  updateDescription: z.boolean().optional(),
  aliasId: z.string().trim().min(1).optional().nullable(),
});

export type ImportSourceType = z.infer<typeof importSourceType>;
export type ImportAction = z.infer<typeof importAction>;
export type ImportPreviewItemInput = z.infer<typeof importPreviewItemBody>;
export type ImportPreviewBodyInput = z.infer<typeof importPreviewBody>;
export type ImportConfirmBodyInput = z.infer<typeof importConfirmBody>;
export type ImportReconcilePurchaseBodyInput = z.infer<typeof importReconcilePurchaseBody>;
