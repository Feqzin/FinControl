import { format } from "date-fns";
import type { FinancialRepository } from "../repositories/financial.repository.js";
import {
  recomputeCardPurchaseAggregate,
  recomputeDebtAggregate,
} from "./financial-aggregate-consistency.js";
import { runFinancialTransaction } from "./transaction-utils.js";
import {
  type AnteciparParcelasBodyInput,
  type ParcelaCompraUpdateBodyInput,
  type ParcelaUpdateBodyInput,
  type ParcelasCompraBulkBodyInput,
} from "../validators/financial.validators.js";

export class ParcelasService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getParcelas(userId);
  }

  async listByDivida(dividaId: string, userId: string) {
    const rows = await this.repository.getParcelasByDivida(dividaId, userId);
    return rows.sort((a, b) => a.numero - b.numero);
  }

  async update(id: string, userId: string, data: ParcelaUpdateBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const updated = await repository.updateParcela(id, userId, data);
      if (!updated) return updated;

      await recomputeDebtAggregate(repository, updated.dividaId, userId);
      return updated;
    });
  }

  async antecipar(userId: string, data: AnteciparParcelasBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const { dividaId, quantidade, formaPagamento } = data;
      const all = await repository.getParcelasByDivida(dividaId, userId);
      const pendentes = all
        .filter((p) => p.status === "pendente")
        .sort((a, b) => a.numero - b.numero)
        .slice(0, quantidade);
      const hoje = format(new Date(), "yyyy-MM-dd");

      const updated = await Promise.all(
        pendentes.map((p) => repository.updateParcela(p.id, userId, {
          status: "pago",
          dataPagamento: hoje,
          formaPagamento: formaPagamento || "pix",
        })),
      );

      const aggregate = await recomputeDebtAggregate(repository, dividaId, userId);
      const todasPagas = aggregate.persistedStatus === "pago";

      return {
        dividaId,
        quantidadeSolicitada: quantidade,
        quantidadeAtualizada: updated.length,
        formaPagamento: formaPagamento || "pix",
        dataPagamento: hoje,
        todasPagas,
      };
    });
  }

  async delete(id: string, userId: string) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const current = await repository.getParcela(id, userId);
      const deleted = await repository.deleteParcela(id, userId);
      if (deleted && current) {
        await recomputeDebtAggregate(repository, current.dividaId, userId);
      }
      return deleted;
    });
  }

  async listParcelasCompra(compraId: string, userId: string) {
    const compra = await this.repository.getCompraCartao(compraId, userId);
    if (!compra) return { error: "COMPRA_NOT_FOUND" as const };
    const rows = await this.repository.getParcelasCompra(compraId, userId);
    return { rows };
  }

  async updateParcelaCompra(id: string, userId: string, data: ParcelaCompraUpdateBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const updated = await repository.updateParcelaCompra(id, userId, data);
      if (!updated) return updated;

      await recomputeCardPurchaseAggregate(repository, updated.compraCartaoId, userId);
      return updated;
    });
  }

  async replaceParcelasCompraBulk(userId: string, data: ParcelasCompraBulkBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const { compraCartaoId, parcelas } = data;
      const compra = await repository.getCompraCartao(compraCartaoId, userId);
      if (!compra) return { error: "COMPRA_NOT_FOUND" as const };

      await repository.deleteParcelasCompraBulk(compraCartaoId, userId);
      const created = await repository.createParcelasCompraBulk(
        parcelas.map((row) => ({ ...row, userId, compraCartaoId })),
      );
      await recomputeCardPurchaseAggregate(repository, compraCartaoId, userId);
      return { created };
    });
  }
}
