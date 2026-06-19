import { z } from "zod";
import { normalizeIsoDate } from "../../utils/date.js";
import { parseMoney } from "../../utils/money.js";

const nonEmptyUpdateMessage = "Informe ao menos um campo para atualizar";
const moneyField = z.string().or(z.number()).transform(String);
const debtPersistedStatusValues = ["pendente", "pago"] as const;
const canonicalStatusValues = ["pendente", "parcial", "pago", "vencido", "cancelado"] as const;
const reembolsoModeValues = ["total", "metade", "valor_custom", "percentual_custom"] as const;
const canonicalStatusSet = new Set<string>(canonicalStatusValues);
const reembolsoModeSet = new Set<string>(reembolsoModeValues);

function normalizedStatusEnum<TValues extends readonly [string, ...string[]]>(values: TValues) {
  return z.string().trim().toLowerCase().pipe(z.enum(values));
}

const debtPersistedStatus = normalizedStatusEnum(debtPersistedStatusValues);
const canonicalStatus = normalizedStatusEnum(canonicalStatusValues);
const canonicalStatusNullableOptional = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === undefined || value === null) return value;
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) return null;
    if (!canonicalStatusSet.has(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Status invalido. Valores aceitos: ${canonicalStatusValues.join(", ")}`,
      });
      return z.NEVER;
    }
    return normalized as (typeof canonicalStatusValues)[number];
  });

const isoDateRequired = z.union([z.string(), z.date()]).transform((value, ctx) => {
  const normalized = normalizeIsoDate(value);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data invalida" });
    return z.NEVER;
  }
  return normalized;
});

const isoDateOptional = z.union([z.string(), z.date(), z.undefined()]).transform((value, ctx) => {
  if (value === undefined || value === "") return undefined;
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

const competenciaMonthRequired = z.string().trim().transform((value, ctx) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Competencia invalida. Use YYYY-MM." });
    return z.NEVER;
  }
  const month = Number(value.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Competencia invalida. Mes deve ficar entre 01 e 12." });
    return z.NEVER;
  }
  return value;
});

const reembolsoModeNullableOptional = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (!reembolsoModeSet.has(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Modo de reembolso invalido. Valores aceitos: ${reembolsoModeValues.join(", ")}`,
      });
      return z.NEVER;
    }
    return normalized as (typeof reembolsoModeValues)[number];
  });

const nonNegativeMoneyNullableOptional = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = parseMoney(value);
    if (parsed == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor de reembolso invalido" });
      return z.NEVER;
    }
    if (parsed < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor de reembolso deve ser maior ou igual a zero" });
      return z.NEVER;
    }
    return Number(parsed.toFixed(2));
  });

const percentualNullableOptional = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = parseMoney(value);
    if (parsed == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percentual de reembolso invalido" });
      return z.NEVER;
    }
    if (parsed < 0 || parsed > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentual de reembolso deve ficar entre 0 e 100",
      });
      return z.NEVER;
    }
    return Number(parsed.toFixed(4));
  });

export const dividaBody = z.object({
  pessoaId: z.string().min(1),
  tipo: z.enum(["receber", "pagar"]),
  valor: z.string().or(z.number()).transform(String),
  dataVencimento: isoDateNullableOptional,
  status: debtPersistedStatus.optional().default("pendente"),
  dataPagamento: isoDateNullableOptional,
  formaPagamento: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  totalParcelas: z.coerce.number().int().optional().nullable(),
  valorTotal: z.string().or(z.number()).transform(String).optional().nullable(),
});

export const dividaParceladoBody = z.object({
  pessoaId: z.string().min(1),
  tipo: z.enum(["receber", "pagar"]),
  valorTotal: z.string().or(z.number()).transform(Number),
  totalParcelas: z.coerce.number().int().min(1).max(360),
  primeiroVencimento: isoDateRequired,
  descricao: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
});

export const dividaUpdateBody = z.object({
  status: debtPersistedStatus.optional(),
  dataPagamento: isoDateNullableOptional,
  formaPagamento: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const parcelaUpdateBody = z.object({
  status: canonicalStatus.optional(),
  dataPagamento: isoDateNullableOptional,
  formaPagamento: z.string().optional().nullable(),
  valor: moneyField.optional(),
  dataVencimento: isoDateOptional,
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const anteciparParcelasBody = z.object({
  dividaId: z.string().min(1),
  quantidade: z.coerce.number().int().min(1).max(360),
  formaPagamento: z.string().optional().nullable(),
}).strict();

export const compraBody = z.object({
  cartaoId: z.string().min(1),
  descricao: z.string().min(1),
  valorTotal: moneyField,
  parcelas: z.coerce.number().int().min(1),
  parcelaAtual: z.coerce.number().int().min(1),
  valorParcela: moneyField,
  dataCompra: isoDateRequired,
  pessoaId: z.string().optional().nullable(),
  iconeId: z.string().optional().nullable(),
  reembolsoModo: reembolsoModeNullableOptional,
  reembolsoValorTotal: nonNegativeMoneyNullableOptional,
  reembolsoPercentual: percentualNullableOptional,
}).superRefine((data, ctx) => {
  if (data.reembolsoModo === "valor_custom" && data.reembolsoValorTotal == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reembolsoValorTotal"],
      message: "Informe o valor customizado de reembolso",
    });
  }

  if (data.reembolsoModo === "percentual_custom" && data.reembolsoPercentual == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reembolsoPercentual"],
      message: "Informe o percentual customizado de reembolso",
    });
  }

  if (data.reembolsoValorTotal != null) {
    const totalCompra = parseMoney(data.valorTotal);
    if (totalCompra != null && data.reembolsoValorTotal > totalCompra) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reembolsoValorTotal"],
        message: "Valor de reembolso nao pode ultrapassar o valor total da compra",
      });
    }
  }
});

