import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, index, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email"),
  password: text("password").notNull(),
  publicCode: text("public_code"),
  nomeCompleto: text("nome_completo"),
  fullNameVisibility: text("full_name_visibility").notNull().default("private"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialUsedAt: timestamp("trial_used_at"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
}, (table) => ({
  usersResetTokenIdx: index("idx_users_reset_token").on(table.resetToken),
}));

export const insertUserSchema = createInsertSchema(users).pick({ username: true, email: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const pessoas = pgTable("pessoas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  telefone: text("telefone"),
  observacao: text("observacao"),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  pessoasUserIdIdx: index("idx_pessoas_user_id").on(table.userId),
  pessoasUserNomeIdx: index("idx_pessoas_user_nome").on(table.userId, table.nome),
  pessoasUserDeletedAtIdx: index("idx_pessoas_user_deleted_at").on(table.userId, table.deletedAt),
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
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  dividasUserIdIdx: index("idx_dividas_user_id").on(table.userId),
  dividasPessoaIdIdx: index("idx_dividas_pessoa_id").on(table.pessoaId),
  dividasStatusIdx: index("idx_dividas_status").on(table.status),
  dividasVencimentoIdx: index("idx_dividas_data_vencimento").on(table.dataVencimento),
  dividasUserDeletedAtIdx: index("idx_dividas_user_deleted_at").on(table.userId, table.deletedAt),
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
  reembolsoModo: text("reembolso_modo"),
  reembolsoValorTotal: decimal("reembolso_valor_total", { precision: 12, scale: 2 }),
  reembolsoPercentual: decimal("reembolso_percentual", { precision: 7, scale: 4 }),
  iconeId: text("icone_id"),
}, (table) => ({
  comprasUserIdIdx: index("idx_compras_cartao_user_id").on(table.userId),
  comprasCartaoIdIdx: index("idx_compras_cartao_cartao_id").on(table.cartaoId),
  comprasPessoaIdIdx: index("idx_compras_cartao_pessoa_id").on(table.pessoaId),
  comprasDataIdx: index("idx_compras_cartao_data_compra").on(table.dataCompra),
  comprasStatusPessoaIdx: index("idx_compras_cartao_status_pessoa").on(table.statusPessoa),
}));

export const insertCompraCartaoSchema = createInsertSchema(comprasCartao).omit({ id: true });
export type InsertCompraCartao = z.infer<typeof insertCompraCartaoSchema>;
type CompraCartaoBase = typeof comprasCartao.$inferSelect;
export type CompraCartao = Omit<CompraCartaoBase, "reembolsoModo" | "reembolsoValorTotal" | "reembolsoPercentual"> & {
  reembolsoModo?: "total" | "metade" | "valor_custom" | "percentual_custom" | null;
  reembolsoValorTotal?: string | null;
  reembolsoPercentual?: string | null;
};

export const compraAliases = pgTable("compra_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  compraCartaoId: varchar("compra_cartao_id").notNull().references(() => comprasCartao.id, { onDelete: "cascade" }),
  cartaoId: varchar("cartao_id").references(() => cartoes.id, { onDelete: "set null" }),
  nomeOriginal: text("nome_original"),
  nomeImportado: text("nome_importado").notNull(),
  nomeNormalizado: text("nome_normalizado").notNull(),
  issuer: text("issuer"),
  parserUsed: text("parser_used"),
  cardLast4: varchar("card_last4", { length: 4 }),
  valorParcela: decimal("valor_parcela", { precision: 12, scale: 2 }),
  totalParcelas: integer("total_parcelas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  compraAliasesUserIdIdx: index("idx_compra_aliases_user_id").on(table.userId),
  compraAliasesCompraIdIdx: index("idx_compra_aliases_compra_cartao_id").on(table.compraCartaoId),
  compraAliasesCartaoIdIdx: index("idx_compra_aliases_cartao_id").on(table.cartaoId),
  compraAliasesNomeNormalizadoIdx: index("idx_compra_aliases_nome_normalizado").on(table.nomeNormalizado),
  compraAliasesIssuerIdx: index("idx_compra_aliases_issuer").on(table.issuer),
  compraAliasesCreatedAtIdx: index("idx_compra_aliases_created_at").on(table.createdAt),
}));

export const insertCompraAliasSchema = createInsertSchema(compraAliases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompraAlias = z.infer<typeof insertCompraAliasSchema>;
export type CompraAlias = typeof compraAliases.$inferSelect;

export const iconMatchRules = pgTable("icon_match_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  iconId: text("icon_id").notNull(),
  normalizedTerm: text("normalized_term").notNull(),
  originalTerm: text("original_term").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  iconMatchRulesUserIdIdx: index("idx_icon_match_rules_user_id").on(table.userId),
  iconMatchRulesNormalizedTermIdx: index("idx_icon_match_rules_normalized_term").on(table.normalizedTerm),
  iconMatchRulesCreatedAtIdx: index("idx_icon_match_rules_created_at").on(table.createdAt),
  iconMatchRulesUpdatedAtIdx: index("idx_icon_match_rules_updated_at").on(table.updatedAt),
}));

