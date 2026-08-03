import { z } from "zod";

export const futurePurchaseSimulationStatusSchema = z.enum([
  "Pode comprar",
  "Atenção",
  "Não recomendado",
]);

const nullableTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

const nonNegativeNumber = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().finite().min(0));

const nullableNumber = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.union([z.number().finite(), z.null()]));

const positiveInteger = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().int().min(1));

const nullablePositiveInteger = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.union([z.number().int().min(1), z.null()]));

const monthReferenceSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida.");
const fullDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const futurePurchaseExtraIncomeSchema = z.object({
  id: z.string().trim().min(1, "Identificador da entrada extra é obrigatório."),
  descricao: z.string().trim().max(220).default(""),
  valor: nonNegativeNumber,
  data: fullDateSchema,
  recorrente: z.boolean(),
});

export const futurePurchaseBreakdownItemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(220),
  subtitle: nullableTrimmedString,
  source: z.string().trim().min(1).max(80),
  amount: nonNegativeNumber,
  impactAmount: nonNegativeNumber,
  date: fullDateSchema,
  includedInInvoice: z.boolean().optional().default(false),
});

export const futurePurchaseHighlightSchema = z.object({
  label: z.string().trim().min(1).max(220),
  amount: nonNegativeNumber,
  source: z.string().trim().min(1).max(80),
  subtitle: nullableTrimmedString,
});

export const futurePurchaseTimelineSnapshotSchema = z.object({
  monthReference: monthReferenceSchema,
  label: z.string().trim().min(1).max(120),
  startingBalance: z.number().finite(),
  actualIncome: nonNegativeNumber,
  simulatedExtraIncome: nonNegativeNumber,
  actualExpenses: nonNegativeNumber,
  actualNonCardExpenses: nonNegativeNumber,
  actualCardExpenses: nonNegativeNumber,
  simulatedInstallment: nonNegativeNumber,
  endingBalance: z.number().finite(),
  belowZero: z.boolean(),
  belowReserve: z.boolean(),
  actualIncomeBreakdown: z.array(futurePurchaseBreakdownItemSchema).default([]),
  actualExpenseBreakdown: z.array(futurePurchaseBreakdownItemSchema).default([]),
  extraIncomeEntries: z.array(futurePurchaseExtraIncomeSchema).default([]),
  heaviestItems: z.array(futurePurchaseHighlightSchema).default([]),
});

export const futurePurchaseSimulationUpsertBody = z.object({
  nome: z.string().trim().min(1, "Nome da simulação é obrigatório.").max(220),
  purchaseName: nullableTrimmedString,
  totalAmount: nonNegativeNumber,
  installmentCount: positiveInteger,
  cardId: nullableTrimmedString,
  firstInstallmentMonth: monthReferenceSchema,
  minimumReserve: nonNegativeNumber,
  includeLiquidAssets: z.boolean().optional().default(true),
  includePersonalDebts: z.boolean().optional().default(true),
  includeCardCommitments: z.boolean().optional().default(true),
  includeExpectedReceivables: z.boolean().optional().default(false),
  includePersonalReceivables: z.boolean().optional().default(true),
  includeCardReceivables: z.boolean().optional().default(true),
  selectedReceivablePersonIds: z.array(z.string().trim().min(1).max(120)).max(200).optional().default([]),
  extraIncomes: z.array(futurePurchaseExtraIncomeSchema).default([]),
  resultStatus: z.union([futurePurchaseSimulationStatusSchema, z.null(), z.undefined()]).transform((value) => value ?? null),
  worstMonth: nullableTrimmedString,
  lowestBalance: nullableNumber,
  safePurchaseAmount: nullableNumber,
  recommendedInstallments: nullablePositiveInteger,
  monthlyTimelineSnapshot: z.array(futurePurchaseTimelineSnapshotSchema).default([]),
});

export type FuturePurchaseSimulationUpsertBodyInput = z.infer<typeof futurePurchaseSimulationUpsertBody>;
