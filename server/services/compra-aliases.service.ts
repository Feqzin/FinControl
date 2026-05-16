import type { CompraAlias } from "@shared/schema";
import type { IStorage } from "../storage";
import type { CompraAliasCreateBodyInput } from "../validators/compra-aliases.validators";

type CreateCompraAliasResult =
  | { created: CompraAlias; reusedExisting: boolean }
  | { error: "COMPRA_NOT_FOUND" }
  | { error: "CARTAO_NOT_FOUND" }
  | { error: "CARTAO_MISMATCH" };

function normalizeCompraAliasText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDecimalString(value: number | null): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return value.toFixed(2);
}

export class CompraAliasesService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string): Promise<CompraAlias[]> {
    const rows = await this.storage.getCompraAliases(userId);
    return [...rows].sort(
      (a, b) => (
        String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
        || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
      ),
    );
  }

  async create(userId: string, payload: CompraAliasCreateBodyInput): Promise<CreateCompraAliasResult> {
    const compra = await this.storage.getCompraCartao(payload.compraCartaoId, userId);
    if (!compra) return { error: "COMPRA_NOT_FOUND" };

    if (payload.cartaoId) {
      const cartao = await this.storage.getCartao(payload.cartaoId, userId);
      if (!cartao) return { error: "CARTAO_NOT_FOUND" };
      if (compra.cartaoId !== cartao.id) return { error: "CARTAO_MISMATCH" };
    }

    const normalizedImportName = normalizeCompraAliasText(payload.nomeImportado);
    const existingAliases = await this.storage.getCompraAliases(userId);
    const duplicated = existingAliases.find((alias) => (
      alias.compraCartaoId === compra.id
      && alias.nomeNormalizado === normalizedImportName
      && (alias.issuer ?? null) === (payload.issuer ?? null)
      && (alias.cardLast4 ?? null) === (payload.cardLast4 ?? null)
      && (alias.totalParcelas ?? null) === (payload.totalParcelas ?? null)
    ));

    if (duplicated) {
      return { created: duplicated, reusedExisting: true };
    }

    const created = await this.storage.createCompraAlias({
      userId,
      compraCartaoId: compra.id,
      cartaoId: payload.cartaoId ?? compra.cartaoId,
      nomeOriginal: payload.nomeOriginal ?? compra.descricao,
      nomeImportado: payload.nomeImportado,
      nomeNormalizado: normalizedImportName,
      issuer: payload.issuer ?? null,
      parserUsed: payload.parserUsed ?? null,
      cardLast4: payload.cardLast4 ?? null,
      valorParcela: toDecimalString(payload.valorParcela ?? null),
      totalParcelas: payload.totalParcelas ?? null,
    });

    return { created, reusedExisting: false };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.storage.deleteCompraAlias(id, userId);
  }
}

