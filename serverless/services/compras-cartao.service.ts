import type { FinancialRepository } from "../repositories/financial.repository.js";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { userIconLibrary, type ParcelaCompra } from "../../shared/schema.js";
import { isRemoteIconReference } from "../../shared/icon-persistence.js";
import { formatMoneyFixed, parseMoney } from "../../utils/money.js";
import type {
  CompraBodyInput,
  CompraUpdateBodyInput,
} from "../validators/financial.validators.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency.js";
import {
  materializeParcelasCompraIfMissing,
  syncMaterializedParcelasAfterCompraUpdate,
} from "./parcelas-compra-materialization.js";
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

type ReembolsoModo = "total" | "metade" | "valor_custom" | "percentual_custom";

type ReembolsoPatch = {
  pessoaId: string | null;
  statusPessoa: string | null;
  dataPagamentoPessoa: string | null;
  reembolsoModo: ReembolsoModo | null;
  reembolsoValorTotal: string | null;
  reembolsoPercentual: string | null;
};

type ReembolsoNormalizationResult =
  | { ok: true; patch: ReembolsoPatch }
  | { ok: false; message: string };

type DeleteCompraWithScopeInput = {
  scope?: DeleteCompraScope;
  parcelaId?: string;
  dryRun?: boolean;
};

function toMoneyNumberOrZero(value: string | number | null | undefined): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveParcelaTarget(rows: ParcelaCompra[], parcelaId?: string): ParcelaCompra | null {
  if (!parcelaId) return null;
  return rows.find((row) => row.id === parcelaId) ?? null;
}

function normalizePessoaId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalIconId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHOULD_LOG_ICON_UPDATE_DEBUG = process.env.NODE_ENV !== "production";

type IconUpdateFailureReason =
  | "ICON_TABLE_MISSING"
  | "ICON_COLUMN_MISSING"
  | "ICON_PERSISTENCE_FAILED";

function sanitizeIconIdForLog(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return String(value);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^data:/i.test(trimmed)) return "[DATA_URL]";
  return trimmed.slice(0, 160);
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.trim().length > 0) return code.trim();
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && causeCode.trim().length > 0) return causeCode.trim();
  }
  return null;
}

function classifyIconPersistenceError(error: unknown): {
  reason: IconUpdateFailureReason;
  message: string;
} | null {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (code === "42P01") {
    if (message.includes("user_icon_library")) {
      return {
        reason: "ICON_TABLE_MISSING",
        message: "Não foi possível validar o ícone manual porque a tabela user_icon_library não está disponível.",
      };
    }
    if (message.includes("compras_cartao")) {
      return {
        reason: "ICON_TABLE_MISSING",
        message: "Não foi possível salvar o ícone manual porque a tabela compras_cartao não está disponível.",
      };
    }
  }

  if (code === "42703") {
    if (message.includes("icone_id")) {
      return {
        reason: "ICON_COLUMN_MISSING",
        message: "Não foi possível salvar o ícone manual porque a coluna compras_cartao.icone_id não está disponível.",
      };
    }
    if (message.includes("image_url")) {
      return {
        reason: "ICON_COLUMN_MISSING",
        message: "Não foi possível validar o ícone manual porque a coluna user_icon_library.image_url não está disponível.",
      };
    }
  }

  if (message.includes("icone_id") || message.includes("user_icon_library")) {
    return {
      reason: "ICON_PERSISTENCE_FAILED",
      message: "Não foi possível salvar o ícone manual da compra agora. Tente novamente em instantes.",
    };
  }

  return null;
}

async function findOwnedUserIconByIdOrUrl(
  userId: string,
  iconReference: string,
): Promise<{ id: string; imageUrl: string } | null> {
  const trimmedReference = iconReference.trim();
  if (!trimmedReference) return null;

  const [byId] = await db
    .select({ id: userIconLibrary.id, imageUrl: userIconLibrary.imageUrl })
    .from(userIconLibrary)
    .where(and(
      eq(userIconLibrary.userId, userId),
      eq(userIconLibrary.id, trimmedReference),
    ))
    .limit(1);
  if (byId) return byId;

  return null;
}

async function resolveCompraIconForPersistence(
  userId: string,
  iconId: string | null,
): Promise<
  | { ok: true; persistedIconId: string | null }
  | { ok: false; reason: "INVALID_ICON_ID_REFERENCE" | "ICON_OWNERSHIP_INVALID" }