export const compraUpdateBody = z.object({
  cartaoId: z.string().min(1).optional(),
  descricao: z.string().min(1).optional(),
  valorTotal: moneyField.optional(),
  parcelas: z.coerce.number().int().min(1).optional(),
  parcelaAtual: z.coerce.number().int().min(1).optional(),
  valorParcela: moneyField.optional(),
  dataCompra: isoDateOptional,
  pessoaId: z.string().min(1).optional().nullable(),
  iconeId: z.string().optional().nullable(),
  statusPessoa: canonicalStatusNullableOptional,
  dataPagamentoPessoa: isoDateNullableOptional,
  reembolsoModo: reembolsoModeNullableOptional,
  reembolsoValorTotal: nonNegativeMoneyNullableOptional,
  reembolsoPercentual: percentualNullableOptional,
}).strict().superRefine((data, ctx) => {
  if (data.reembolsoModo === "valor_custom" && data.reembolsoValorTotal == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reembolsoValorTotal"],
      message: "Informe o valor customizado de reembolso",
    });
  }

  if (data.reembolsoModo === "percentual_custom" && data.reembolsoPercentual == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reembolsoPercentual"],
      message: "Informe o percentual customizado de reembolso",
    });
  }
}).refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const cartaoBody = z.object({
  nome: z.string().min(1),
  limite: moneyField,
  melhorDiaCompra: z.coerce.number().int().min(1).max(31),
  diaVencimento: z.coerce.number().int().min(1).max(31),
});

export const cartaoUpdateBody = z.object({
  nome: z.string().min(1).optional(),
  limite: moneyField.optional(),
  melhorDiaCompra: z.coerce.number().int().min(1).max(31).optional(),
  diaVencimento: z.coerce.number().int().min(1).max(31).optional(),
  iconeId: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const cartaoFaturaPagamentoBody = z.object({
  valorPago: moneyField,
  dataPagamento: isoDateRequired,
  observacao: z.string().trim().max(500).optional().nullable(),
}).strict().superRefine((data, ctx) => {
  const parsed = parseMoney(data.valorPago);
  if (parsed == null || parsed <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valorPago"],
      message: "Informe um valor de pagamento maior que zero",
    });
  }
});

export const parcelaCompraUpdateBody = z.object({
  numero: z.coerce.number().int().min(1).optional(),
  valor: moneyField.optional(),
  dataVencimento: isoDateNullableOptional,
  statusCartao: canonicalStatus.optional(),
  dataPagamentoCartao: isoDateNullableOptional,
  statusPessoa: canonicalStatusNullableOptional,
  dataPagamentoPessoa: isoDateNullableOptional,
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const parcelaCompraCompetenciaUpdateBody = z.object({
  competencia: competenciaMonthRequired,
}).strict();

export const parcelaCompraBulkItemBody = z.object({
  numero: z.coerce.number().int().min(1),
  valor: moneyField,
  dataVencimento: isoDateNullableOptional,
  statusCartao: canonicalStatus.optional().default("pendente"),
  dataPagamentoCartao: isoDateNullableOptional,
  statusPessoa: canonicalStatusNullableOptional,
  dataPagamentoPessoa: isoDateNullableOptional,
}).strict();

export const parcelasCompraBulkBody = z.object({
  compraCartaoId: z.string().min(1),
  parcelas: z.array(parcelaCompraBulkItemBody).max(600),
}).strict();

function parseNonNegativeQueryNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = parseMoney(value);
  if (parsed == null) return undefined;
  return parsed < 0 ? 0 : parsed;
}

function parseMonth(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^\d{4}-\d{2}$/.test(value) ? value : undefined;
}

export function parseFinancialQuery(query: Record<string, unknown>) {
  return {
    month: parseMonth(query.month),
    simulation: {
      quitarDivida: parseNonNegativeQueryNumber(query.quitarDivida),
      reducaoDespesas: parseNonNegativeQueryNumber(query.reducaoDespesas),
      rendaExtra: parseNonNegativeQueryNumber(query.rendaExtra),
    },
  };
}

export type DividaBodyInput = z.infer<typeof dividaBody>;
export type DividaParceladoBodyInput = z.infer<typeof dividaParceladoBody>;
export type DividaUpdateBodyInput = z.infer<typeof dividaUpdateBody>;
export type ParcelaUpdateBodyInput = z.infer<typeof parcelaUpdateBody>;
export type AnteciparParcelasBodyInput = z.infer<typeof anteciparParcelasBody>;
export type CompraBodyInput = z.infer<typeof compraBody>;
export type CompraUpdateBodyInput = z.infer<typeof compraUpdateBody>;
export type CartaoBodyInput = z.infer<typeof cartaoBody>;
export type CartaoUpdateBodyInput = z.infer<typeof cartaoUpdateBody>;
export type CartaoFaturaPagamentoBodyInput = z.infer<typeof cartaoFaturaPagamentoBody>;
export type ParcelaCompraUpdateBodyInput = z.infer<typeof parcelaCompraUpdateBody>;
export type ParcelaCompraCompetenciaUpdateBodyInput = z.infer<typeof parcelaCompraCompetenciaUpdateBody>;
export type ParcelasCompraBulkBodyInput = z.infer<typeof parcelasCompraBulkBody>;
