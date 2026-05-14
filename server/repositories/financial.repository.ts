import type {
  InsertCompraCartao,
  InsertDivida,
  InsertParcela,
  InsertParcelaCompra,
} from "@shared/schema";
import { db } from "../db";
import { DatabaseStorage, storage, type IStorage } from "../storage";

function createFinancialRepositoryBase(targetStorage: IStorage) {
  return {
    async getPessoa(id: string, userId: string) {
      return targetStorage.getPessoa(id, userId);
    },

    async getDividas(userId: string) {
      return targetStorage.getDividas(userId);
    },

    async getDividasByPessoa(pessoaId: string, userId: string) {
      return targetStorage.getDividasByPessoa(pessoaId, userId);
    },

    async getDivida(id: string, userId: string) {
      return targetStorage.getDivida(id, userId);
    },

    async createDivida(divida: InsertDivida) {
      return targetStorage.createDivida(divida);
    },

    async updateDivida(id: string, userId: string, data: Partial<InsertDivida>) {
      return targetStorage.updateDivida(id, userId, data);
    },

    async deleteDivida(id: string, userId: string) {
      return targetStorage.deleteDivida(id, userId);
    },

    async deleteParcelasByDivida(dividaId: string, userId: string) {
      return targetStorage.deleteParcelasByDivida(dividaId, userId);
    },

    async getParcelas(userId: string) {
      return targetStorage.getParcelas(userId);
    },

    async getParcela(id: string, userId: string) {
      return targetStorage.getParcela(id, userId);
    },

    async getParcelasByDivida(dividaId: string, userId: string) {
      return targetStorage.getParcelasByDivida(dividaId, userId);
    },

    async createParcelasBulk(rows: InsertParcela[]) {
      return targetStorage.createParcelasBulk(rows);
    },

    async updateParcela(id: string, userId: string, data: Partial<InsertParcela>) {
      return targetStorage.updateParcela(id, userId, data);
    },

    async deleteParcela(id: string, userId: string) {
      return targetStorage.deleteParcela(id, userId);
    },

    async getCartao(id: string, userId: string) {
      return targetStorage.getCartao(id, userId);
    },

    async getCartoes(userId: string) {
      return targetStorage.getCartoes(userId);
    },

    async createCartao(data: Parameters<IStorage["createCartao"]>[0]) {
      return targetStorage.createCartao(data);
    },

    async updateCartao(id: string, userId: string, data: Parameters<IStorage["updateCartao"]>[2]) {
      return targetStorage.updateCartao(id, userId, data);
    },

    async deleteCartao(id: string, userId: string) {
      return targetStorage.deleteCartao(id, userId);
    },

    async getComprasCartao(userId: string) {
      return targetStorage.getComprasCartao(userId);
    },

    async getCompraCartao(id: string, userId: string) {
      return targetStorage.getCompraCartao(id, userId);
    },

    async getServicos(userId: string) {
      return targetStorage.getServicos(userId);
    },

    async getPessoas(userId: string) {
      return targetStorage.getPessoas(userId);
    },

    async getRendas(userId: string) {
      return targetStorage.getRendas(userId);
    },

    async getPatrimonios(userId: string) {
      return targetStorage.getPatrimonios(userId);
    },

    async getComprasByCartao(cartaoId: string, userId: string) {
      return targetStorage.getComprasByCartao(cartaoId, userId);
    },

    async getComprasByPessoa(pessoaId: string, userId: string) {
      return targetStorage.getComprasByPessoa(pessoaId, userId);
    },

    async createCompraCartao(data: InsertCompraCartao) {
      return targetStorage.createCompraCartao(data);
    },

    async updateCompraCartao(id: string, userId: string, data: Partial<InsertCompraCartao>) {
      return targetStorage.updateCompraCartao(id, userId, data);
    },

    async deleteCompraCartao(id: string, userId: string) {
      return targetStorage.deleteCompraCartao(id, userId);
    },

    async getParcelasCompra(compraCartaoId: string, userId: string) {
      return targetStorage.getParcelasCompra(compraCartaoId, userId);
    },

    async getParcelasCompraByUser(userId: string) {
      return targetStorage.getParcelasCompraByUser(userId);
    },

    async getParcelaCompraById(id: string, userId: string) {
      return targetStorage.getParcelaCompraById(id, userId);
    },

    async createParcelasCompraBulk(rows: InsertParcelaCompra[]) {
      return targetStorage.createParcelasCompraBulk(rows);
    },

    async updateParcelaCompra(id: string, userId: string, data: Partial<InsertParcelaCompra>) {
      return targetStorage.updateParcelaCompra(id, userId, data);
    },

    async deleteParcelaCompra(id: string, userId: string) {
      return targetStorage.deleteParcelaCompra(id, userId);
    },

    async deleteParcelasCompraBulk(compraCartaoId: string, userId: string) {
      return targetStorage.deleteParcelasCompraBulk(compraCartaoId, userId);
    },
  };
}

type FinancialRepositoryBase = ReturnType<typeof createFinancialRepositoryBase>;

export type FinancialRepository = FinancialRepositoryBase & {
  withTransaction<T>(callback: (repository: FinancialRepository) => Promise<T>): Promise<T>;
};

export function createFinancialRepository(
  targetStorage: IStorage = storage,
  transactionRunner?: <T>(callback: (repository: FinancialRepository) => Promise<T>) => Promise<T>,
): FinancialRepository {
  const base = createFinancialRepositoryBase(targetStorage);

  const repository = {
    ...base,
    async withTransaction<T>(callback: (txRepository: FinancialRepository) => Promise<T>) {
      if (transactionRunner) {
        return transactionRunner(callback);
      }

      return db.transaction(async (tx) => {
        const txStorage = new DatabaseStorage(tx);
        let txRepository!: FinancialRepository;
        txRepository = createFinancialRepository(txStorage, async (innerCallback) => innerCallback(txRepository));
        return callback(txRepository);
      });
    },
  } satisfies FinancialRepository;

  return repository;
}

export const financialRepository = createFinancialRepository(storage);