> {
  if (iconId == null) {
    return { ok: true, persistedIconId: null };
  }

  if (isRemoteIconReference(iconId)) {
    return { ok: false, reason: "INVALID_ICON_ID_REFERENCE" };
  }

  if (!UUID_LIKE_PATTERN.test(iconId)) {
    // Biblioteca padrão/global (ex.: netflix, nubank, etc).
    return { ok: true, persistedIconId: iconId };
  }

  const ownedById = await findOwnedUserIconByIdOrUrl(userId, iconId);
  if (ownedById) {
    return { ok: true, persistedIconId: ownedById.id };
  }

  return { ok: false, reason: "ICON_OWNERSHIP_INVALID" };
}

async function hydrateCompraIconIdsForOutput<T extends { iconeId?: string | null }>(
  userId: string,
  compras: T[],
): Promise<T[]> {
  const iconIdsToResolve = Array.from(
    new Set(
      compras
        .map((compra) => (typeof compra.iconeId === "string" ? compra.iconeId.trim() : ""))
        .filter((iconId) => UUID_LIKE_PATTERN.test(iconId)),
    ),
  );

  if (iconIdsToResolve.length === 0) {
    return compras;
  }

  const rows = await db
    .select({ id: userIconLibrary.id, imageUrl: userIconLibrary.imageUrl })
    .from(userIconLibrary)
    .where(and(
      eq(userIconLibrary.userId, userId),
      inArray(userIconLibrary.id, iconIdsToResolve),
    ));

  if (rows.length === 0) {
    return compras;
  }

  const imageUrlById = new Map(rows.map((row) => [row.id, row.imageUrl]));
  return compras.map((compra) => {
    const iconId = typeof compra.iconeId === "string" ? compra.iconeId.trim() : "";
    if (!iconId) return compra;
    const mappedImageUrl = imageUrlById.get(iconId);
    if (!mappedImageUrl) return compra;
    return { ...compra, iconeId: mappedImageUrl };
  });
}

function normalizePercentualFixed(value: number): string {
  return value.toFixed(4);
}

function toNullableMoneyNumber(value: string | number | null | undefined): number | null {
  const parsed = parseMoney(value);
  return parsed == null ? null : Number(parsed.toFixed(2));
}

function resolveDefaultStatus(statusValue: string | null | undefined): string {
  const trimmed = typeof statusValue === "string" ? statusValue.trim() : "";
  return trimmed.length > 0 ? trimmed : "pendente";
}

function normalizeReembolsoFields(params: {
  pessoaId: string | null;
  statusPessoa: string | null | undefined;
  dataPagamentoPessoa: string | null | undefined;
  reembolsoModo: ReembolsoModo | null | undefined;
  reembolsoValorTotal: number | null | undefined;
  reembolsoPercentual: number | null | undefined;
  valorTotalCompra: number | null;
}): ReembolsoNormalizationResult {
  const {
    pessoaId,
    statusPessoa,
    dataPagamentoPessoa,
    reembolsoModo,
    reembolsoValorTotal,
    reembolsoPercentual,
    valorTotalCompra,
  } = params;

  if (!pessoaId) {
    return {
      ok: true,
      patch: {
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
        reembolsoModo: null,
        reembolsoValorTotal: null,
        reembolsoPercentual: null,
      },
    };
  }

  if (valorTotalCompra == null || !Number.isFinite(valorTotalCompra) || valorTotalCompra <= 0) {
    return { ok: false, message: "Valor total da compra invalido para calcular reembolso" };
  }

  const mode: ReembolsoModo = reembolsoModo ?? "total";

  if (mode === "valor_custom") {
    if (reembolsoValorTotal == null || !Number.isFinite(reembolsoValorTotal)) {
      return { ok: false, message: "Informe o valor personalizado de reembolso" };
    }
    if (reembolsoValorTotal < 0) {
      return { ok: false, message: "Valor personalizado de reembolso deve ser maior ou igual a zero" };
    }
    if (reembolsoValorTotal > valorTotalCompra) {
      return { ok: false, message: "Valor personalizado de reembolso nao pode ser maior que o valor total da compra" };
    }

    const fixedValor = formatMoneyFixed(reembolsoValorTotal);
    if (!fixedValor) {
      return { ok: false, message: "Valor personalizado de reembolso invalido" };
    }

    return {
      ok: true,
      patch: {
        pessoaId,
        statusPessoa: resolveDefaultStatus(statusPessoa),
        dataPagamentoPessoa: dataPagamentoPessoa ?? null,
        reembolsoModo: mode,
        reembolsoValorTotal: fixedValor,
        reembolsoPercentual: null,
      },
    };
  }

  if (mode === "percentual_custom") {
    if (reembolsoPercentual == null || !Number.isFinite(reembolsoPercentual)) {
      return { ok: false, message: "Informe o percentual personalizado de reembolso" };
    }
    if (reembolsoPercentual < 0 || reembolsoPercentual > 100) {
      return { ok: false, message: "Percentual personalizado de reembolso deve ficar entre 0 e 100" };
    }

    return {
      ok: true,
      patch: {
        pessoaId,
        statusPessoa: resolveDefaultStatus(statusPessoa),
        dataPagamentoPessoa: dataPagamentoPessoa ?? null,
        reembolsoModo: mode,
        reembolsoValorTotal: null,
        reembolsoPercentual: normalizePercentualFixed(reembolsoPercentual),
      },
    };
  }

  return {
    ok: true,
    patch: {
      pessoaId,
      statusPessoa: resolveDefaultStatus(statusPessoa),
      dataPagamentoPessoa: dataPagamentoPessoa ?? null,
      reembolsoModo: mode,
      reembolsoValorTotal: null,
      reembolsoPercentual: null,
    },
  };
}

