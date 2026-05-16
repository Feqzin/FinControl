import { z } from "zod";

export const compraAliasIssuerSchema = z.enum([
  "nubank",
  "itau",
  "mercado_pago",
  "c6",
  "santander",
  "bradesco",
  "banco_do_brasil",
  "unknown",
  "generic",
]);

const nullableTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

export const compraAliasCreateBody = z.object({
  compraCartaoId: z.string().trim().min(1, "compraCartaoId obrigatorio."),
  cartaoId: nullableTrimmedString,
  nomeOriginal: nullableTrimmedString,
  nomeImportado: z.string().trim().min(1, "nomeImportado obrigatorio.").max(220),
  issuer: z.union([compraAliasIssuerSchema, z.null(), z.undefined()]).transform((value) => value ?? null),
  parserUsed: nullableTrimmedString,
  cardLast4: z.union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value == null || /^\d{4}$/.test(value), "cardLast4 deve conter 4 dígitos."),
  valorParcela: z.union([z.number(), z.null(), z.undefined()])
    .transform((value) => (value == null ? null : value))
    .refine((value) => value == null || (Number.isFinite(value) && value > 0), "valorParcela deve ser numérico e positivo."),
  totalParcelas: z.union([z.number(), z.null(), z.undefined()])
    .transform((value) => (value == null ? null : value))
    .refine((value) => value == null || (Number.isInteger(value) && value > 0), "totalParcelas deve ser inteiro positivo."),
});

export type CompraAliasCreateBodyInput = z.infer<typeof compraAliasCreateBody>;

