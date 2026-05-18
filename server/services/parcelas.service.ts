import { format } from "date-fns";
import type { FinancialRepository } from "../repositories/financial.repository";
import {
  recomputeCardPurchaseAggregate,
  recomputeDebtAggregate,
} from "./financial-aggregate-consistency";
import { runFinancialTransaction } from "./transaction-utils";
import { buildParcelasCompraRows, materializeParcelasCompraIfMissing } from "./parcelas-compra-materialization";
import {
  type AnteciparParcelasBodyInput,
  type ParcelaCompraCompetenciaUpdateBodyInput,
  type ParcelaCompraUpdateBodyInput,
  type ParcelaUpdateBodyInput,
  type ParcelasCompraBulkBodyInput,
} from "../validators/financial.validators";
import { toErrorLog, writeTechnicalLog } from "../logger";
import { resolveDueDateFromCompetencia } from "@shared/parcelas-compra-competency";

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const maybe = error as { code?: unknown; cause?: unknown };
  if (typeof maybe.code === "string" && maybe.code.trim()) return maybe.code;
  if (maybe.cause && typeof maybe.cause === "object") {
    const cause = maybe.cause as { code?: unknown };
    if (typeof cause.code === "string" && cause.code.trim()) return cause.code;
  }
  return null;
}

function extractSafeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw.slice(0, 220);
}

function isMissingParcelasCompraRelationError(error: unknown): boolean {
  const code = (extractErrorCode(error) ?? "").toLowerCase();
  const message = extractSafeErrorMessage(error).toLowerCase();
  return (
    code === "42p01"
    && message.includes("relation")
    && message.includes("parcelas_compra")
    && message.includes("does not exist")
  );
}

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
    return runFinancialTransaction(this.repository, async (repository) => {
      let operation = "getCompraCartao";
      let compra: Awaited<ReturnType<FinancialRepository["getCompraCartao"]>> | undefined;
      try {
        compra = await repository.getCompraCartao(compraId, userId);
        if (!compra) return { error: "COMPRA_NOT_FOUND" as const };

        operation = "getParcelasCompra";
        let rows = await repository.getParcelasCompra(compraId, userId);
        if (rows.length === 0) {
          operation = "materializeParcelasCompraIfMissing";
          await materializeParcelasCompraIfMissing(repository, compra);
          operation = "recomputeCardPurchaseAggregate";
          await recomputeCardPurchaseAggregate(repository, compraId, userId);
          operation = "getParcelasCompraAfterMaterialization";
          rows = await repository.getParcelasCompra(compraId, userId);
        }

        return { rows };
      } catch (error) {
        if (compra && isMissingParcelasCompraRelationError(error)) {
          writeTechnicalLog({
            event: "parcelas_compra.get_by_compra.compat_mode",
            source: "parcelas.service",
            level: "warn",
            data: {
              userId,
              compraId,
              operation,
              code: extractErrorCode(error),
              messageSafe: extractSafeErrorMessage(error),
              reason: "missing_relation_parcelas_compra",
            },
          });

          const cardCycle = await repository.getCartao(compra.cartaoId, userId);
          const rows = buildParcelasCompraRows(compra, { cardCycle }).map((row) => ({
            id: `compat-${compra!.id}-${row.numero}`,
            ...row,
            comprovantePath: null,
            comprovanteNome: null,
            comprovanteMimeType: null,
            comprovanteTamanho: null,
            comprovanteEnviadoEm: null,
          }));
          return { rows };
        }

        writeTechnicalLog({
          event: "parcelas_compra.get_by_compra.error",
          source: "parcelas.service",
          level: "error",
          data: {
            userId,
            compraId,
            operation,
            code: extractErrorCode(error),
            messageSafe: extractSafeErrorMessage(error),
            error: toErrorLog(error),
          },
        });
        throw error;
      }
    });
  }

  async updateParcelaCompra(id: string, userId: string, data: ParcelaCompraUpdateBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const updated = await repository.updateParcelaCompra(id, userId, data);
      if (!updated) return updated;

      await recomputeCardPurchaseAggregate(repository, updated.compraCartaoId, userId);
      return updated;
    });
  }

  async updateParcelaCompraCompetencia(
    id: string,
    userId: string,
    data: ParcelaCompraCompetenciaUpdateBodyInput,
  ) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const parcela = await repository.getParcelaCompraById(id, userId);
      if (!parcela) return undefined;

      const compra = await repository.getCompraCartao(parcela.compraCartaoId, userId);
      if (!compra) return undefined;

      const cartao = await repository.getCartao(compra.cartaoId, userId);
      const resolvedDueDate = resolveDueDateFromCompetencia({
        competencia: data.competencia,
        diaVencimento: cartao?.diaVencimento ?? null,
        fallbackDataVencimento: parcela.dataVencimento,
      });

      if (!resolvedDueDate) {
        const error = new Error("Competencia invalida. Use YYYY-MM.");
        (error as Error & { status?: number }).status = 400;
        throw error;
      }

      const updated = await repository.updateParcelaCompra(id, userId, {
        dataVencimento: resolvedDueDate,
      });
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
