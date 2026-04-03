import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  nomeCompleto: text("nome_completo"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
}, (table) => ({
  usersResetTokenIdx: index("idx_users_reset_token").on(table.resetToken),
}));

export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const pessoas = pgTable("pessoas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  telefone: text("telefone"),
  observacao: text("observacao"),
}, (table) => ({
  pessoasUserIdIdx: index("idx_pessoas_user_id").on(table.userId),
  pessoasUserNomeIdx: index("idx_pessoas_user_nome").on(table.userId, table.nome),
}));

export const insertPessoaSchema = createInsertSchema(pessoas).omit({ id: true });
export type InsertPessoa = z.infer<typeof insertPessoaSchema>;
export type Pessoa = typeof pessoas.$inferSelect;

export const dividas = pgTable("dividas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pessoaId: varchar("pessoa_id").notNull().references(() => pessoas.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  dataVencimento: text("data_vencimento"),
  status: text("status").notNull().default("pendente"),
  dataPagamento: text("data_pagamento"),
  formaPagamento: text("forma_pagamento"),
  descricao: text("descricao"),
  totalParcelas: integer("total_parcelas"),
  valorTotal: decimal("valor_total", { precision: 12, scale: 2 }),
}, (table) => ({
  dividasUserIdIdx: index("idx_dividas_user_id").on(table.userId),
  dividasPessoaIdIdx: index("idx_dividas_pessoa_id").on(table.pessoaId),
  dividasStatusIdx: index("idx_dividas_status").on(table.status),
  dividasVencimentoIdx: index("idx_dividas_data_vencimento").on(table.dataVencimento),
}));

export const insertDividaSchema = createInsertSchema(dividas).omit({ id: true });
export type InsertDivida = z.infer<typeof insertDividaSchema>;
export type Divida = typeof dividas.$inferSelect;

export const parcelas = pgTable("parcelas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dividaId: varchar("divida_id").notNull().references(() => dividas.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  dataVencimento: text("data_vencimento").notNull(),
  status: text("status").notNull().default("pendente"),
  dataPagamento: text("data_pagamento"),
  formaPagamento: text("forma_pagamento"),
}, (table) => ({
  parcelasUserIdIdx: index("idx_parcelas_user_id").on(table.userId),
  parcelasDividaIdIdx: index("idx_parcelas_divida_id").on(table.dividaId),
  parcelasStatusIdx: index("idx_parcelas_status").on(table.status),
  parcelasVencimentoIdx: index("idx_parcelas_data_vencimento").on(table.dataVencimento),
}));

export const insertParcelaSchema = createInsertSchema(parcelas).omit({ id: true });
export type InsertParcela = z.infer<typeof insertParcelaSchema>;
export type Parcela = typeof parcelas.$inferSelect;

export const cartoes = pgTable("cartoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  limite: decimal("limite", { precision: 12, scale: 2 }).notNull(),
  melhorDiaCompra: integer("melhor_dia_compra").notNull(),
  diaVencimento: integer("dia_vencimento").notNull(),
  iconeId: text("icone_id"),
}, (table) => ({
  cartoesUserIdIdx: index("idx_cartoes_user_id").on(table.userId),
  cartoesUserNomeIdx: index("idx_cartoes_user_nome").on(table.userId, table.nome),
}));

export const insertCartaoSchema = createInsertSchema(cartoes).omit({ id: true });
export type InsertCartao = z.infer<typeof insertCartaoSchema>;
export type Cartao = typeof cartoes.$inferSelect;

export const comprasCartao = pgTable("compras_cartao", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cartaoId: varchar("cartao_id").notNull().references(() => cartoes.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  valorTotal: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
  parcelas: integer("parcelas").notNull().default(1),
  parcelaAtual: integer("parcela_atual").notNull().default(1),
  valorParcela: decimal("valor_parcela", { precision: 12, scale: 2 }).notNull(),
  dataCompra: text("data_compra").notNull(),
  pessoaId: varchar("pessoa_id").references(() => pessoas.id, { onDelete: "set null" }),
  statusPessoa: varchar("status_pessoa"),
  dataPagamentoPessoa: text("data_pagamento_pessoa"),
}, (table) => ({
  comprasUserIdIdx: index("idx_compras_cartao_user_id").on(table.userId),
  comprasCartaoIdIdx: index("idx_compras_cartao_cartao_id").on(table.cartaoId),
  comprasPessoaIdIdx: index("idx_compras_cartao_pessoa_id").on(table.pessoaId),
  comprasDataIdx: index("idx_compras_cartao_data_compra").on(table.dataCompra),
  comprasStatusPessoaIdx: index("idx_compras_cartao_status_pessoa").on(table.statusPessoa),
}));

export const insertCompraCartaoSchema = createInsertSchema(comprasCartao).omit({ id: true });
export type InsertCompraCartao = z.infer<typeof insertCompraCartaoSchema>;
export type CompraCartao = typeof comprasCartao.$inferSelect;

export const servicos = pgTable("servicos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  categoria: text("categoria").notNull(),
  valorMensal: decimal("valor_mensal", { precision: 12, scale: 2 }).notNull(),
  dataCobranca: integer("data_cobranca").notNull(),
  formaPagamento: text("forma_pagamento").notNull(),
  status: text("status").notNull().default("ativo"),
  iconeId: text("icone_id"),
}, (table) => ({
  servicosUserIdIdx: index("idx_servicos_user_id").on(table.userId),
  servicosStatusIdx: index("idx_servicos_status").on(table.status),
  servicosCategoriaIdx: index("idx_servicos_categoria").on(table.categoria),
}));