export const insertIconMatchRuleSchema = createInsertSchema(iconMatchRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIconMatchRule = z.infer<typeof insertIconMatchRuleSchema>;
export type IconMatchRule = typeof iconMatchRules.$inferSelect;

export const userIconLibrary = pgTable("user_icon_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull().default("upload"),
  officialIconId: varchar("official_icon_id"),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  storagePath: text("storage_path"),
  category: text("category"),
  tags: jsonb("tags"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIconLibraryUserIdIdx: index("idx_user_icon_library_user_id").on(table.userId),
  userIconLibrarySourceTypeIdx: index("idx_user_icon_library_source_type").on(table.sourceType),
  userIconLibraryOfficialIconIdIdx: index("idx_user_icon_library_official_icon_id").on(table.officialIconId),
  userIconLibraryCreatedAtIdx: index("idx_user_icon_library_created_at").on(table.createdAt),
  userIconLibraryUpdatedAtIdx: index("idx_user_icon_library_updated_at").on(table.updatedAt),
}));

export const insertUserIconLibrarySchema = createInsertSchema(userIconLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserIconLibrary = z.infer<typeof insertUserIconLibrarySchema>;
export type UserIconLibraryItem = typeof userIconLibrary.$inferSelect;

export const officialIconPacks = pgTable("official_icon_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publicCode: text("public_code"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  coverImageUrl: text("cover_image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  officialIconPacksActiveIdx: index("idx_official_icon_packs_is_active").on(table.isActive),
  officialIconPacksCreatedAtIdx: index("idx_official_icon_packs_created_at").on(table.createdAt),
}));

export const insertOfficialIconPackSchema = createInsertSchema(officialIconPacks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOfficialIconPack = z.infer<typeof insertOfficialIconPackSchema>;
export type OfficialIconPack = typeof officialIconPacks.$inferSelect;

export const officialIconLibrary = pgTable("official_icon_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  iconKey: text("icon_key").notNull(),
  packItemPublicCode: text("pack_item_public_code"),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  storagePath: text("storage_path"),
  category: text("category"),
  tags: jsonb("tags"),
  aliases: jsonb("aliases"),
  packId: varchar("pack_id").references(() => officialIconPacks.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  officialIconLibraryIconKeyIdx: index("idx_official_icon_library_icon_key").on(table.iconKey),
  officialIconLibraryPackIdIdx: index("idx_official_icon_library_pack_id").on(table.packId),
  officialIconLibraryIsActiveIdx: index("idx_official_icon_library_is_active").on(table.isActive),
  officialIconLibraryCreatedAtIdx: index("idx_official_icon_library_created_at").on(table.createdAt),
}));

