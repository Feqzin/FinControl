import { z } from "zod";
import { isValidCnpj } from "@shared/das-mei";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida.");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const activitySchema = z.enum(["comercio", "servico", "comercio_servico"]);

const overrideSchema = z.object({
  principal: z.number().finite().min(0).nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  beneficioInss: z.boolean().optional(),
  officialTotal: z.number().finite().positive().nullable().optional(),
});

const calculationFields = z.object({
  atividade: activitySchema,
  competenciaInicial: monthSchema,
  competenciaFinal: monthSchema,
  dataCalculo: dateSchema,
  overrides: z.record(overrideSchema).default({}),
});

export const cnpjDasPreviewBody = calculationFields;

export const cnpjDasSaveBody = calculationFields.extend({
  cnpj: z.string().trim().refine(isValidCnpj, "CNPJ inválido."),
  nome: z.string().trim().min(2, "Informe o nome do CNPJ.").max(160),
  competenciasSelecionadas: z.array(monthSchema)
    .min(1, "Selecione pelo menos uma competência.")
    .max(60, "Selecione no máximo 60 competências."),
});

export const cnpjDasRecalculateBody = z.object({
  dataCalculo: dateSchema,
});

export type CnpjDasPreviewInput = z.infer<typeof cnpjDasPreviewBody>;
export type CnpjDasSaveInput = z.infer<typeof cnpjDasSaveBody>;
