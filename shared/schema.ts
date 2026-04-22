import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, index, date } from "drizzle-orm/pg-core";
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
  dataVencimento: date("data_vencimento", { mode: "string" }),
  status: text("status").notNull().default("pendente"),
  dataPagamento: date("data_pagamento", { mode: "string" }),
  formaPagamento: text("forma_pagamento"),
  observacaoPagamento: text("observacao_pagamento"),
  comprovantePath: text("comprovante_path"),
  comprovanteNome: text("comprovante_nome"),
  comprovanteMimeType: text("comprovante_mime_type"),
  comprovanteTamanho: integer("comprovante_tamanho"),
  comprovanteEnviadoEm: timestamp("comprovante_enviado_em"),
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
  dataVencimento: date("data_vencimento", { mode: "string" }).notNull(),
  status: text("status").notNull().default("pendente"),
  dataPagamento: date("data_pagamento", { mode: "string" }),
  formaPagamento: text("forma_pagamento"),
  observacaoPagamento: text("observacao_pagamento"),
  comprovantePath: text("comprovante_path"),
  comprovanteNome: text("comprovante_nome"),
  comprovanteMimeType: text("comprovante_mime_type"),
  comprovanteTamanho: integer("comprovante_tamanho"),
  comprovanteEnviadoEm: timestamp("comprovante_enviado_em"),
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
  dataCompra: date("data_compra", { mode: "string" }).notNull(),
  pessoaId: varchar("pessoa_id").references(() => pessoas.id, { onDelete: "set null" }),
  statusPessoa: varchar("status_pessoa"),
  dataPagamentoPessoa: date("data_pagamento_pessoa", { mode: "string" }),
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
  // Vínculo opcional para rastrear que o serviço está associado a uma compra no cartão.
  compraCartaoId: varchar("compra_cartao_id").references(() => comprasCartao.id, { onDelete: "set null" }),
  status: text("status").notNull().default("ativo"),
  iconeId: text("icone_id"),
}, (table) => ({
  servicosUserIdIdx: index("idx_servicos_user_id").on(table.userId),
  servicosCompraCartaoIdIdx: index("idx_servicos_compra_cartao_id").on(table.compraCartaoId),
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
  dataPagamento: date("data_pagamento", { mode: "string" }),
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
  dataVencimento: date("data_vencimento", { mode: "string" }),
  statusCartao: text("status_cartao").notNull().default("pendente"),
  dataPagamentoCartao: date("data_pagamento_cartao", { mode: "string" }),
  statusPessoa: text("status_pessoa"),
  dataPagamentoPessoa: date("data_pagamento_pessoa", { mode: "string" }),
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

export const pessoaSaldoMovimentacoes = pgTable("pessoa_saldo_movimentacoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pessoaId: varchar("pessoa_id").notNull().references(() => pessoas.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  data: date("data", { mode: "string" }).notNull(),
  origem: text("origem").notNull().default("manual"),
  categoria: text("categoria"),
  observacao: text("observacao"),
  comprovanteReferencia: text("comprovante_referencia"),
  dividaId: varchar("divida_id").references(() => dividas.id, { onDelete: "set null" }),
  compraCartaoId: varchar("compra_cartao_id").references(() => comprasCartao.id, { onDelete: "set null" }),
  parcelaCompraId: varchar("parcela_compra_id").references(() => parcelasCompra.id, { onDelete: "set null" }),
  servicoPessoaId: varchar("servico_pessoa_id").references(() => servicoPessoas.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pessoaSaldoMovimentacoesUserIdIdx: index("idx_pessoa_saldo_mov_user_id").on(table.userId),
  pessoaSaldoMovimentacoesPessoaIdIdx: index("idx_pessoa_saldo_mov_pessoa_id").on(table.pessoaId),
  pessoaSaldoMovimentacoesTipoIdx: index("idx_pessoa_saldo_mov_tipo").on(table.tipo),
  pessoaSaldoMovimentacoesDataIdx: index("idx_pessoa_saldo_mov_data").on(table.data),
  pessoaSaldoMovimentacoesDividaIdIdx: index("idx_pessoa_saldo_mov_divida_id").on(table.dividaId),
  pessoaSaldoMovimentacoesCompraCartaoIdIdx: index("idx_pessoa_saldo_mov_compra_cartao_id").on(table.compraCartaoId),
  pessoaSaldoMovimentacoesServicoPessoaIdIdx: index("idx_pessoa_saldo_mov_servico_pessoa_id").on(table.servicoPessoaId),
}));

export const insertPessoaSaldoMovimentacaoSchema = createInsertSchema(pessoaSaldoMovimentacoes).omit({
  id: true,
  createdAt: true,
});
export type InsertPessoaSaldoMovimentacao = z.infer<typeof insertPessoaSaldoMovimentacaoSchema>;
export type PessoaSaldoMovimentacao = typeof pessoaSaldoMovimentacoes.$inferSelect;

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

export const importLogs = pgTable("import_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cartaoId: varchar("cartao_id").notNull().references(() => cartoes.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name"),
  status: text("status").notNull().default("previewed"),
  requestPayload: text("request_payload").notNull(),
  previewPayload: text("preview_payload").notNull(),
  confirmedPayload: text("confirmed_payload"),
  createdCompraIds: text("created_compra_ids"),
  rollbackPayload: text("rollback_payload"),
  totalItems: integer("total_items").notNull().default(0),
  importedItems: integer("imported_items").notNull().default(0),
  skippedItems: integer("skipped_items").notNull().default(0),
  averageConfidence: decimal("average_confidence", { precision: 5, scale: 2 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
  rolledBackAt: timestamp("rolled_back_at"),
}, (table) => ({
  importLogsUserIdIdx: index("idx_import_logs_user_id").on(table.userId),
  importLogsCartaoIdIdx: index("idx_import_logs_cartao_id").on(table.cartaoId),
  importLogsStatusIdx: index("idx_import_logs_status").on(table.status),
  importLogsCreatedAtIdx: index("idx_import_logs_created_at").on(table.createdAt),
}));

export const insertImportLogSchema = createInsertSchema(importLogs).omit({ id: true });
export type InsertImportLog = z.infer<typeof insertImportLogSchema>;
export type ImportLog = typeof importLogs.$inferSelect;