export class ComprasCartaoService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    const compras = await this.repository.getComprasCartao(userId);
    return hydrateCompraIconIdsForOutput(userId, compras);
  }

  async listByCartao(cartaoId: string, userId: string) {
    const compras = await this.repository.getComprasByCartao(cartaoId, userId);
    return hydrateCompraIconIdsForOutput(userId, compras);
  }

  async listByPessoa(pessoaId: string, userId: string) {
    const compras = await this.repository.getComprasByPessoa(pessoaId, userId);
    return hydrateCompraIconIdsForOutput(userId, compras);
  }

  async create(userId: string, data: CompraBodyInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const cartao = await repository.getCartao(data.cartaoId, userId);
      if (!cartao) return { error: "CARTAO_NOT_FOUND" as const };
      const pessoaId = normalizePessoaId(data.pessoaId);
      const iconeId = normalizeOptionalIconId(data.iconeId);
      if (pessoaId) {
        const pessoa = await repository.getPessoa(pessoaId, userId);
        if (!pessoa) return { error: "PESSOA_NOT_FOUND" as const };
      }
      const iconResolution = await resolveCompraIconForPersistence(userId, iconeId);
      if (!iconResolution.ok) {
        return {
          error: iconResolution.reason === "INVALID_ICON_ID_REFERENCE"
            ? ("ICONE_INVALID_REFERENCE" as const)
            : ("ICONE_NOT_FOUND" as const),
        };
      }

      const normalized = normalizeReembolsoFields({
        pessoaId,
        statusPessoa: pessoaId ? "pendente" : null,
        dataPagamentoPessoa: null,
        reembolsoModo: data.reembolsoModo ?? undefined,
        reembolsoValorTotal: data.reembolsoValorTotal ?? undefined,
        reembolsoPercentual: data.reembolsoPercentual ?? undefined,
        valorTotalCompra: toNullableMoneyNumber(data.valorTotal),
      });
      if (!normalized.ok) {
        return { error: "REEMBOLSO_INVALIDO" as const, message: normalized.message };
      }

      const created = await repository.createCompraCartao({
        ...data,
        userId,
        iconeId: iconResolution.persistedIconId,
        ...normalized.patch,
      });
      await materializeParcelasCompraIfMissing(repository, created);
      await recomputeCardPurchaseAggregate(repository, created.id, userId);
      const [createdHydrated] = await hydrateCompraIconIdsForOutput(userId, [created]);
      return { created: createdHydrated ?? created };
    });
  }

  async update(id: string, userId: string, data: CompraUpdateBodyInput) {
    const hasIconeOverride = data.iconeId !== undefined;
    try {
      return await runFinancialTransaction(this.repository, async (repository) => {
        const currentCompra = await repository.getCompraCartao(id, userId);
        if (!currentCompra) return { error: "NOT_FOUND" as const };

        if (data.cartaoId) {
          const cartao = await repository.getCartao(data.cartaoId, userId);
          if (!cartao) return { error: "CARTAO_NOT_FOUND" as const };
        }

        const requestedPessoaId = data.pessoaId === undefined
          ? currentCompra.pessoaId
          : normalizePessoaId(data.pessoaId);

        if (requestedPessoaId) {
          const pessoa = await repository.getPessoa(requestedPessoaId, userId);
          if (!pessoa) return { error: "PESSOA_NOT_FOUND" as const };
        }

        const nextIconeId = hasIconeOverride ? normalizeOptionalIconId(data.iconeId) : undefined;
        let persistedIconeId: string | null | undefined = undefined;
        if (hasIconeOverride) {
          const iconResolution = await resolveCompraIconForPersistence(userId, nextIconeId ?? null);
          if (!iconResolution.ok) {
            return {
              error: iconResolution.reason === "INVALID_ICON_ID_REFERENCE"
                ? ("ICONE_INVALID_REFERENCE" as const)
                : ("ICONE_NOT_FOUND" as const),
            };
          }
          persistedIconeId = iconResolution.persistedIconId;
          if (SHOULD_LOG_ICON_UPDATE_DEBUG) {
            writeTechnicalLog({
              event: "compras_cartao.icon_update.received",
              source: "compras-cartao.service",
              level: "info",
              data: {
                userId,
                compraId: id,
                receivedKeys: Object.keys(data),
                receivedIconId: sanitizeIconIdForLog(data.iconeId),
                isDataUrlIconId: typeof data.iconeId === "string" ? data.iconeId.startsWith("data:") : false,
                isHttpIconId: typeof data.iconeId === "string"
                  ? (data.iconeId.startsWith("http://") || data.iconeId.startsWith("https://"))
                  : false,
                resolvedPersistableIconId: sanitizeIconIdForLog(persistedIconeId),
              },
            });
          }
        }

        const effectiveValorTotal = data.valorTotal ?? currentCompra.valorTotal;
        const effectiveReembolsoModo = data.reembolsoModo === undefined
          ? ((currentCompra.reembolsoModo as ReembolsoModo | null | undefined) ?? null)
          : (data.reembolsoModo ?? null);
        const effectiveReembolsoValorTotal = data.reembolsoValorTotal === undefined
          ? toNullableMoneyNumber(currentCompra.reembolsoValorTotal ?? null)
          : data.reembolsoValorTotal;
        const effectiveReembolsoPercentual = data.reembolsoPercentual === undefined
          ? toNullableMoneyNumber(currentCompra.reembolsoPercentual ?? null)
          : data.reembolsoPercentual;

        const normalized = normalizeReembolsoFields({
          pessoaId: requestedPessoaId,
          statusPessoa: data.statusPessoa === undefined
            ? currentCompra.statusPessoa
            : data.statusPessoa,
          dataPagamentoPessoa: data.dataPagamentoPessoa === undefined
            ? currentCompra.dataPagamentoPessoa
            : data.dataPagamentoPessoa,
          reembolsoModo: effectiveReembolsoModo,
          reembolsoValorTotal: effectiveReembolsoValorTotal,
          reembolsoPercentual: effectiveReembolsoPercentual,
          valorTotalCompra: toNullableMoneyNumber(effectiveValorTotal),
        });
        if (!normalized.ok) {
          return { error: "REEMBOLSO_INVALIDO" as const, message: normalized.message };
        }

        const updatePayload = {
          ...data,
          ...(hasIconeOverride ? { iconeId: persistedIconeId } : {}),
          ...normalized.patch,
        };

        const updated = await repository.updateCompraCartao(id, userId, updatePayload);
        if (!updated) return { error: "NOT_FOUND" as const };
        // Fluxo explicito para registros legados sem cronograma materializado.
        await syncMaterializedParcelasAfterCompraUpdate(repository, updated);
        await recomputeCardPurchaseAggregate(repository, updated.id, userId);
        const refreshed = await repository.getCompraCartao(updated.id, userId);
        if (!refreshed) return { error: "NOT_FOUND" as const };

        const [hydrated] = await hydrateCompraIconIdsForOutput(userId, [refreshed]);
        return { updated: hydrated ?? refreshed };
      });
    } catch (error) {
      if (!hasIconeOverride) throw error;
      writeTechnicalLog({
        event: "compras_cartao.icon_update.error",
        source: "compras-cartao.service",
        level: "error",
        data: {
          userId,
          compraId: id,
          receivedIconId: sanitizeIconIdForLog(data.iconeId),
          receivedIconIdLength: typeof data.iconeId === "string" ? data.iconeId.length : null,
          isDataUrlIconId: typeof data.iconeId === "string" ? data.iconeId.startsWith("data:") : false,
          isHttpIconId: typeof data.iconeId === "string"
            ? (data.iconeId.startsWith("http://") || data.iconeId.startsWith("https://"))
            : false,
          iconKind: typeof data.iconeId === "string"
            ? (data.iconeId.startsWith("data:")
              ? "data_url"
              : (data.iconeId.startsWith("http://") || data.iconeId.startsWith("https://"))
                ? "remote_url"
                : "library_key")
            : (data.iconeId === null ? "null" : "undefined"),
          error: toErrorLog(error),
        },
      });

      const iconPersistenceFailure = classifyIconPersistenceError(error);
      if (iconPersistenceFailure) {
        return {
          error: "ICONE_UPDATE_ERROR" as const,
          reason: iconPersistenceFailure.reason,
          message: iconPersistenceFailure.message,
        };
      }

      throw error;
    }
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
        ? round2(toMoneyNumberOrZero(parcelaTarget?.valor))
        : round2(
          parcelas.length > 0
            ? parcelas.reduce((sum, row) => sum + toMoneyNumberOrZero(row.valor), 0)
            : toMoneyNumberOrZero(compra.valorTotal),
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
            valor: round2(toMoneyNumberOrZero(parcelaTarget.valor)),
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
