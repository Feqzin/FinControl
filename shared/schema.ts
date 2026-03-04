import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const pessoas = pgTable("pessoas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  telefone: text("telefone"),
  observacao: text("observacao"),
});

export const insertPessoaSchema = createInsertSchema(pessoas).omit({ id: true });
export type InsertPessoa = z.infer<typeof insertPessoaSchema>;
export type Pessoa = typeof pessoas.$inferSelect;

export const dividas = pgTable("dividas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  pessoaId: varchar("pessoa_id").notNull(),
  tipo: text("tipo").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  dataVencimento: text("data_vencimento").notNull(),
  status: text("status").notNull().default("pendente"),
  dataPagamento: text("data_pagamento"),
  formaPagamento: text("forma_pagamento"),
  descricao: text("descricao"),
});

export const insertDividaSchema = createInsertSchema(dividas).omit({ id: true });
export type InsertDivida = z.infer<typeof insertDividaSchema>;
export type Divida = typeof dividas.$inferSelect;

export const cartoes = pgTable("cartoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  nome: text("nome").notNull(),
  limite: decimal("limite", { precision: 12, scale: 2 }).notNull(),
  melhorDiaCompra: integer("melhor_dia_compra").notNull(),
  diaVencimento: integer("dia_vencimento").notNull(),
});

export const insertCartaoSchema = createInsertSchema(cartoes).omit({ id: true });
export type InsertCartao = z.infer<typeof insertCartaoSchema>;
export type Cartao = typeof cartoes.$inferSelect;

export const comprasCartao = pgTable("compras_cartao", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  cartaoId: varchar("cartao_id").notNull(),
  descricao: text("descricao").notNull(),
  valorTotal: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
  parcelas: integer("parcelas").notNull().default(1),
  parcelaAtual: integer("parcela_atual").notNull().default(1),
  valorParcela: decimal("valor_parcela", { precision: 12, scale: 2 }).notNull(),
  dataCompra: text("data_compra").notNull(),
});

export const insertCompraCartaoSchema = createInsertSchema(comprasCartao).omit({ id: true });
export type InsertCompraCartao = z.infer<typeof insertCompraCartaoSchema>;
export type CompraCartao = typeof comprasCartao.$inferSelect;

export const servicos = pgTable("servicos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  nome: text("nome").notNull(),
  categoria: text("categoria").notNull(),
  valorMensal: decimal("valor_mensal", { precision: 12, scale: 2 }).notNull(),
  dataCobranca: integer("data_cobranca").notNull(),
  formaPagamento: text("forma_pagamento").notNull(),
  status: text("status").notNull().default("ativo"),
});

export const insertServicoSchema = createInsertSchema(servicos).omit({ id: true });
export type InsertServico = z.infer<typeof insertServicoSchema>;
export type Servico = typeof servicos.$inferSelect;