export const insertOfficialIconLibrarySchema = createInsertSchema(officialIconLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOfficialIconLibrary = z.infer<typeof insertOfficialIconLibrarySchema>;
export type OfficialIconLibraryItem = typeof officialIconLibrary.$inferSelect;

export const servicos = pgTable("servicos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  categoria: text("categoria").notNull(),
  valorMensal: decimal("valor_mensal", { precision: 12, scale: 2 }).notNull(),
  periodicidadeCobranca: text("periodicidade_cobranca"),
  valorCobranca: decimal("valor_cobranca", { precision: 12, scale: 2 }),
  dataCobranca: integer("data_cobranca"),
  mesCobranca: integer("mes_cobranca"),
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
  comprovantePath: text("comprovante_path"),
  comprovanteNome: text("comprovante_nome"),
  comprovanteMimeType: text("comprovante_mime_type"),
  comprovanteTamanho: integer("comprovante_tamanho"),
  comprovanteEnviadoEm: timestamp("comprovante_enviado_em"),
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

export const cartaoFaturaPagamentos = pgTable("cartao_fatura_pagamentos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cartaoId: varchar("cartao_id").notNull().references(() => cartoes.id, { onDelete: "cascade" }),
  competenciaMes: integer("competencia_mes").notNull(),
  competenciaAno: integer("competencia_ano").notNull(),
  valorPago: decimal("valor_pago", { precision: 12, scale: 2 }).notNull(),
  dataPagamento: date("data_pagamento", { mode: "string" }).notNull(),
  observacao: text("observacao"),
  tipoPagamento: text("tipo_pagamento").notNull().default("parcial"),
  modoAlocacao: text("modo_alocacao").notNull().default("ordem_fatura"),
  considerarNoSaldoCompetencia: boolean("considerar_no_saldo_competencia").notNull().default(true),
  conciliadoEm: timestamp("conciliado_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  cartaoFaturaPagamentosUserIdIdx: index("idx_cartao_fatura_pagamentos_user_id").on(table.userId),
  cartaoFaturaPagamentosCartaoIdIdx: index("idx_cartao_fatura_pagamentos_cartao_id").on(table.cartaoId),
  cartaoFaturaPagamentosCompetenciaIdx: index("idx_cartao_fatura_pagamentos_competencia").on(
    table.userId,
    table.cartaoId,
    table.competenciaAno,
    table.competenciaMes,
  ),
  cartaoFaturaPagamentosDataPagamentoIdx: index("idx_cartao_fatura_pagamentos_data_pagamento").on(table.dataPagamento),
  cartaoFaturaPagamentosCreatedAtIdx: index("idx_cartao_fatura_pagamentos_created_at").on(table.createdAt),
}));

export const insertCartaoFaturaPagamentoSchema = createInsertSchema(cartaoFaturaPagamentos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCartaoFaturaPagamento = z.infer<typeof insertCartaoFaturaPagamentoSchema>;
export type CartaoFaturaPagamento = typeof cartaoFaturaPagamentos.$inferSelect;

export const cartaoFaturaPagamentoAlocacoes = pgTable("cartao_fatura_pagamento_alocacoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pagamentoId: varchar("pagamento_id").notNull().references(() => cartaoFaturaPagamentos.id, { onDelete: "cascade" }),
  parcelaCompraId: varchar("parcela_compra_id").notNull().references(() => parcelasCompra.id, { onDelete: "cascade" }),
  valorAplicado: decimal("valor_aplicado", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  cartaoFaturaPagamentoAlocacoesPagamentoIdIdx: index("idx_cartao_fatura_pagamento_alocacoes_pagamento_id").on(table.pagamentoId),
  cartaoFaturaPagamentoAlocacoesParcelaCompraIdIdx: index("idx_cartao_fatura_pagamento_alocacoes_parcela_compra_id").on(table.parcelaCompraId),
  cartaoFaturaPagamentoAlocacoesCreatedAtIdx: index("idx_cartao_fatura_pagamento_alocacoes_created_at").on(table.createdAt),
}));

export const insertCartaoFaturaPagamentoAlocacaoSchema = createInsertSchema(cartaoFaturaPagamentoAlocacoes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCartaoFaturaPagamentoAlocacao = z.infer<typeof insertCartaoFaturaPagamentoAlocacaoSchema>;
export type CartaoFaturaPagamentoAlocacao = typeof cartaoFaturaPagamentoAlocacoes.$inferSelect;

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

export const userCloudBackups = pgTable("user_cloud_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  backupType: text("backup_type").notNull().default("manual"),
  status: text("status").notNull().default("completed"),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userCloudBackupsUserIdIdx: index("idx_user_cloud_backups_user_id").on(table.userId),
  userCloudBackupsCreatedAtIdx: index("idx_user_cloud_backups_created_at").on(table.createdAt),
}));

export const insertUserCloudBackupSchema = createInsertSchema(userCloudBackups).omit({
  id: true,
  createdAt: true,
});
export type InsertUserCloudBackup = z.infer<typeof insertUserCloudBackupSchema>;
export type UserCloudBackup = typeof userCloudBackups.$inferSelect;

export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerSubscriptionId: text("provider_subscription_id"),
  providerPlanId: text("provider_plan_id"),
  externalReference: text("external_reference"),
  status: text("status").notNull().default("pending"),
  providerStatus: text("provider_status"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("BRL"),
  startedAt: timestamp("started_at"),
  currentPeriodEnd: timestamp("current_period_end"),
  canceledAt: timestamp("canceled_at"),
  lastWebhookAt: timestamp("last_webhook_at"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  rawPayload: jsonb("raw_payload"),
}, (table) => ({
  userSubscriptionsUserIdIdx: index("idx_user_subscriptions_user_id").on(table.userId),
  userSubscriptionsProviderIdx: index("idx_user_subscriptions_provider").on(table.provider),
  userSubscriptionsStatusIdx: index("idx_user_subscriptions_status").on(table.status),
  userSubscriptionsExternalReferenceIdx: index("idx_user_subscriptions_external_reference").on(table.externalReference),
  userSubscriptionsUpdatedAtIdx: index("idx_user_subscriptions_updated_at").on(table.updatedAt),
}));

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  topic: text("topic"),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at"),
  status: text("status").notNull().default("received"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  billingWebhookEventsProviderIdx: index("idx_billing_webhook_events_provider").on(table.provider),
  billingWebhookEventsProviderEventIdIdx: index("idx_billing_webhook_events_provider_event_id").on(table.providerEventId),
  billingWebhookEventsStatusIdx: index("idx_billing_webhook_events_status").on(table.status),
  billingWebhookEventsCreatedAtIdx: index("idx_billing_webhook_events_created_at").on(table.createdAt),
}));

export const insertBillingWebhookEventSchema = createInsertSchema(billingWebhookEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertBillingWebhookEvent = z.infer<typeof insertBillingWebhookEventSchema>;
export type BillingWebhookEvent = typeof billingWebhookEvents.$inferSelect;
