import { z } from "zod";

const nonEmptyUpdateMessage = "Informe ao menos um campo para atualizar";
const moneyField = z.string().or(z.number()).transform(String);

export const dividaBody = z.object({
  pessoaId: z.string().min(1),
  tipo: z.enum(["receber", "pagar"]),
  valor: z.string().or(z.number()).transform(String),
  dataVencimento: z.string().nullable().optional(),
  status: z.string().optional().default("pendente"),
  dataPagamento: z.string().optional().nullable(),
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
  primeiroVencimento: z.string().min(1),
  descricao: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
});

export const dividaUpdateBody = z.object({
  status: z.string().optional(),
  dataPagamento: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const parcelaUpdateBody = z.object({
  status: z.string().optional(),
  dataPagamento: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  valor: moneyField.optional(),
  dataVencimento: z.string().optional(),
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
  dataCompra: z.string().min(1),
  pessoaId: z.string().optional().nullable(),
});

export const compraUpdateBody = z.object({
  cartaoId: z.string().min(1).optional(),
  descricao: z.string().min(1).optional(),
  valorTotal: moneyField.optional(),
  parcelas: z.coerce.number().int().min(1).optional(),
  parcelaAtual: z.coerce.number().int().min(1).optional(),
  valorParcela: moneyField.optional(),
  dataCompra: z.string().min(1).optional(),
  pessoaId: z.string().min(1).optional().nullable(),
  statusPessoa: z.string().optional().nullable(),
  dataPagamentoPessoa: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const parcelaCompraUpdateBody = z.object({
  numero: z.coerce.number().int().min(1).optional(),
  valor: moneyField.optional(),
  dataVencimento: z.string().optional().nullable(),
  statusCartao: z.string().optional(),
  dataPagamentoCartao: z.string().optional().nullable(),
  statusPessoa: z.string().optional().nullable(),
  dataPagamentoPessoa: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

export const parcelaCompraBulkItemBody = z.object({
  numero: z.coerce.number().int().min(1),
  valor: moneyField,
  dataVencimento: z.string().optional().nullable(),
  statusCartao: z.string().optional().default("pendente"),
  dataPagamentoCartao: z.string().optional().nullable(),
  statusPessoa: z.string().optional().nullable(),
  dataPagamentoPessoa: z.string().optional().nullable(),
}).strict();

export const parcelasCompraBulkBody = z.object({
  compraCartaoId: z.string().min(1),
  parcelas: z.array(parcelaCompraBulkItemBody).max(600),
}).strict();

export type DividaBodyInput = z.infer<typeof dividaBody>;
export type DividaParceladoBodyInput = z.infer<typeof dividaParceladoBody>;
export type DividaUpdateBodyInput = z.infer<typeof dividaUpdateBody>;
export type ParcelaUpdateBodyInput = z.infer<typeof parcelaUpdateBody>;
export type AnteciparParcelasBodyInput = z.infer<typeof anteciparParcelasBody>;
export type CompraBodyInput = z.infer<typeof compraBody>;
export type CompraUpdateBodyInput = z.infer<typeof compraUpdateBody>;
export type ParcelaCompraUpdateBodyInput = z.infer<typeof parcelaCompraUpdateBody>;
export type ParcelasCompraBulkBodyInput = z.infer<typeof parcelasCompraBulkBody>;
