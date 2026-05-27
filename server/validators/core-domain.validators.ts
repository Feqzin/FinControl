import { z } from "zod";
import { insertPatrimonioSchema, insertRendaSchema } from "@shared/schema";

const nonEmptyUpdateMessage = "Informe ao menos um campo para atualizar";
const moneyField = z.string().or(z.number()).transform(String);
const servicoPeriodicidadeField = z.enum(["mensal", "anual", "semestral", "trimestral", "bimestral", "semanal"]);
const servicoDataCobrancaField = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}, z.coerce.number().int().min(1).max(31).nullable());

export const pessoaBody = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["me_deve", "eu_devo"]),
  telefone: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export const pessoaUpdateBody = pessoaBody.partial();

export const servicoBody = z.object({
  nome: z.string().min(1),
  categoria: z.string().min(1),
  valorMensal: moneyField.optional(),
  valorCobranca: moneyField.optional(),
  periodicidadeCobranca: servicoPeriodicidadeField.optional().default("mensal"),
  dataCobranca: servicoDataCobrancaField,
  formaPagamento: z.string().min(1),
  status: z.string().optional().default("ativo"),
}).refine((data) => data.valorMensal !== undefined || data.valorCobranca !== undefined, {
  message: "Informe o valor da cobranca",
});

export const servicoUpdateBody = z.object({
  nome: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  valorMensal: moneyField.optional(),
  valorCobranca: moneyField.optional(),
  periodicidadeCobranca: servicoPeriodicidadeField.optional(),
  dataCobranca: servicoDataCobrancaField.optional(),
  formaPagamento: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  iconeId: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const servicoPessoaBody = z.object({
  servicoId: z.string().min(1),
  pessoaId: z.string().min(1),
  valorDevido: moneyField,
});

export const servicoPessoaUpdateBody = z.object({
  servicoId: z.string().min(1).optional(),
  pessoaId: z.string().min(1).optional(),
  valorDevido: moneyField.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const servicoPagamentoBody = z.object({
  servicoPessoaId: z.string().min(1),
  mes: z.string().min(7).max(7),
  status: z.string().optional().default("pago"),
  dataPagamento: z.string().optional().nullable(),
});

export const metaBody = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional().nullable(),
  valorAlvo: moneyField,
  valorAtual: moneyField.optional().default("0"),
  prazo: z.string().min(1),
  status: z.string().optional().default("ativa"),
});

export const metaUpdateBody = z.object({
  nome: z.string().min(1).optional(),
  descricao: z.string().optional().nullable(),
  valorAlvo: moneyField.optional(),
  valorAtual: moneyField.optional(),
  prazo: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const rendaCreateBody = insertRendaSchema;

export const rendaUpdateBody = insertRendaSchema
  .omit({ userId: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const patrimonioCreateBody = insertPatrimonioSchema;

export const patrimonioUpdateBody = insertPatrimonioSchema
  .omit({ userId: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export type PessoaBodyInput = z.infer<typeof pessoaBody>;
export type PessoaUpdateBodyInput = z.infer<typeof pessoaUpdateBody>;
export type ServicoBodyInput = z.infer<typeof servicoBody>;
export type ServicoUpdateBodyInput = z.infer<typeof servicoUpdateBody>;
export type ServicoPessoaBodyInput = z.infer<typeof servicoPessoaBody>;
export type ServicoPessoaUpdateBodyInput = z.infer<typeof servicoPessoaUpdateBody>;
export type ServicoPagamentoBodyInput = z.infer<typeof servicoPagamentoBody>;
export type MetaBodyInput = z.infer<typeof metaBody>;
export type MetaUpdateBodyInput = z.infer<typeof metaUpdateBody>;
export type RendaCreateBodyInput = z.infer<typeof rendaCreateBody>;
export type RendaUpdateBodyInput = z.infer<typeof rendaUpdateBody>;
export type PatrimonioCreateBodyInput = z.infer<typeof patrimonioCreateBody>;
export type PatrimonioUpdateBodyInput = z.infer<typeof patrimonioUpdateBody>;
