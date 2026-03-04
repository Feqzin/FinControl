import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, pessoas, dividas, parcelas, cartoes, comprasCartao, servicos, metas,
  type User, type InsertUser,
  type Pessoa, type InsertPessoa,
  type Divida, type InsertDivida,
  type Parcela, type InsertParcela,
  type Cartao, type InsertCartao,
  type CompraCartao, type InsertCompraCartao,
  type Servico, type InsertServico,
  type Meta, type InsertMeta,
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
  createCompraCartao(compra: InsertCompraCartao): Promise<CompraCartao>;
  deleteCompraCartao(id: string, userId: string): Promise<boolean>;

  getServicos(userId: string): Promise<Servico[]>;
  getServico(id: string, userId: string): Promise<Servico | undefined>;
  createServico(servico: InsertServico): Promise<Servico>;
  updateServico(id: string, userId: string, data: Partial<InsertServico>): Promise<Servico | undefined>;
  deleteServico(id: string, userId: string): Promise<boolean>;

  getMetas(userId: string): Promise<Meta[]>;
  getMeta(id: string, userId: string): Promise<Meta | undefined>;
  createMeta(meta: InsertMeta): Promise<Meta>;
  updateMeta(id: string, userId: string, data: Partial<InsertMeta>): Promise<Meta | undefined>;
  deleteMeta(id: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async getPessoas(userId: string): Promise<Pessoa[]> {
    return db.select().from(pessoas).where(eq(pessoas.userId, userId));
  }

  async getPessoa(id: string, userId: string): Promise<Pessoa | undefined> {
    const [p] = await db.select().from(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId)));
    return p;
  }

  async createPessoa(pessoa: InsertPessoa): Promise<Pessoa> {
    const [p] = await db.insert(pessoas).values(pessoa).returning();
    return p;
  }

  async updatePessoa(id: string, userId: string, data: Partial<InsertPessoa>): Promise<Pessoa | undefined> {
    const [p] = await db.update(pessoas).set(data).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).returning();
    return p;
  }

  async deletePessoa(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).returning();
    return result.length > 0;
  }

  async getDividas(userId: string): Promise<Divida[]> {
    return db.select().from(dividas).where(eq(dividas.userId, userId));
  }

  async getDividasByPessoa(pessoaId: string, userId: string): Promise<Divida[]> {
    return db.select().from(dividas).where(and(eq(dividas.pessoaId, pessoaId), eq(dividas.userId, userId)));
  }

  async getDivida(id: string, userId: string): Promise<Divida | undefined> {
    const [d] = await db.select().from(dividas).where(and(eq(dividas.id, id), eq(dividas.userId, userId)));
    return d;
  }

  async createDivida(divida: InsertDivida): Promise<Divida> {
    const [d] = await db.insert(dividas).values(divida).returning();
    return d;
  }

  async updateDivida(id: string, userId: string, data: Partial<InsertDivida>): Promise<Divida | undefined> {
    const [d] = await db.update(dividas).set(data).where(and(eq(dividas.id, id), eq(dividas.userId, userId))).returning();
    return d;
  }

  async deleteDivida(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(dividas).where(and(eq(dividas.id, id), eq(dividas.userId, userId))).returning();
    return result.length > 0;
  }

  async getParcelas(userId: string): Promise<Parcela[]> {
    return db.select().from(parcelas).where(eq(parcelas.userId, userId));
  }

  async getParcelasByDivida(dividaId: string, userId: string): Promise<Parcela[]> {
    return db.select().from(parcelas)
      .where(and(eq(parcelas.dividaId, dividaId), eq(parcelas.userId, userId)));
  }

  async createParcela(parcela: InsertParcela): Promise<Parcela> {
    const [p] = await db.insert(parcelas).values(parcela).returning();
    return p;
  }

  async createParcelasBulk(parcelasData: InsertParcela[]): Promise<Parcela[]> {
    return db.insert(parcelas).values(parcelasData).returning();
  }

  async updateParcela(id: string, userId: string, data: Partial<InsertParcela>): Promise<Parcela | undefined> {
    const [p] = await db.update(parcelas).set(data).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId))).returning();
    return p;
  }

  async deleteParcela(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(parcelas).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId))).returning();
    return result.length > 0;
  }

  async deleteParcelasByDivida(dividaId: string, userId: string): Promise<void> {
    await db.delete(parcelas).where(and(eq(parcelas.dividaId, dividaId), eq(parcelas.userId, userId)));
  }

  async getCartoes(userId: string): Promise<Cartao[]> {
    return db.select().from(cartoes).where(eq(cartoes.userId, userId));
  }

  async getCartao(id: string, userId: string): Promise<Cartao | undefined> {
    const [c] = await db.select().from(cartoes).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId)));
    return c;
  }

  async createCartao(cartao: InsertCartao): Promise<Cartao> {
    const [c] = await db.insert(cartoes).values(cartao).returning();
    return c;
  }

  async updateCartao(id: string, userId: string, data: Partial<InsertCartao>): Promise<Cartao | undefined> {
    const [c] = await db.update(cartoes).set(data).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId))).returning();
    return c;
  }

  async deleteCartao(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(cartoes).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId))).returning();
    return result.length > 0;
  }

  async getComprasCartao(userId: string): Promise<CompraCartao[]> {
    return db.select().from(comprasCartao).where(eq(comprasCartao.userId, userId));
  }

  async getComprasByCartao(cartaoId: string, userId: string): Promise<CompraCartao[]> {
    return db.select().from(comprasCartao).where(and(eq(comprasCartao.cartaoId, cartaoId), eq(comprasCartao.userId, userId)));
  }

  async createCompraCartao(compra: InsertCompraCartao): Promise<CompraCartao> {
    const [c] = await db.insert(comprasCartao).values(compra).returning();
    return c;
  }

  async deleteCompraCartao(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(comprasCartao).where(and(eq(comprasCartao.id, id), eq(comprasCartao.userId, userId))).returning();
    return result.length > 0;
  }

  async getServicos(userId: string): Promise<Servico[]> {
    return db.select().from(servicos).where(eq(servicos.userId, userId));
  }

  async getServico(id: string, userId: string): Promise<Servico | undefined> {
    const [s] = await db.select().from(servicos).where(and(eq(servicos.id, id), eq(servicos.userId, userId)));
    return s;
  }

  async createServico(servico: InsertServico): Promise<Servico> {
    const [s] = await db.insert(servicos).values(servico).returning();
    return s;
  }

  async updateServico(id: string, userId: string, data: Partial<InsertServico>): Promise<Servico | undefined> {
    const [s] = await db.update(servicos).set(data).where(and(eq(servicos.id, id), eq(servicos.userId, userId))).returning();
    return s;
  }

  async deleteServico(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(servicos).where(and(eq(servicos.id, id), eq(servicos.userId, userId))).returning();
    return result.length > 0;
  }

  async getMetas(userId: string): Promise<Meta[]> {
    return db.select().from(metas).where(eq(metas.userId, userId));
  }

  async getMeta(id: string, userId: string): Promise<Meta | undefined> {
    const [m] = await db.select().from(metas).where(and(eq(metas.id, id), eq(metas.userId, userId)));
    return m;
  }

  async createMeta(meta: InsertMeta): Promise<Meta> {
    const [m] = await db.insert(metas).values(meta).returning();
    return m;
  }

  async updateMeta(id: string, userId: string, data: Partial<InsertMeta>): Promise<Meta | undefined> {
    const [m] = await db.update(metas).set(data).where(and(eq(metas.id, id), eq(metas.userId, userId))).returning();
    return m;
  }

  async deleteMeta(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(metas).where(and(eq(metas.id, id), eq(metas.userId, userId))).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
