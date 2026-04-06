import type { FinancialRepository } from "../repositories/financial.repository";
import type {
  CompraBodyInput,
  CompraUpdateBodyInput,
} from "../validators/financial.validators";

export class ComprasCartaoService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getComprasCartao(userId);
  }

  async listByCartao(cartaoId: string, userId: string) {
    return this.repository.getComprasByCartao(cartaoId, userId);
  }

  async listByPessoa(pessoaId: string, userId: string) {
    return this.repository.getComprasByPessoa(pessoaId, userId);
  }

  async create(userId: string, data: CompraBodyInput) {
    const cartao = await this.repository.getCartao(data.cartaoId, userId);
    if (!cartao) return { error: "CARTAO_NOT_FOUND" as const };

    const created = await this.repository.createCompraCartao({ ...data, userId });
    return { created };
  }

  async update(id: string, userId: string, data: CompraUpdateBodyInput) {
    if (data.cartaoId) {
      const cartao = await this.repository.getCartao(data.cartaoId, userId);
      if (!cartao) return { error: "CARTAO_NOT_FOUND" as const };
    }

    if (data.pessoaId) {
      const pessoa = await this.repository.getPessoa(data.pessoaId, userId);
      if (!pessoa) return { error: "PESSOA_NOT_FOUND" as const };
    }

    const updated = await this.repository.updateCompraCartao(id, userId, data);
    if (!updated) return { error: "NOT_FOUND" as const };

    return { updated };
  }

  async delete(id: string, userId: string) {
    return this.repository.deleteCompraCartao(id, userId);
  }
}
