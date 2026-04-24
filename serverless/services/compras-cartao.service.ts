import type { FinancialRepository } from "../repositories/financial.repository.js";
import type { ParcelaCompra } from "../../shared/schema.js";
import { parseMoney } from "../../utils/money.js";
import type {
  CompraBodyInput,
  CompraUpdateBodyInput,
} from "../validators/financial.validators.js";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency.js";
import { materializeParcelasCompraIfMissing } from "./parcelas-compra-materialization.js";
import { runFinancialTransaction } from "./transaction-utils.js";

export type DeleteCompraScope = "all_parcelas" | "single_parcela";

export type DeleteCompraImpact = {
  compraId: string;
  cartao: { id: string; nome: string } | null;
  descricao: string;
  scope: DeleteCompraScope;
  comprasRemovidas: number;
  parcelasRemovidas: number;
  valorTotalRemovido: number;
  parcelaAlvo: { id: string; numero: number; valor: number } | null;
};

export type DeleteCompraResult = {
  dryRun: boolean;
  impact: DeleteCompraImpact;
  compraRemovida: boolean;
};

type DeleteCompraWithScopeInput = {
  scope?: DeleteCompraScope;
  parcelaId?: string;
  dryRun?: boolean;
};

function toMoneyNumber(value: string | number | null | undefined): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveParcelaTarget(rows: ParcelaCompra[], parcelaId?: string): ParcelaCompra | null {
  if (!parcelaId) return null;
  return rows.find((row) => row.id === parcelaId) ?? null;
}

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
    const result = await this.deleteWithScope(id, userId, { scope: "all_parcelas" });
    if ("error" in result) return false;
    return result.compraRemovida;
  }

  async deleteWithScope(id: string, userId: string, input: DeleteCompraWithScopeInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const compra = await repository.getCompraCartao(id, userId);
      if (!compra) {
        return { error: "NOT_FOUND" as const };
      }

      const cartao = await repository.getCartao(compra.cartaoId, userId);
      let parcelas = await repository.getParcelasCompra(compra.id, userId);
      if (parcelas.length === 0) {
        await materializeParcelasCompraIfMissing(repository, compra);
        parcelas = await repository.getParcelasCompra(compra.id, userId);
      }

      const scope: DeleteCompraScope = input.scope === "single_parcela" ? "single_parcela" : "all_parcelas";
      const parcelaTarget = resolveParcelaTarget(parcelas, input.parcelaId);
      if (scope === "single_parcela" && !parcelaTarget) {
        return { error: "PARCELA_NOT_FOUND" as const };
      }

      const parcelasRemovidas = scope === "single_parcela"
        ? 1
        : (parcelas.length > 0 ? parcelas.length : Math.max(1, Number(compra.parcelas) || 1));

      const valorTotalRemovido = scope === "single_parcela"
        ? round2(toMoneyNumber(parcelaTarget?.valor))
        : round2(
          parcelas.length > 0
            ? parcelas.reduce((sum, row) => sum + toMoneyNumber(row.valor), 0)
            : toMoneyNumber(compra.valorTotal),
        );

      const compraRemovida = scope === "all_parcelas" || (scope === "single_parcela" && parcelas.length <= 1);
      const impact: DeleteCompraImpact = {
        compraId: compra.id,
        cartao: cartao ? { id: cartao.id, nome: cartao.nome } : null,
        descricao: compra.descricao,
        scope,
        comprasRemovidas: compraRemovida ? 1 : 0,
        parcelasRemovidas,
        valorTotalRemovido,
        parcelaAlvo: parcelaTarget
          ? {
            id: parcelaTarget.id,
            numero: parcelaTarget.numero,
            valor: round2(toMoneyNumber(parcelaTarget.valor)),
          }
          : null,
      };

      if (!input.dryRun) {
        if (compraRemovida) {
          await repository.deleteCompraCartao(compra.id, userId);
        } else if (parcelaTarget) {
          await repository.deleteParcelaCompra(parcelaTarget.id, userId);
          await recomputeCardPurchaseAggregate(repository, compra.id, userId);
        }
      }

      return {
        dryRun: Boolean(input.dryRun),
        impact,
        compraRemovida,
      } satisfies DeleteCompraResult;
    });
  }
}
