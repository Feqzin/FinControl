import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeIsoDateValue(value: string | Date): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const trimmed = value.trim();
  if (ISO_DATE_REGEX.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMonetaryValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;

  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  // Accept "1234.56", "1.234,56" and "1,234.56".
  const normalized = trimmed.includes(",") && trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/,/g, "");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function nullableText(maxLength: number) {
  return z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
  });
}

const isoDateSchema = z.union([z.string(), z.date()]).transform((value, ctx) => {
  const normalized = normalizeIsoDateValue(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data invalida. Use formato ISO (yyyy-mm-dd)." });
    return z.NEVER;
  }
  return normalized;
});

const monetaryValueSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = parseMonetaryValue(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor invalido. Informe um numero maior que zero." });
    return z.NEVER;
  }
  return parsed;
});

export const importFaturaExtratoSourceTypeSchema = z.enum([
  "print",
  "imagem",
  "pdf",
  "texto",
  "csv",
  "ofx",
  "qfx",
  "manual",
]);

export const importFaturaExtratoItemStatusSchema = z.enum([
  "novo",
  "duplicata_exata",
  "possivel_duplicata",
  "invalido",
]);

export const importFaturaExtratoCartaoSchema = z.object({
  id: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
  nome: nullableText(120),
});

const importFaturaExtratoItemNormalizadoBaseSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  data: isoDateSchema,
  descricao: z.string().trim().min(1).max(280),
  valor: monetaryValueSchema,
  cartao: importFaturaExtratoCartaoSchema,
  parcelas: z.coerce.number().int().min(1).max(360).default(1),
  parcelaAtual: z.coerce.number().int().min(1).max(360).default(1),
  estabelecimento: nullableText(180),
  categoria: nullableText(120),
  observacao: nullableText(500),
});

export const importFaturaExtratoItemNormalizadoSchema = importFaturaExtratoItemNormalizadoBaseSchema.superRefine((item, ctx) => {
  if (item.parcelaAtual > item.parcelas) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parcelaAtual"],
      message: "Parcela atual nao pode ser maior que o total de parcelas.",
    });
  }
});

export const importFaturaExtratoItemPreviewSchema = importFaturaExtratoItemNormalizadoBaseSchema.extend({
  id: z.string().trim().min(1).max(120),
  status: importFaturaExtratoItemStatusSchema,
  motivos: z.array(z.string().trim().min(1).max(220)).default([]),
  duplicateOfId: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
}).superRefine((item, ctx) => {
  if (item.parcelaAtual > item.parcelas) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parcelaAtual"],
      message: "Parcela atual nao pode ser maior que o total de parcelas.",
    });
  }
});

export const importFaturaExtratoPreviewPayloadSchema = z.object({
  cartaoId: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
  sourceType: importFaturaExtratoSourceTypeSchema,
  sourceName: nullableText(180),
  items: z.array(importFaturaExtratoItemNormalizadoSchema).min(1).max(2000),
  // Mantem o fluxo obrigatorio de revisao humana antes de persistir.
  requiresUserConfirmation: z.literal(true).default(true),
});

export const importFaturaExtratoConfirmItemSchema = z.object({
  itemId: z.string().trim().min(1).max(120),
  status: importFaturaExtratoItemStatusSchema,
  shouldImport: z.boolean(),
  ajustes: importFaturaExtratoItemNormalizadoBaseSchema.partial().optional(),
}).superRefine((item, ctx) => {
  if (item.status === "invalido" && item.shouldImport) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shouldImport"],
      message: "Itens invalidos nao podem ser confirmados para importacao.",
    });
  }
});

export const importFaturaExtratoConfirmPayloadSchema = z.object({
  previewId: z.string().trim().min(1),
  userConfirmed: z.literal(true, {
    errorMap: () => ({ message: "Confirmacao explicita do usuario e obrigatoria." }),
  }),
  items: z.array(importFaturaExtratoConfirmItemSchema).min(1).max(2000),
});

export const importFaturaExtratoRollbackPayloadSchema = z.object({
  importLogId: z.string().trim().min(1),
});

export type ImportFaturaExtratoSourceType = z.infer<typeof importFaturaExtratoSourceTypeSchema>;
export type ImportFaturaExtratoItemStatus = z.infer<typeof importFaturaExtratoItemStatusSchema>;
export type ImportFaturaExtratoCartao = z.infer<typeof importFaturaExtratoCartaoSchema>;
export type ImportFaturaExtratoItemNormalizado = z.infer<typeof importFaturaExtratoItemNormalizadoSchema>;
export type ImportFaturaExtratoItemPreview = z.infer<typeof importFaturaExtratoItemPreviewSchema>;
export type ImportFaturaExtratoPreviewPayload = z.infer<typeof importFaturaExtratoPreviewPayloadSchema>;
export type ImportFaturaExtratoConfirmItem = z.infer<typeof importFaturaExtratoConfirmItemSchema>;
export type ImportFaturaExtratoConfirmPayload = z.infer<typeof importFaturaExtratoConfirmPayloadSchema>;
export type ImportFaturaExtratoRollbackPayload = z.infer<typeof importFaturaExtratoRollbackPayloadSchema>;
