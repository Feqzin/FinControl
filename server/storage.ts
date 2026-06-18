import { eq, and, sql, isNull, isNotNull } from "drizzle-orm";
import { db } from "./db";
import {
  users, pessoas, dividas, parcelas, cartoes, comprasCartao, servicos,
  servicoPessoas, servicoPagamentos, metas, parcelasCompra, cartaoFaturaPagamentos, pessoaSaldoMovimentacoes, rendas, patrimonios, compraAliases,
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
  type CartaoFaturaPagamento, type InsertCartaoFaturaPagamento,
  type PessoaSaldoMovimentacao,
  type Renda, type InsertRenda,
  type Patrimonio, type InsertPatrimonio,
  type CompraAlias, type InsertCompraAlias,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getPessoas(userId: string): Promise<Pessoa[]>;
  getPessoasByStatus(userId: string, status: "active" | "removed" | "all"): Promise<Pessoa[]>;
  getPessoa(id: string, userId: string): Promise<Pessoa | undefined>;
  createPessoa(pessoa: InsertPessoa): Promise<Pessoa>;
  updatePessoa(id: string, userId: string, data: Partial<InsertPessoa>): Promise<Pessoa | undefined>;
  deletePessoa(id: string, userId: string): Promise<boolean>;
  restorePessoa(id: string, userId: string): Promise<Pessoa | undefined>;
  deletePessoaPermanent(id: string, userId: string): Promise<boolean>;
  getPessoaSaldoMovimentacoes(userId: string): Promise<PessoaSaldoMovimentacao[]>;
  getPessoaSaldoMovimentacoesByPessoa(pessoaId: string, userId: string): Promise<PessoaSaldoMovimentacao[]>;

  getDividas(userId: string): Promise<Divida[]>;
  getDividasByStatus(userId: string, status: "active" | "removed" | "all"): Promise<Divida[]>;
  getDividasByPessoa(pessoaId: string, userId: string): Promise<Divida[]>;
  getDivida(id: string, userId: string): Promise<Divida | undefined>;
  createDivida(divida: InsertDivida): Promise<Divida>;
  updateDivida(id: string, userId: string, data: Partial<InsertDivida>): Promise<Divida | undefined>;
  deleteDivida(id: string, userId: string): Promise<boolean>;
  restoreDivida(id: string, userId: string): Promise<Divida | undefined>;
  deleteDividaPermanent(id: string, userId: string): Promise<boolean>;

  getParcelas(userId: string): Promise<Parcela[]>;
  getParcela(id: string, userId: string): Promise<Parcela | undefined>;
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
  getCompraCartao(id: string, userId: string): Promise<CompraCartao | undefined>;
  getComprasByCartao(cartaoId: string, userId: string): Promise<CompraCartao[]>;
  getComprasByPessoa(pessoaId: string, userId: string): Promise<CompraCartao[]>;
  createCompraCartao(compra: InsertCompraCartao): Promise<CompraCartao>;
  updateCompraCartao(id: string, userId: string, data: Partial<InsertCompraCartao>): Promise<CompraCartao | undefined>;
  deleteCompraCartao(id: string, userId: string): Promise<boolean>;
  getCompraAliases(userId: string): Promise<CompraAlias[]>;
  createCompraAlias(alias: InsertCompraAlias): Promise<CompraAlias>;
  deleteCompraAlias(id: string, userId: string): Promise<boolean>;

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
  getServicoPagamentosByServicoPessoa(servicoPessoaId: string, userId: string): Promise<ServicoPagamento[]>;
  createServicoPagamento(sp: InsertServicoPagamento): Promise<ServicoPagamento>;
  deleteServicoPagamento(id: string, userId: string): Promise<boolean>;
  deleteServicoPagamentosByServicoPessoa(servicoPessoaId: string, userId: string): Promise<void>;

  getMetas(userId: string): Promise<Meta[]>;
  getMeta(id: string, userId: string): Promise<Meta | undefined>;
  createMeta(meta: InsertMeta): Promise<Meta>;
  updateMeta(id: string, userId: string, data: Partial<InsertMeta>): Promise<Meta | undefined>;
  deleteMeta(id: string, userId: string): Promise<boolean>;

  getParcelasCompra(compraCartaoId: string, userId: string): Promise<ParcelaCompra[]>;
  getParcelasCompraByUser(userId: string): Promise<ParcelaCompra[]>;
  getParcelaCompraById(id: string, userId: string): Promise<ParcelaCompra | undefined>;
  createParcelasCompraBulk(parcelas: InsertParcelaCompra[]): Promise<ParcelaCompra[]>;
  updateParcelaCompra(id: string, userId: string, data: Partial<InsertParcelaCompra>): Promise<ParcelaCompra | undefined>;
  deleteParcelaCompra(id: string, userId: string): Promise<boolean>;
  deleteParcelasCompraBulk(compraCartaoId: string, userId: string): Promise<void>;

  getCartaoFaturaPagamentos(userId: string): Promise<CartaoFaturaPagamento[]>;
  getCartaoFaturaPagamentosByCartao(cartaoId: string, userId: string): Promise<CartaoFaturaPagamento[]>;
  createCartaoFaturaPagamento(data: InsertCartaoFaturaPagamento): Promise<CartaoFaturaPagamento>;
  updateCartaoFaturaPagamento(
    id: string,
    userId: string,
    data: Partial<InsertCartaoFaturaPagamento>,
  ): Promise<CartaoFaturaPagamento | undefined>;

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
  constructor(private readonly database: any = db) {}
  private usersBaseProjection = {
    id: users.id,
    username: users.username,
    password: users.password,
  } as const;

  private parcelasCompraProjectionWithoutComprovante = {
    id: parcelasCompra.id,
    userId: parcelasCompra.userId,
    compraCartaoId: parcelasCompra.compraCartaoId,
    numero: parcelasCompra.numero,
    valor: parcelasCompra.valor,
    dataVencimento: parcelasCompra.dataVencimento,
    statusCartao: parcelasCompra.statusCartao,
    dataPagamentoCartao: parcelasCompra.dataPagamentoCartao,
    statusPessoa: parcelasCompra.statusPessoa,
    dataPagamentoPessoa: parcelasCompra.dataPagamentoPessoa,
  } as const;

  private isMissingUsersOptionalColumnsError(error: unknown): boolean {
    const messages: string[] = [];
    const queue: unknown[] = [error];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (typeof current === "string") {
        messages.push(current.toLowerCase());
        continue;
      }

      if (typeof current === "object") {
        const maybeError = current as { message?: unknown; code?: unknown; cause?: unknown };
        if (typeof maybeError.message === "string") {
          messages.push(maybeError.message.toLowerCase());
        }
        if (typeof maybeError.code === "string") {
          messages.push(maybeError.code.toLowerCase());
        }
        if (maybeError.cause !== undefined) {
          queue.push(maybeError.cause);
        }
      }
    }

    const combined = messages.join(" | ");
    if (combined.includes("42703")) return true;
    return (
      combined.includes("does not exist") &&
      (
        combined.includes("nome_completo") ||
        combined.includes("subscription_tier") ||
        combined.includes("trial_started_at") ||
        combined.includes("trial_ends_at") ||
        combined.includes("trial_used_at") ||
        combined.includes("reset_token") ||
        combined.includes("reset_token_expiry") ||
        combined.includes("public_code") ||
        combined.includes("full_name_visibility") ||
        combined.includes("email")
      )
    );
  }

  private toUserWithOptionalDefaults(user: {
    id: string;
    username: string;
    email?: string | null;
    password: string;
    subscriptionTier?: string | null;
    subscription_tier?: string | null;
  }): User {
    return {
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      password: user.password,
      publicCode: null,
      nomeCompleto: null,
      fullNameVisibility: "private",
      subscriptionTier:
      user.subscriptionTier ??
      user.subscription_tier ??
      "free",
      trialStartedAt: null,
      trialEndsAt: null,
      trialUsedAt: null,
      resetToken: null,
      resetTokenExpiry: null,
    };
  }

  async getUser(id: string) {
    try {
      const [user] = await this.database.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      if (!this.isMissingUsersOptionalColumnsError(error)) throw error;
      const [user] = await this.database.select(this.usersBaseProjection).from(users).where(eq(users.id, id));
      return user ? this.toUserWithOptionalDefaults(user) : undefined;
    }
  }
  async getUserByUsername(username: string) {
    try {
      const [user] = await this.database
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username.trim()})`)
        .limit(1);
      return user;
    } catch (error) {
      if (!this.isMissingUsersOptionalColumnsError(error)) throw error;
      const [user] = await this.database
        .select(this.usersBaseProjection)
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username.trim()})`)
        .limit(1);
      return user ? this.toUserWithOptionalDefaults(user) : undefined;
    }
  }
  async getUserByEmail(email: string) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return undefined;
    try {
      const [user] = await this.database
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${normalizedEmail})`)
        .limit(1);
      return user;
    } catch (error) {
      if (!this.isMissingUsersOptionalColumnsError(error)) throw error;
      return undefined;
    }
  }
  async createUser(insertUser: InsertUser) {
    try {
      const [user] = await this.database.insert(users).values(insertUser).returning();
      return user;
    } catch (error) {
      if (!this.isMissingUsersOptionalColumnsError(error)) throw error;
      const fallbackInsertUser: InsertUser = { ...insertUser };
      delete fallbackInsertUser.email;
      const [user] = await this.database.insert(users).values(fallbackInsertUser).returning(this.usersBaseProjection);
      return this.toUserWithOptionalDefaults(user);
    }
  }
  async updateUser(id: string, data: Partial<User>) {
    try {
      const [user] = await this.database.update(users).set(data).where(eq(users.id, id)).returning();
      return user;
    } catch (error) {
      if (!this.isMissingUsersOptionalColumnsError(error)) throw error;

      const fallbackData: Partial<User> = { ...data };
      delete fallbackData.nomeCompleto;
      delete fallbackData.subscriptionTier;
      delete fallbackData.trialStartedAt;
      delete fallbackData.trialEndsAt;
      delete fallbackData.trialUsedAt;
      delete fallbackData.resetToken;
      delete fallbackData.resetTokenExpiry;
      delete fallbackData.fullNameVisibility;
      delete fallbackData.email;

      if (Object.keys(fallbackData).length === 0) {
        return this.getUser(id);
      }

      const [user] = await this.database
        .update(users)
        .set(fallbackData)
        .where(eq(users.id, id))
        .returning(this.usersBaseProjection);
      return user ? this.toUserWithOptionalDefaults(user) : undefined;
    }
  }
  async getUserByResetToken(token: string) {
    try {
      const [user] = await this.database.select().from(users).where(eq(users.resetToken, token));
      return user;
    } catch (error) {
      if (!this.isMissingUsersOptionalColumnsError(error)) throw error;
      return undefined;
    }
  }

  async getPessoas(userId: string) {
    return this.database.select().from(pessoas).where(eq(pessoas.userId, userId));
  }
  async getPessoasByStatus(userId: string, status: "active" | "removed" | "all") {
    if (status === "active") {
      return this.database
        .select()
        .from(pessoas)
        .where(and(eq(pessoas.userId, userId), isNull(pessoas.deletedAt)));
    }
    if (status === "removed") {
      return this.database
        .select()
        .from(pessoas)
        .where(and(eq(pessoas.userId, userId), isNotNull(pessoas.deletedAt)));
    }
    return this.getPessoas(userId);
  }
  async getPessoa(id: string, userId: string) {
    const [p] = await this.database.select().from(pessoas).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId)));
    return p;
  }
  async createPessoa(pessoa: InsertPessoa) {
    const [p] = await this.database.insert(pessoas).values(pessoa).returning();
    return p;
  }
  async updatePessoa(id: string, userId: string, data: Partial<InsertPessoa>) {
    const [p] = await this.database.update(pessoas).set(data).where(and(eq(pessoas.id, id), eq(pessoas.userId, userId))).returning();
    return p;
  }
  async deletePessoa(id: string, userId: string) {
    const [softDeleted] = await this.database
      .update(pessoas)
      .set({ deletedAt: new Date() })
      .where(and(eq(pessoas.id, id), eq(pessoas.userId, userId), isNull(pessoas.deletedAt)))
      .returning();
    return Boolean(softDeleted);
  }
  async restorePessoa(id: string, userId: string) {
    const [restored] = await this.database
      .update(pessoas)
      .set({ deletedAt: null })
      .where(and(eq(pessoas.id, id), eq(pessoas.userId, userId), isNotNull(pessoas.deletedAt)))
      .returning();

    if (restored) return restored;
    return this.getPessoa(id, userId);
  }
  async deletePessoaPermanent(id: string, userId: string) {
    const deleted = await this.database
      .delete(pessoas)
      .where(and(eq(pessoas.id, id), eq(pessoas.userId, userId), isNotNull(pessoas.deletedAt)))
      .returning();
    return deleted.length > 0;
  }
  async getPessoaSaldoMovimentacoes(userId: string) {
    return this.database
      .select()
      .from(pessoaSaldoMovimentacoes)
      .where(eq(pessoaSaldoMovimentacoes.userId, userId));
  }
  async getPessoaSaldoMovimentacoesByPessoa(pessoaId: string, userId: string) {
    return this.database
      .select()
      .from(pessoaSaldoMovimentacoes)
      .where(and(eq(pessoaSaldoMovimentacoes.pessoaId, pessoaId), eq(pessoaSaldoMovimentacoes.userId, userId)));
  }

  async getDividas(userId: string) {
    return this.database
      .select()
      .from(dividas)
      .where(and(eq(dividas.userId, userId), isNull(dividas.deletedAt)));
  }
  async getDividasByStatus(userId: string, status: "active" | "removed" | "all") {
    if (status === "active") {
      return this.database
        .select()
        .from(dividas)
        .where(and(eq(dividas.userId, userId), isNull(dividas.deletedAt)));
    }

    if (status === "removed") {
      return this.database
        .select()
        .from(dividas)
        .where(and(eq(dividas.userId, userId), isNotNull(dividas.deletedAt)));
    }

    return this.database
      .select()
      .from(dividas)
      .where(eq(dividas.userId, userId));
  }
  async getDividasByPessoa(pessoaId: string, userId: string) {
    return this.database
      .select()
      .from(dividas)
      .where(and(eq(dividas.pessoaId, pessoaId), eq(dividas.userId, userId), isNull(dividas.deletedAt)));
  }
  async getDivida(id: string, userId: string) {
    const [d] = await this.database.select().from(dividas).where(and(eq(dividas.id, id), eq(dividas.userId, userId)));
    return d;
  }
  async createDivida(divida: InsertDivida) {
    const [d] = await this.database.insert(dividas).values(divida).returning();
    return d;
  }
  async updateDivida(id: string, userId: string, data: Partial<InsertDivida>) {
    const [d] = await this.database.update(dividas).set(data).where(and(eq(dividas.id, id), eq(dividas.userId, userId))).returning();
    return d;
  }
  async deleteDivida(id: string, userId: string) {
    const [softDeleted] = await this.database
      .update(dividas)
      .set({ deletedAt: new Date() })
      .where(and(eq(dividas.id, id), eq(dividas.userId, userId), isNull(dividas.deletedAt)))
      .returning();
    return Boolean(softDeleted);
  }
  async restoreDivida(id: string, userId: string) {
    const [restored] = await this.database
      .update(dividas)
      .set({ deletedAt: null })
      .where(and(eq(dividas.id, id), eq(dividas.userId, userId), isNotNull(dividas.deletedAt)))
      .returning();

    if (restored) return restored;
    return this.getDivida(id, userId);
  }
  async deleteDividaPermanent(id: string, userId: string) {
    const result = await this.database
      .delete(dividas)
      .where(and(eq(dividas.id, id), eq(dividas.userId, userId), isNotNull(dividas.deletedAt)))
      .returning();
    return result.length > 0;
  }

  async getParcelas(userId: string) { return this.database.select().from(parcelas).where(eq(parcelas.userId, userId)); }
  async getParcela(id: string, userId: string) {
    const [p] = await this.database.select().from(parcelas).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId)));
    return p;
  }
  async getParcelasByDivida(dividaId: string, userId: string) {
    return this.database.select().from(parcelas).where(and(eq(parcelas.dividaId, dividaId), eq(parcelas.userId, userId)));
  }
  async createParcela(parcela: InsertParcela) {
    const [p] = await this.database.insert(parcelas).values(parcela).returning();
    return p;
  }
  async createParcelasBulk(parcelasData: InsertParcela[]) {
    return this.database.insert(parcelas).values(parcelasData).returning();
  }
  async updateParcela(id: string, userId: string, data: Partial<InsertParcela>) {
    const [p] = await this.database.update(parcelas).set(data).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId))).returning();
    return p;
  }
  async deleteParcela(id: string, userId: string) {
    const result = await this.database.delete(parcelas).where(and(eq(parcelas.id, id), eq(parcelas.userId, userId))).returning();
    return result.length > 0;
  }
  async deleteParcelasByDivida(dividaId: string, userId: string) {
    await this.database.delete(parcelas).where(and(eq(parcelas.dividaId, dividaId), eq(parcelas.userId, userId)));
  }

  async getCartoes(userId: string) { return this.database.select().from(cartoes).where(eq(cartoes.userId, userId)); }
  async getCartao(id: string, userId: string) {
    const [c] = await this.database.select().from(cartoes).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId)));
    return c;
  }
  async createCartao(cartao: InsertCartao) {
    const [c] = await this.database.insert(cartoes).values(cartao).returning();
    return c;
  }
  async updateCartao(id: string, userId: string, data: Partial<InsertCartao>) {
    const [c] = await this.database.update(cartoes).set(data).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId))).returning();
    return c;
  }
  async deleteCartao(id: string, userId: string) {
    const result = await this.database.delete(cartoes).where(and(eq(cartoes.id, id), eq(cartoes.userId, userId))).returning();
    return result.length > 0;
  }

  async getComprasCartao(userId: string) { return this.database.select().from(comprasCartao).where(eq(comprasCartao.userId, userId)); }
  async getCompraCartao(id: string, userId: string) {
    const [c] = await this.database.select().from(comprasCartao).where(and(eq(comprasCartao.id, id), eq(comprasCartao.userId, userId)));
    return c;
  }
  async getComprasByCartao(cartaoId: string, userId: string) {
    return this.database.select().from(comprasCartao).where(and(eq(comprasCartao.cartaoId, cartaoId), eq(comprasCartao.userId, userId)));
  }
  async getComprasByPessoa(pessoaId: string, userId: string) {
    return this.database.select().from(comprasCartao).where(and(eq(comprasCartao.pessoaId, pessoaId), eq(comprasCartao.userId, userId)));
  }
  async createCompraCartao(compra: InsertCompraCartao) {
    const [c] = await this.database.insert(comprasCartao).values(compra).returning();
    return c;
  }
  async updateCompraCartao(id: string, userId: string, data: Partial<InsertCompraCartao>) {
    const [c] = await this.database.update(comprasCartao).set(data).where(and(eq(comprasCartao.id, id), eq(comprasCartao.userId, userId))).returning();
    return c;
  }
  async deleteCompraCartao(id: string, userId: string) {
    const result = await this.database.delete(comprasCartao).where(and(eq(comprasCartao.id, id), eq(comprasCartao.userId, userId))).returning();
    return result.length > 0;
  }
  async getCompraAliases(userId: string) {
    return this.database
      .select()
      .from(compraAliases)
      .where(eq(compraAliases.userId, userId));
  }
  async createCompraAlias(alias: InsertCompraAlias) {
    const [created] = await this.database
      .insert(compraAliases)
      .values(alias)
      .returning();
    return created;
  }
  async deleteCompraAlias(id: string, userId: string) {
    const result = await this.database
      .delete(compraAliases)
      .where(and(eq(compraAliases.id, id), eq(compraAliases.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getServicos(userId: string) { return this.database.select().from(servicos).where(eq(servicos.userId, userId)); }
  async getServico(id: string, userId: string) {
    const [s] = await this.database.select().from(servicos).where(and(eq(servicos.id, id), eq(servicos.userId, userId)));
    return s;
  }
  async createServico(servico: InsertServico) {
    const [s] = await this.database.insert(servicos).values(servico).returning();
    return s;
  }
  async updateServico(id: string, userId: string, data: Partial<InsertServico>) {
    const [s] = await this.database.update(servicos).set(data).where(and(eq(servicos.id, id), eq(servicos.userId, userId))).returning();
    return s;
  }
  async deleteServico(id: string, userId: string) {
    const result = await this.database.delete(servicos).where(and(eq(servicos.id, id), eq(servicos.userId, userId))).returning();
    return result.length > 0;
  }

  async getServicoPessoas(userId: string) { return this.database.select().from(servicoPessoas).where(eq(servicoPessoas.userId, userId)); }
  async getServicoPessoasByServico(servicoId: string, userId: string) {
    return this.database.select().from(servicoPessoas).where(and(eq(servicoPessoas.servicoId, servicoId), eq(servicoPessoas.userId, userId)));
  }
  async getServicoPessoasByPessoa(pessoaId: string, userId: string) {
    return this.database.select().from(servicoPessoas).where(and(eq(servicoPessoas.pessoaId, pessoaId), eq(servicoPessoas.userId, userId)));
  }
  async createServicoPessoa(sp: InsertServicoPessoa) {
    const [p] = await this.database.insert(servicoPessoas).values(sp).returning();
    return p;
  }
  async updateServicoPessoa(id: string, userId: string, data: Partial<InsertServicoPessoa>) {
    const [p] = await this.database.update(servicoPessoas).set(data).where(and(eq(servicoPessoas.id, id), eq(servicoPessoas.userId, userId))).returning();
    return p;
  }
  async deleteServicoPessoa(id: string, userId: string) {
    const result = await this.database.delete(servicoPessoas).where(and(eq(servicoPessoas.id, id), eq(servicoPessoas.userId, userId))).returning();
    return result.length > 0;
  }

  async getServicoPagamentos(userId: string) { return this.database.select().from(servicoPagamentos).where(eq(servicoPagamentos.userId, userId)); }
  async getServicoPagamentosByServicoPessoa(servicoPessoaId: string, userId: string) {
    return this.database.select().from(servicoPagamentos).where(
      and(eq(servicoPagamentos.servicoPessoaId, servicoPessoaId), eq(servicoPagamentos.userId, userId)),
    );
  }
  async createServicoPagamento(sp: InsertServicoPagamento) {
    const [p] = await this.database.insert(servicoPagamentos).values(sp).returning();
    return p;
  }
  async deleteServicoPagamento(id: string, userId: string) {
    const result = await this.database.delete(servicoPagamentos).where(and(eq(servicoPagamentos.id, id), eq(servicoPagamentos.userId, userId))).returning();
    return result.length > 0;
  }
  async deleteServicoPagamentosByServicoPessoa(servicoPessoaId: string, userId: string) {
    await this.database.delete(servicoPagamentos).where(and(eq(servicoPagamentos.servicoPessoaId, servicoPessoaId), eq(servicoPagamentos.userId, userId)));
  }

  async getMetas(userId: string) { return this.database.select().from(metas).where(eq(metas.userId, userId)); }
  async getMeta(id: string, userId: string) {
    const [m] = await this.database.select().from(metas).where(and(eq(metas.id, id), eq(metas.userId, userId)));
    return m;
  }
  async createMeta(meta: InsertMeta) {
    const [m] = await this.database.insert(metas).values(meta).returning();
    return m;
  }
  async updateMeta(id: string, userId: string, data: Partial<InsertMeta>) {
    const [m] = await this.database.update(metas).set(data).where(and(eq(metas.id, id), eq(metas.userId, userId))).returning();
    return m;
  }
  async deleteMeta(id: string, userId: string) {
    const result = await this.database.delete(metas).where(and(eq(metas.id, id), eq(metas.userId, userId))).returning();
    return result.length > 0;
  }

  async getParcelasCompra(compraCartaoId: string, userId: string) {
    try {
      const rows: ParcelaCompra[] = await this.database.select().from(parcelasCompra).where(
        and(eq(parcelasCompra.compraCartaoId, compraCartaoId), eq(parcelasCompra.userId, userId))
      );
      return rows.sort((a: ParcelaCompra, b: ParcelaCompra) => a.numero - b.numero);
    } catch (error) {
      if (this.isMissingParcelasCompraRelationError(error)) {
        return [];
      }
      if (!this.isMissingParcelasCompraComprovanteColumnsError(error)) throw error;
      const rows = await this.database
        .select(this.parcelasCompraProjectionWithoutComprovante)
        .from(parcelasCompra)
        .where(and(eq(parcelasCompra.compraCartaoId, compraCartaoId), eq(parcelasCompra.userId, userId)));
      return rows
        .map((row: any) => this.toParcelaCompraWithComprovanteDefaults(row))
        .sort((a: ParcelaCompra, b: ParcelaCompra) => a.numero - b.numero);
    }
  }
  async getParcelasCompraByUser(userId: string) {
    try {
      const rows: ParcelaCompra[] = await this.database.select().from(parcelasCompra).where(
        eq(parcelasCompra.userId, userId),
      );
      return rows.sort((a: ParcelaCompra, b: ParcelaCompra) => {
        if (a.compraCartaoId !== b.compraCartaoId) {
          return a.compraCartaoId.localeCompare(b.compraCartaoId);
        }
        return a.numero - b.numero;
      });
    } catch (error) {
      if (this.isMissingParcelasCompraRelationError(error)) {
        return [];
      }
      if (!this.isMissingParcelasCompraComprovanteColumnsError(error)) throw error;
      const rows = await this.database
        .select(this.parcelasCompraProjectionWithoutComprovante)
        .from(parcelasCompra)
        .where(eq(parcelasCompra.userId, userId));
      return rows
        .map((row: any) => this.toParcelaCompraWithComprovanteDefaults(row))
        .sort((a: ParcelaCompra, b: ParcelaCompra) => {
          if (a.compraCartaoId !== b.compraCartaoId) {
            return a.compraCartaoId.localeCompare(b.compraCartaoId);
          }
          return a.numero - b.numero;
        });
    }
  }

  private isMissingParcelasCompraComprovanteColumnsError(error: unknown): boolean {
    const messages: string[] = [];
    const queue: unknown[] = [error];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (typeof current === "string") {
        messages.push(current.toLowerCase());
        continue;
      }

      if (typeof current === "object") {
        const maybeError = current as { message?: unknown; code?: unknown; cause?: unknown };
        if (typeof maybeError.message === "string") {
          messages.push(maybeError.message.toLowerCase());
        }
        if (typeof maybeError.code === "string") {
          messages.push(maybeError.code.toLowerCase());
        }
        if (maybeError.cause !== undefined) {
          queue.push(maybeError.cause);
        }
      }
    }

    const combined = messages.join(" | ");
    const missingComprovanteColumn = (
      combined.includes("comprovante_path") ||
      combined.includes("comprovante_nome") ||
      combined.includes("comprovante_mime_type") ||
      combined.includes("comprovante_tamanho") ||
      combined.includes("comprovante_enviado_em")
    );
    if (!missingComprovanteColumn) return false;
    // Alguns drivers nao propagam `code=42703` no erro raiz.
    return combined.includes("42703") || combined.includes("does not exist");
  }

  private isMissingParcelasCompraRelationError(error: unknown): boolean {
    const messages: string[] = [];
    const queue: unknown[] = [error];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (typeof current === "string") {
        messages.push(current.toLowerCase());
        continue;
      }

      if (typeof current === "object") {
        const maybeError = current as { message?: unknown; code?: unknown; cause?: unknown };
        if (typeof maybeError.message === "string") {
          messages.push(maybeError.message.toLowerCase());
        }
        if (typeof maybeError.code === "string") {
          messages.push(maybeError.code.toLowerCase());
        }
        if (maybeError.cause !== undefined) {
          queue.push(maybeError.cause);
        }
      }
    }

    const combined = messages.join(" | ");
    const referencesParcelasCompraRelation =
      combined.includes("relation")
      && combined.includes("parcelas_compra")
      && combined.includes("does not exist");
    if (!referencesParcelasCompraRelation) return false;
    // Alguns drivers nao propagam `code=42P01` no erro raiz.
    return combined.includes("42p01") || combined.includes("relation");
  }

  private toParcelaCompraWithComprovanteDefaults(row: {
    id: string;
    userId: string;
    compraCartaoId: string;
    numero: number;
    valor: string;
    dataVencimento: string | null;
    statusCartao: string;
    dataPagamentoCartao: string | null;
    statusPessoa: string | null;
    dataPagamentoPessoa: string | null;
  }): ParcelaCompra {
    return {
      ...row,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    };
  }
  async getParcelaCompraById(id: string, userId: string) {
    try {
      const [row] = await this.database.select().from(parcelasCompra).where(
        and(eq(parcelasCompra.id, id), eq(parcelasCompra.userId, userId)),
      );
      return row;
    } catch (error) {
      if (this.isMissingParcelasCompraRelationError(error)) {
        return undefined;
      }
      if (!this.isMissingParcelasCompraComprovanteColumnsError(error)) throw error;
      const [row] = await this.database
        .select(this.parcelasCompraProjectionWithoutComprovante)
        .from(parcelasCompra)
        .where(and(eq(parcelasCompra.id, id), eq(parcelasCompra.userId, userId)));
      return row ? this.toParcelaCompraWithComprovanteDefaults(row) : undefined;
    }
  }
  async createParcelasCompraBulk(rows: InsertParcelaCompra[]) {
    if (rows.length === 0) return [];
    try {
      return await this.database.insert(parcelasCompra).values(rows).returning();
    } catch (error) {
      if (!this.isMissingParcelasCompraComprovanteColumnsError(error)) throw error;
      const created = await this.database
        .insert(parcelasCompra)
        .values(rows)
        .returning(this.parcelasCompraProjectionWithoutComprovante);
      return created.map((row: any) => this.toParcelaCompraWithComprovanteDefaults(row));
    }
  }
  async updateParcelaCompra(id: string, userId: string, data: Partial<InsertParcelaCompra>) {
    try {
      const [p] = await this.database.update(parcelasCompra).set(data).where(
        and(eq(parcelasCompra.id, id), eq(parcelasCompra.userId, userId))
      ).returning();
      return p;
    } catch (error) {
      if (!this.isMissingParcelasCompraComprovanteColumnsError(error)) throw error;
      const [p] = await this.database
        .update(parcelasCompra)
        .set(data)
        .where(and(eq(parcelasCompra.id, id), eq(parcelasCompra.userId, userId)))
        .returning(this.parcelasCompraProjectionWithoutComprovante);
      return p ? this.toParcelaCompraWithComprovanteDefaults(p) : undefined;
    }
  }
  async deleteParcelaCompra(id: string, userId: string) {
    const result = await this.database.delete(parcelasCompra).where(
      and(eq(parcelasCompra.id, id), eq(parcelasCompra.userId, userId))
    ).returning();
    return result.length > 0;
  }
  async deleteParcelasCompraBulk(compraCartaoId: string, userId: string) {
    await this.database.delete(parcelasCompra).where(
      and(eq(parcelasCompra.compraCartaoId, compraCartaoId), eq(parcelasCompra.userId, userId))
    );
  }

  async getCartaoFaturaPagamentos(userId: string) {
    return this.database
      .select()
      .from(cartaoFaturaPagamentos)
      .where(eq(cartaoFaturaPagamentos.userId, userId));
  }
  async getCartaoFaturaPagamentosByCartao(cartaoId: string, userId: string) {
    return this.database
      .select()
      .from(cartaoFaturaPagamentos)
      .where(and(eq(cartaoFaturaPagamentos.cartaoId, cartaoId), eq(cartaoFaturaPagamentos.userId, userId)));
  }
  async createCartaoFaturaPagamento(data: InsertCartaoFaturaPagamento) {
    const [created] = await this.database.insert(cartaoFaturaPagamentos).values(data).returning();
    return created;
  }
  async updateCartaoFaturaPagamento(id: string, userId: string, data: Partial<InsertCartaoFaturaPagamento>) {
    const [updated] = await this.database
      .update(cartaoFaturaPagamentos)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cartaoFaturaPagamentos.id, id), eq(cartaoFaturaPagamentos.userId, userId)))
      .returning();
    return updated;
  }

  async getRendas(userId: string) { return this.database.select().from(rendas).where(eq(rendas.userId, userId)); }
  async createRenda(data: InsertRenda) {
    const [r] = await this.database.insert(rendas).values(data).returning();
    return r;
  }
  async updateRenda(id: string, userId: string, data: Partial<InsertRenda>) {
    const [r] = await this.database.update(rendas).set(data).where(and(eq(rendas.id, id), eq(rendas.userId, userId))).returning();
    return r;
  }
  async deleteRenda(id: string, userId: string) {
    const result = await this.database.delete(rendas).where(and(eq(rendas.id, id), eq(rendas.userId, userId))).returning();
    return result.length > 0;
  }

  async getPatrimonios(userId: string) { return this.database.select().from(patrimonios).where(eq(patrimonios.userId, userId)); }
  async createPatrimonio(data: InsertPatrimonio) {
    const [p] = await this.database.insert(patrimonios).values(data).returning();
    return p;
  }
  async updatePatrimonio(id: string, userId: string, data: Partial<InsertPatrimonio>) {
    const [p] = await this.database.update(patrimonios).set(data).where(and(eq(patrimonios.id, id), eq(patrimonios.userId, userId))).returning();
    return p;
  }
  async deletePatrimonio(id: string, userId: string) {
    const result = await this.database.delete(patrimonios).where(and(eq(patrimonios.id, id), eq(patrimonios.userId, userId))).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
