import type {
  InsertCompraCartao,
  InsertDivida,
  InsertParcela,
  InsertParcelaCompra,
} from "@shared/schema";
import { storage } from "../storage";

export const financialRepository = {
  async getPessoa(id: string, userId: string) {
    return storage.getPessoa(id, userId);
  },

  async getDividas(userId: string) {
    return storage.getDividas(userId);
  },

  async getDividasByPessoa(pessoaId: string, userId: string) {
    return storage.getDividasByPessoa(pessoaId, userId);
  },

  async getDivida(id: string, userId: string) {
    return storage.getDivida(id, userId);
  },

  async createDivida(divida: InsertDivida) {
    return storage.createDivida(divida);
  },

  async updateDivida(id: string, userId: string, data: Partial<InsertDivida>) {
    return storage.updateDivida(id, userId, data);
  },

  async deleteDivida(id: string, userId: string) {
    return storage.deleteDivida(id, userId);
  },

  async deleteParcelasByDivida(dividaId: string, userId: string) {
    return storage.deleteParcelasByDivida(dividaId, userId);
  },

  async getParcelas(userId: string) {
    return storage.getParcelas(userId);
  },

  async getParcelasByDivida(dividaId: string, userId: string) {
    return storage.getParcelasByDivida(dividaId, userId);
  },

  async createParcelasBulk(rows: InsertParcela[]) {
    return storage.createParcelasBulk(rows);
  },

  async updateParcela(id: string, userId: string, data: Partial<InsertParcela>) {
    return storage.updateParcela(id, userId, data);
  },

  async deleteParcela(id: string, userId: string) {
    return storage.deleteParcela(id, userId);
  },

  async getCartao(id: string, userId: string) {
    return storage.getCartao(id, userId);
  },

  async getCartoes(userId: string) {
    return storage.getCartoes(userId);
  },

  async getComprasCartao(userId: string) {
    return storage.getComprasCartao(userId);
  },

  async getServicos(userId: string) {
    return storage.getServicos(userId);
  },

  async getRendas(userId: string) {
    return storage.getRendas(userId);
  },

  async getComprasByCartao(cartaoId: string, userId: string) {
    return storage.getComprasByCartao(cartaoId, userId);
  },

  async getComprasByPessoa(pessoaId: string, userId: string) {
    return storage.getComprasByPessoa(pessoaId, userId);
  },

  async createCompraCartao(data: InsertCompraCartao) {
    return storage.createCompraCartao(data);
  },

  async updateCompraCartao(id: string, userId: string, data: Partial<InsertCompraCartao>) {
    return storage.updateCompraCartao(id, userId, data);
  },

  async deleteCompraCartao(id: string, userId: string) {
    return storage.deleteCompraCartao(id, userId);
  },

  async getParcelasCompra(compraCartaoId: string, userId: string) {
    return storage.getParcelasCompra(compraCartaoId, userId);
  },

  async createParcelasCompraBulk(rows: InsertParcelaCompra[]) {
    return storage.createParcelasCompraBulk(rows);
  },

  async updateParcelaCompra(id: string, userId: string, data: Partial<InsertParcelaCompra>) {
    return storage.updateParcelaCompra(id, userId, data);
  },

  async deleteParcelasCompraBulk(compraCartaoId: string, userId: string) {
    return storage.deleteParcelasCompraBulk(compraCartaoId, userId);
  },
};

export type FinancialRepository = typeof financialRepository;
