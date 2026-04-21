import type { FinancialRepository } from "../repositories/financial.repository.js";
import type { CartaoBodyInput, CartaoUpdateBodyInput } from "../validators/financial.validators.js";

export class CartoesService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getCartoes(userId);
  }

  async create(userId: string, data: CartaoBodyInput) {
    return this.repository.createCartao({ ...data, userId });
  }

  async update(id: string, userId: string, data: CartaoUpdateBodyInput) {
    return this.repository.updateCartao(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.repository.deleteCartao(id, userId);
  }
}