export const insertServicoSchema = createInsertSchema(servicos).omit({ id: true });
export type InsertServico = z.infer<typeof insertServicoSchema>;
export type Servico = typeof servicos.$inferSelect;

export const servicoPessoas = pgTable("servico_pessoas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  servicoId: varchar("servico_id").notNull().references(() => servicos.id, { onDelete: "cascade" }),
  pessoaId: varchar("pessoa_id").notNull().references(() => pessoas.id, { onDelete: "cascade" }),
  valorDevido: decimal("valor_devido", { precision: 12, scale: 2 }).notNull(),
}, (table) => ({
  servicoPessoasUserIdIdx: index("idx_servico_pessoas_user_id").on(table.userId),
  servicoPessoasServicoIdIdx: index("idx_servico_pessoas_servico_id").on(table.servicoId),
  servicoPessoasPessoaIdIdx: index("idx_servico_pessoas_pessoa_id").on(table.pessoaId),
}));

export const insertServicoPessoaSchema = createInsertSchema(servicoPessoas).omit({ id: true });
export type InsertServicoPessoa = z.infer<typeof insertServicoPessoaSchema>;
export type ServicoPessoa = typeof servicoPessoas.$inferSelect;

export const servicoPagamentos = pgTable("servico_pagamentos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  servicoPessoaId: varchar("servico_pessoa_id").notNull().references(() => servicoPessoas.id, { onDelete: "cascade" }),
  mes: text("mes").notNull(),
  status: text("status").notNull().default("pago"),
  dataPagamento: text("data_pagamento"),
}, (table) => ({
  servicoPagamentosUserIdIdx: index("idx_servico_pagamentos_user_id").on(table.userId),
  servicoPagamentosSpIdx: index("idx_servico_pagamentos_sp_id").on(table.servicoPessoaId),
  servicoPagamentosMesIdx: index("idx_servico_pagamentos_mes").on(table.mes),
}));

export const insertServicoPagamentoSchema = createInsertSchema(servicoPagamentos).omit({ id: true });
export type InsertServicoPagamento = z.infer<typeof insertServicoPagamentoSchema>;
export type ServicoPagamento = typeof servicoPagamentos.$inferSelect;

export const parcelasCompra = pgTable("parcelas_compra", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  compraCartaoId: varchar("compra_cartao_id").notNull().references(() => comprasCartao.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  dataVencimento: text("data_vencimento"),
  statusCartao: text("status_cartao").notNull().default("pendente"),
  dataPagamentoCartao: text("data_pagamento_cartao"),
  statusPessoa: text("status_pessoa"),
  dataPagamentoPessoa: text("data_pagamento_pessoa"),
}, (table) => ({
  parcelasCompraUserIdIdx: index("idx_parcelas_compra_user_id").on(table.userId),
  parcelasCompraCompraIdIdx: index("idx_parcelas_compra_compra_id").on(table.compraCartaoId),
  parcelasCompraNumeroIdx: index("idx_parcelas_compra_numero").on(table.numero),
  parcelasCompraStatusCartaoIdx: index("idx_parcelas_compra_status_cartao").on(table.statusCartao),
  parcelasCompraStatusPessoaIdx: index("idx_parcelas_compra_status_pessoa").on(table.statusPessoa),
}));

export const insertParcelaCompraSchema = createInsertSchema(parcelasCompra).omit({ id: true });
export type InsertParcelaCompra = z.infer<typeof insertParcelaCompraSchema>;
export type ParcelaCompra = typeof parcelasCompra.$inferSelect;

export const rendas = pgTable("rendas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("fixo"),
  descricao: text("descricao").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  diaRecebimento: integer("dia_recebimento").notNull().default(1),
  ativo: boolean("ativo").notNull().default(true),
}, (table) => ({
  rendasUserIdIdx: index("idx_rendas_user_id").on(table.userId),
  rendasAtivoIdx: index("idx_rendas_ativo").on(table.ativo),
}));

export const insertRendaSchema = createInsertSchema(rendas).omit({ id: true });
export type InsertRenda = z.infer<typeof insertRendaSchema>;
export type Renda = typeof rendas.$inferSelect;

export const patrimonios = pgTable("patrimonios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("conta_bancaria"),
  valorAtual: decimal("valor_atual", { precision: 12, scale: 2 }).notNull().default("0"),
  iconeId: text("icone_id"),
}, (table) => ({
  patrimoniosUserIdIdx: index("idx_patrimonios_user_id").on(table.userId),
  patrimoniosTipoIdx: index("idx_patrimonios_tipo").on(table.tipo),
}));

export const insertPatrimonioSchema = createInsertSchema(patrimonios).omit({ id: true });
export type InsertPatrimonio = z.infer<typeof insertPatrimonioSchema>;
export type Patrimonio = typeof patrimonios.$inferSelect;

export const metas = pgTable("metas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  valorAlvo: decimal("valor_alvo", { precision: 12, scale: 2 }).notNull(),
  valorAtual: decimal("valor_atual", { precision: 12, scale: 2 }).notNull().default("0"),
  prazo: text("prazo").notNull(),
  status: text("status").notNull().default("ativa"),
}, (table) => ({
  metasUserIdIdx: index("idx_metas_user_id").on(table.userId),
  metasStatusIdx: index("idx_metas_status").on(table.status),
  metasPrazoIdx: index("idx_metas_prazo").on(table.prazo),
}));

export const insertMetaSchema = createInsertSchema(metas).omit({ id: true });
export type InsertMeta = z.infer<typeof insertMetaSchema>;
export type Meta = typeof metas.$inferSelect;
