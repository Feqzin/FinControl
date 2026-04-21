import type { FinancialRepository } from "../repositories/financial.repository.js";
import type {
  CompraBodyInput,
  CompraUpdateBodyInput,
} from "../validators/financial.validators.js";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency.js";
import { materializeParcelasCompraIfMissing } from "./parcelas-compra-materialization.js";
import { runFinancialTransaction } from "./transaction-utils.js";

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
    return runFinancialTransaction(this.repository, async (repository) => {
      const cartao = await repository.getCartao(data.cartaoId, userId);
      if (!cartao) return { error: "CARTAO_NOT_FOUND" as const };

      const created = await repository.createCompraCartao({ ...data, userId });
      await materializeParcelasCompraIfMissing(repository, created);
      await recomputeCardPurchaseAggregate(repository, created.id, userId);
      return { created };
    });
  }

  async update(id: string, userId: string, data: CompraUpdateBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      if (data.cartaoId) {
        const cartao = await repository.getCartao(data.cartaoId, userId);
        if (!cartao) return { error: "CARTAO_NOT_FOUND" as const };
      }

      if (data.pessoaId) {
        const pessoa = await repository.getPessoa(data.pessoaId, userId);
        if (!pessoa) return { error: "PESSOA_NOT_FOUND" as const };
      }

      const updated = await repository.updateCompraCartao(id, userId, data);
      if (!updated) return { error: "NOT_FOUND" as const };
      // Fluxo explicito para registros legados sem cronograma materializado.
      await materializeParcelasCompraIfMissing(repository, updated);
      await recomputeCardPurchaseAggregate(repository, updated.id, userId);
      const refreshed = await repository.getCompraCartao(updated.id, userId);
      if (!refreshed) return { error: "NOT_FOUND" as const };

      return { updated: refreshed };
    });
  }

  async delete(id: string, userId: string) {
    return this.repository.deleteCompraCartao(id, userId);
  }
}
