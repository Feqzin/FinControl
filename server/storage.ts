import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, pessoas, dividas, parcelas, cartoes, comprasCartao, servicos,
  servicoPessoas, servicoPagamentos, metas, parcelasCompra, rendas, patrimonios,
  type User, type InsertUser,
  type Pessoa, type InsertPessoa,
  type Divida, type InsertDivida,
  type Parcela, type InsertParcela,
  type Cartao, type InsertCartao,
  type CompraCartao, type InsertCompraCartao,
  type Servico, type InsertServico,
  type ServicoPessoa, type InsertServicoPessoa,
  type ServicoPagamento, type InsertServicoPagamento,
  type Meta, type InsertMeta,
  type ParcelaCompra, type InsertParcelaCompra,
  type Renda, type InsertRenda,
  type Patrimonio, type InsertPatrimonio,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getPessoas(userId: string): Promise<Pessoa[]>;
  getPessoa(id: string, userId: string): Promise<Pessoa | undefined>;
  createPessoa(pessoa: InsertPessoa): Promise<Pessoa>;
  updatePessoa(id: string, userId: string, data: Partial<InsertPessoa>): Promise<Pessoa | undefined>;
  deletePessoa(id: string, userId: string): Promise<boolean>;

  getDividas(userId: string): Promise<Divida[]>;
  getDividasByPessoa(pessoaId: string, userId: string): Promise<Divida[]>;
  getDivida(id: string, userId: string): Promise<Divida | undefined>;
  createDivida(divida: InsertDivida): Promise<Divida>;
  updateDivida(id: string, userId: string, data: Partial<InsertDivida>): Promise<Divida | undefined>;
  deleteDivida(id: string, userId: string): Promise<boolean>;

  getParcelas(userId: string): Promise<Parcela[]>;
  getParcelasByDivida(dividaId: string, userId: string): Promise<Parcela[]>;
  createParcela(parcela: InsertParcela): Promise<Parcela>;
  createParcelasBulk(parcelas: InsertParcela[]): Promise<Parcela[]>;
  updateParcela(id: string, userId: string, data: Partial<InsertParcela>): Promise<Parcela | undefined>;
  deleteParcela(id: string, userId: string): Promise<boolean>;
  deleteParcelasByDivida(dividaId: string, userId: string): Promise<void>;

  getCartoes(userId: string): Promise<Cartao[]>;
  getCartao(id: string, userId: string): Promise<Cartao | undefined>;
  createCartao(cartao: InsertCartao): Promise<Cartao>;
  updateCartao(id: string, userId: string, data: Partial<InsertCartao>): Promise<Cartao | undefined>;
  deleteCartao(id: string, userId: string): Promise<boolean>;

  getComprasCartao(userId: string): Promise<CompraCartao[]>;
  getComprasByCartao(cartaoId: string, userId: string): Promise<CompraCartao[]>;
  getComprasByPessoa(pessoaId: string, userId: string): Promise<CompraCartao[]>;
  createCompraCartao(compra: InsertCompraCartao): Promise<CompraCartao>;
  updateCompraCartao(id: string, userId: string, data: Partial<InsertCompraCartao>): Promise<CompraCartao | undefined>;
  deleteCompraCartao(id: string, userId: string): Promise<boolean>;

  getServicos(userId: string): Promise<Servico[]>;
  getServico(id: string, userId: string): Promise<Servico | undefined>;
  createServico(servico: InsertServico): Promise<Servico>;
  updateServico(id: string, userId: string, data: Partial<InsertServico>): Promise<Servico | undefined>;
  deleteServico(id: string, userId: string): Promise<boolean>;

  getServicoPessoas(userId: string): Promise<ServicoPessoa[]>;
  getServicoPessoasByServico(servicoId: string, userId: string): Promise<ServicoPessoa[]>;
  getServicoPessoasByPessoa(pessoaId: string, userId: string): Promise<ServicoPessoa[]>;
  createServicoPessoa(sp: InsertServicoPessoa): Promise<ServicoPessoa>;
  updateServicoPessoa(id: string, userId: string, data: Partial<InsertServicoPessoa>): Promise<ServicoPessoa | undefined>;
  deleteServicoPessoa(id: string, userId: string): Promise<boolean>;

  getServicoPagamentos(userId: string): Promise<ServicoPagamento[]>;
  getServicoPagamentosByServicoPessoa(servicoPessoaId: string): Promise<ServicoPagamento[]>;
  createServicoPagamento(sp: InsertServicoPagamento): Promise<ServicoPagamento>;
  deleteServicoPagamento(id: string, userId: string): Promise<boolean>;
  deleteServicoPagamentosByServicoPessoa(servicoPessoaId: string, userId: string): Promise<void>;

  getMetas(userId: string): Promise<Meta[]>;
  getMeta(id: string, userId: string): Promise<Meta | undefined>;
  createMeta(meta: InsertMeta): Promise<Meta>;
  updateMeta(id: string, userId: string, data: Partial<InsertMeta>): Promise<Meta | undefined>;
  deleteMeta(id: string, userId: string): Promise<boolean>;

  getParcelasCompra(compraCartaoId: string, userId: string): Promise<ParcelaCompra[]>;
  createParcelasCompraBulk(parcelas: InsertParcelaCompra[]): Promise<ParcelaCompra[]>;
  updateParcelaCompra(id: string, userId: string, data: Partial<InsertParcelaCompra>): Promise<ParcelaCompra | undefined>;
  deleteParcelasCompraBulk(compraCartaoId: string, userId: string): Promise<void>;

  getRendas(userId: string): Promise<Renda[]>;
  createRenda(data: InsertRenda): Promise<Renda>;
  updateRenda(id: string, userId: string, data: Partial<InsertRenda>): Promise<Renda | undefined>;
  deleteRenda(id: string, userId: string): Promise<boolean>;

  getPatrimonios(userId: string): Promise<Patrimonio[]>;
  createPatrimonio(data: InsertPatrimonio): Promise<Patrimonio>;
  updatePatrimonio(id: string, userId: string, data: Partial<InsertPatrimonio>): Promise<Patrimonio | undefined>;
  deletePatrimonio(id: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async createUser(insertUser: InsertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id: string, data: Partial<User>) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }
  async getUserByResetToken(token: string) {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async getPessoas(userId: string) { return db.select().from(pessoas).where(eq(pessoas.userId, userId)); }
  async getPessoa(id: string, userId: string) {
    const [p] = await db.select().from(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId)));
    return p;
  }
  async createPessoa(pessoa: InsertPessoa) {
    const [p] = await db.insert(pessoas).values(pessoa).returning();
    return p;
  }
  async updatePessoa(id: string, userId: string, data: Partial<InsertPessoa>) {
    const [p] = await db.update(pessoas).set(data).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).returning();
    return p;
  }
  async deletePessoa(id: string, userId: string) {
    const result = await db.delete(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).returning();
    return result.length > 0;
  }

  async getDividas(userId: string) { return db.select().from(dividas).where(eq(dividas.userId, userId)); }
  async getDividasByPessoa(pessoaId: string, userId: string) {
    return db.select().from(dividas).where(and(eq(dividas.pessoaId, pessoaId), eq(dividas.userId, userId)));
  }
  async getDivida(id: string, userId: string) {
    const [d] = await db.select().from(dividas).where(and(eq(dividas.id, id), eq(dividas.userId, userId)));
    return d;
  }
  async createDivida(divida: InsertDivida) {
    const [d] = await db.insert(dividas).values(divida).returning();
    return d;
  }
  async updateDivida(id: string, userId: string, data: Partial<InsertDivida>) {
    const [d] = await db.update(dividas).set(data).where(and(eq(dividas.id, id), eq(dividas.userId, userId))).returning();
    return d;
  }
  async deleteDivida(id: string, userId: string) {
    const result = await db.delete(dividas).where(and(eq(dividas.id, id), eq(dividas.userId, userId))).returning();
    return result.length > 0;
  }

  async getParcelas(userId: string) { return db.select().from(parcelas).where(eq(parcelas.userId, userId)); }
  async getParcelasByDivida(dividaId: string, userId: string) {
    return db.select().from(parcelas).where(and(eq(parcelas.dividaId, dividaId), eq(parcelas.userId, userId)));
  }
  async createParcela(parcela: InsertParcela) {
    const [p] = await db.insert(parcelas).values(parcela).returning();
    return p;
  }
  async createParcelasBulk(parcelasData: InsertParcela[]) {
    return db.insert(parcelas).values(parcelasData).returning();
  }
  async updateParcela(id: string, userId: string, data: Partial<InsertParcela>) {
    const [p] = await db.update(parcelas).set(data).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId))).returning();
    return p;
  }
  async deleteParcela(id: string, userId: string) {
    const result = await db.delete(parcelas).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId))).returning();
    return result.length > 0;
  }
  async deleteParcelasByDivida(dividaId: string, userId: string) {
    await db.delete(parcelas).where(and(eq(parcelas.dividaId, dividaId), eq(parcelas.userId, userId)));
  }

  async getCartoes(userId: string) { return db.select().from(cartoes).where(eq(cartoes.userId, userId)); }
  async getCartao(id: string, userId: string) {
    const [c] = await db.select().from(cartoes).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId)));
    return c;
  }
  async createCartao(cartao: InsertCartao) {
    const [c] = await db.insert(cartoes).values(cartao).returning();
    return c;
  }
  async updateCartao(id: string, userId: string, data: Partial<InsertCartao>) {
    const [c] = await db.update(cartoes).set(data).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId))).returning();
    return c;
  }
  async deleteCartao(id: string, userId: string) {
    const result = await db.delete(cartoes).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId))).returning();
    return result.length > 0;
  }

  async getComprasCartao(userId: string) { return db.select().from(comprasCartao).where(eq(comprasCartao.userId, userId)); }
  async getComprasByCartao(cartaoId: string, userId: string) {
    return db.select().from(comprasCartao).where(and(eq(comprasCartao.cartaoId, cartaoId), eq(comprasCartao.userId, userId)));
  }
  async getComprasByPessoa(pessoaId: string, userId: string) {
    return db.select().from(comprasCartao).where(and(eq(comprasCartao.pessoaId, pessoaId), eq(comprasCartao.userId, userId)));
  }
  async createCompraCartao(compra: InsertCompraCartao) {
    const [c] = await db.insert(comprasCartao).values(compra).returning();
    return c;
  }
  async updateCompraCartao(id: string, userId: string, data: Partial<InsertCompraCartao>) {
    const [c] = await db.update(comprasCartao).set(data).where(and(eq(comprasCartao.id, id), eq(comprasCartao.userId, userId))).returning();
    return c;
  }
  async deleteCompraCartao(id: string, userId: string) {
    const result = await db.delete(comprasCartao).where(and(eq(comprasCartao.id, id), eq(comprasCartao.userId, userId))).returning();
    return result.length > 0;
  }

  async getServicos(userId: string) { return db.select().from(servicos).where(eq(servicos.userId, userId)); }
  async getServico(id: string, userId: string) {
    const [s] = await db.select().from(servicos).where(and(eq(servicos.id, id), eq(servicos.userId, userId)));
    return s;
  }
  async createServico(servico: InsertServico) {
    const [s] = await db.insert(servicos).values(servico).returning();
    return s;
  }
  async updateServico(id: string, userId: string, data: Partial<InsertServico>) {
    const [s] = await db.update(servicos).set(data).where(and(eq(servicos.id, id), eq(servicos.userId, userId))).returning();
    return s;
  }
  async deleteServico(id: string, userId: string) {
    const result = await db.delete(servicos).where(and(eq(servicos.id, id), eq(servicos.userId, userId))).returning();
    return result.length > 0;
  }

  async getServicoPessoas(userId: string) { return db.select().from(servicoPessoas).where(eq(servicoPessoas.userId, userId)); }
  async getServicoPessoasByServico(servicoId: string, userId: string) {
    return db.select().from(servicoPessoas).where(and(eq(servicoPessoas.servicoId, servicoId), eq(servicoPessoas.userId, userId)));
  }
  async getServicoPessoasByPessoa(pessoaId: string, userId: string) {
    return db.select().from(servicoPessoas).where(and(eq(servicoPessoas.pessoaId, pessoaId), eq(servicoPessoas.userId, userId)));
  }
  async createServicoPessoa(sp: InsertServicoPessoa) {
    const [p] = await db.insert(servicoPessoas).values(sp).returning();
    return p;
  }
  async updateServicoPessoa(id: string, userId: string, data: Partial<InsertServicoPessoa>) {
    const [p] = await db.update(servicoPessoas).set(data).where(and(eq(servicoPessoas.id, id), eq(servicoPessoas.userId, userId))).returning();
    return p;
  }
  async deleteServicoPessoa(id: string, userId: string) {
    const result = await db.delete(servicoPessoas).where(and(eq(servicoPessoas.id, id), eq(servicoPessoas.userId, userId))).returning();
    return result.length > 0;
  }

  async getServicoPagamentos(userId: string) { return db.select().from(servicoPagamentos).where(eq(servicoPagamentos.userId, userId)); }
  async getServicoPagamentosByServicoPessoa(servicoPessoaId: string) {
    return db.select().from(servicoPagamentos).where(eq(servicoPagamentos.servicoPessoaId, servicoPessoaId));
  }
  async createServicoPagamento(sp: InsertServicoPagamento) {
    const [p] = await db.insert(servicoPagamentos).values(sp).returning();
    return p;
  }
  async deleteServicoPagamento(id: string, userId: string) {
    const result = await db.delete(servicoPagamentos).where(and(eq(servicoPagamentos.id, id), eq(servicoPagamentos.userId, userId))).returning();
    return result.length > 0;
  }
  async deleteServicoPagamentosByServicoPessoa(servicoPessoaId: string, userId: string) {
    await db.delete(servicoPagamentos).where(and(eq(servicoPagamentos.servicoPessoaId, servicoPessoaId), eq(servicoPagamentos.userId, userId)));
  }

  async getMetas(userId: string) { return db.select().from(metas).where(eq(metas.userId, userId)); }
  async getMeta(id: string, userId: string) {
    const [m] = await db.select().from(metas).where(and(eq(metas.id, id), eq(metas.userId, userId)));
    return m;
  }
  async createMeta(meta: InsertMeta) {
    const [m] = await db.insert(metas).values(meta).returning();
    return m;
  }
  async updateMeta(id: string, userId: string, data: Partial<InsertMeta>) {
    const [m] = await db.update(metas).set(data).where(and(eq(metas.id, id), eq(metas.userId, userId))).returning();
    return m;
  }
  async deleteMeta(id: string, userId: string) {
    const result = await db.delete(metas).where(and(eq(metas.id, id), eq(metas.userId, userId))).returning();
    return result.length > 0;
  }

  async getParcelasCompra(compraCartaoId: string, userId: string) {
    const rows = await db.select().from(parcelasCompra).where(
      and(eq(parcelasCompra.compraCartaoId, compraCartaoId), eq(parcelasCompra.userId, userId))
    );
    return rows.sort((a, b) => a.numero - b.numero);
  }
  async createParcelasCompraBulk(rows: InsertParcelaCompra[]) {
    if (rows.length === 0) return [];
    return db.insert(parcelasCompra).values(rows).returning();
  }
  async updateParcelaCompra(id: string, userId: string, data: Partial<InsertParcelaCompra>) {
    const [p] = await db.update(parcelasCompra).set(data).where(
      and(eq(parcelasCompra.id, id), eq(parcelasCompra.userId, userId))
    ).returning();
    return p;
  }
  async deleteParcelasCompraBulk(compraCartaoId: string, userId: string) {
    await db.delete(parcelasCompra).where(
      and(eq(parcelasCompra.compraCartaoId, compraCartaoId), eq(parcelasCompra.userId, userId))
    );
  }

  async getRendas(userId: string) { return db.select().from(rendas).where(eq(rendas.userId, userId)); }
  async createRenda(data: InsertRenda) {
    const [r] = await db.insert(rendas).values(data).returning();
    return r;
  }
  async updateRenda(id: string, userId: string, data: Partial<InsertRenda>) {
    const [r] = await db.update(rendas).set(data).where(and(eq(rendas.id, id), eq(rendas.userId, userId))).returning();
    return r;
  }
  async deleteRenda(id: string, userId: string) {
    const result = await db.delete(rendas).where(and(eq(rendas.id, id), eq(rendas.userId, userId))).returning();
    return result.length > 0;
  }

  async getPatrimonios(userId: string) { return db.select().from(patrimonios).where(eq(patrimonios.userId, userId)); }
  async createPatrimonio(data: InsertPatrimonio) {
    const [p] = await db.insert(patrimonios).values(data).returning();
    return p;
  }
  async updatePatrimonio(id: string, userId: string, data: Partial<InsertPatrimonio>) {
    const [p] = await db.update(patrimonios).set(data).where(and(eq(patrimonios.id, id), eq(patrimonios.userId, userId))).returning();
    return p;
  }
  async deletePatrimonio(id: string, userId: string) {
    const result = await db.delete(patrimonios).where(and(eq(patrimonios.id, id), eq(patrimonios.userId, userId))).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
