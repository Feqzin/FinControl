import type { CompraCartao, Divida, Pessoa, ServicoPessoa } from "@shared/schema";
import type { IStorage } from "../storage";
import type {
  PessoaBodyInput,
  PessoaRecoverOrphanLinksBodyInput,
  PessoaUpdateBodyInput,
} from "../validators/core-domain.validators";

export type PessoaListStatus = "active" | "removed" | "all";

export type PessoaOrphanLinksGroup = {
  orphanGroupKey: string;
  nomeSugerido: string;
  sourcePessoaId: string;
  dividasCount: number;
  linkedServicosCount: number;
  linkedComprasCount: number;
  totalAReceber: number;
  totalAPagar: number;
  exemplos: Array<{
    dividaId: string;
    descricao: string | null;
    tipo: "receber" | "pagar" | string;
    valor: string;
    status: string;
  }>;
};

export type RecoverOrphanLinksResult =
  | { error: "ORPHAN_GROUP_KEY_INVALID" }
  | { error: "TARGET_PESSOA_NOT_FOUND" }
  | { error: "TARGET_PESSOA_REMOVED" }
  | { error: "NOME_REQUIRED" }
  | { error: "ORPHAN_GROUP_NOT_FOUND" }
  | {
    pessoaId: string;
    createdPessoa: boolean;
    linkedDividasCount: number;
    linkedServicosCount: number;
    linkedComprasCount: number;
  };

export type DeletePessoaPermanentResult =
  | { error: "NOT_FOUND" }
  | { error: "PESSOA_ATIVA" }
  | { error: "PESSOA_COM_VINCULOS" }
  | { ok: true };

const ORPHAN_GROUP_KEY_PREFIX = "pessoa_id:";

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePersonName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toMoneyNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isOutstandingStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "pago" && normalized !== "cancelado";
}

function buildOrphanGroupKey(sourcePessoaId: string): string {
  return `${ORPHAN_GROUP_KEY_PREFIX}${sourcePessoaId}`;
}

function parseOrphanGroupKey(orphanGroupKey: string): string | null {
  if (!orphanGroupKey.startsWith(ORPHAN_GROUP_KEY_PREFIX)) return null;
  const sourcePessoaId = orphanGroupKey.slice(ORPHAN_GROUP_KEY_PREFIX.length).trim();
  return sourcePessoaId.length > 0 ? sourcePessoaId : null;
}

type OrphanBucket = {
  sourcePessoaId: string;
  dividas: Divida[];
  compras: CompraCartao[];
  servicoPessoas: ServicoPessoa[];
};

export class PessoasService {
  constructor(private readonly storage: IStorage) {}

  private async collectOrphanBuckets(userId: string) {
    const [pessoasAtivas, pessoasRemovidas, dividas, compras, servicoPessoas] = await Promise.all([
      this.storage.getPessoasByStatus(userId, "active"),
      this.storage.getPessoasByStatus(userId, "removed"),
      this.storage.getDividas(userId),
      this.storage.getComprasCartao(userId),
      this.storage.getServicoPessoas(userId),
    ]);

    const pessoasSet = new Set<string>([
      ...pessoasAtivas.map((pessoa) => pessoa.id),
      ...pessoasRemovidas.map((pessoa) => pessoa.id),
    ]);

    const buckets = new Map<string, OrphanBucket>();
    const ensureBucket = (sourcePessoaId: string) => {
      const existing = buckets.get(sourcePessoaId);
      if (existing) return existing;
      const created: OrphanBucket = { sourcePessoaId, dividas: [], compras: [], servicoPessoas: [] };
      buckets.set(sourcePessoaId, created);
      return created;
    };

    for (const divida of dividas) {
      const sourcePessoaId = normalizeOptionalText(divida.pessoaId);
      if (!sourcePessoaId || pessoasSet.has(sourcePessoaId)) continue;
      ensureBucket(sourcePessoaId).dividas.push(divida);
    }

    for (const compra of compras) {
      const sourcePessoaId = normalizeOptionalText(compra.pessoaId);
      if (!sourcePessoaId || pessoasSet.has(sourcePessoaId)) continue;
      ensureBucket(sourcePessoaId).compras.push(compra);
    }

    for (const servicoPessoa of servicoPessoas) {
      const sourcePessoaId = normalizeOptionalText(servicoPessoa.pessoaId);
      if (!sourcePessoaId || pessoasSet.has(sourcePessoaId)) continue;
      ensureBucket(sourcePessoaId).servicoPessoas.push(servicoPessoa);
    }

    return buckets;
  }

  async list(userId: string, status: PessoaListStatus = "active") {
    return this.storage.getPessoasByStatus(userId, status);
  }

  async create(userId: string, data: PessoaBodyInput) {
    return this.storage.createPessoa({ ...data, userId });
  }

  async update(id: string, userId: string, data: PessoaUpdateBodyInput) {
    return this.storage.updatePessoa(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.storage.deletePessoa(id, userId);
  }

  async restore(id: string, userId: string) {
    return this.storage.restorePessoa(id, userId);
  }

  async deletePermanent(id: string, userId: string): Promise<DeletePessoaPermanentResult> {
    const pessoa = await this.storage.getPessoa(id, userId);
    if (!pessoa) return { error: "NOT_FOUND" };
    if (!pessoa.deletedAt) return { error: "PESSOA_ATIVA" };

    const [dividas, compras, servicoPessoas, saldoMovimentacoes] = await Promise.all([
      this.storage.getDividasByStatus(userId, "all"),
      this.storage.getComprasByPessoa(id, userId),
      this.storage.getServicoPessoasByPessoa(id, userId),
      this.storage.getPessoaSaldoMovimentacoesByPessoa(id, userId),
    ]);

    const dividasVinculadas = dividas.filter((divida) => divida.pessoaId === id);
    if (dividasVinculadas.length > 0 || compras.length > 0 || servicoPessoas.length > 0 || saldoMovimentacoes.length > 0) {
      return { error: "PESSOA_COM_VINCULOS" };
    }

    const deleted = await this.storage.deletePessoaPermanent(id, userId);
    if (!deleted) return { error: "NOT_FOUND" };
    return { ok: true };
  }

  async listOrphanLinks(userId: string): Promise<PessoaOrphanLinksGroup[]> {
    const buckets = await this.collectOrphanBuckets(userId);
    const groups: PessoaOrphanLinksGroup[] = [];

    for (const bucket of Array.from(buckets.values())) {
      const totalAReceber = round2(bucket.dividas.reduce((sum: number, divida: Divida) => (
        sum + (divida.tipo === "receber" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
      ), 0));

      const totalAPagar = round2(bucket.dividas.reduce((sum: number, divida: Divida) => (
        sum + (divida.tipo === "pagar" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
      ), 0));

      groups.push({
        orphanGroupKey: buildOrphanGroupKey(bucket.sourcePessoaId),
        nomeSugerido: `Pessoa removida (${bucket.sourcePessoaId.slice(0, 8)})`,
        sourcePessoaId: bucket.sourcePessoaId,
        dividasCount: bucket.dividas.length,
        linkedServicosCount: bucket.servicoPessoas.length,
        linkedComprasCount: bucket.compras.length,
        totalAReceber,
        totalAPagar,
        exemplos: bucket.dividas.slice(0, 3).map((divida: Divida) => ({
          dividaId: divida.id,
          descricao: normalizeOptionalText(divida.descricao),
          tipo: divida.tipo,
          valor: String(divida.valor),
          status: String(divida.status),
        })),
      });
    }

    return groups.sort((a, b) => {
      const totalA = a.totalAReceber + a.totalAPagar;
      const totalB = b.totalAReceber + b.totalAPagar;
      if (totalB !== totalA) return totalB - totalA;
      return a.nomeSugerido.localeCompare(b.nomeSugerido, "pt-BR");
    });
  }

  async recoverOrphanLinks(
    userId: string,
    data: PessoaRecoverOrphanLinksBodyInput,
  ): Promise<RecoverOrphanLinksResult> {
    const sourcePessoaId = parseOrphanGroupKey(data.orphanGroupKey);
    if (!sourcePessoaId) return { error: "ORPHAN_GROUP_KEY_INVALID" };

    const buckets = await this.collectOrphanBuckets(userId);
    const bucket = buckets.get(sourcePessoaId);
    const hasOrphanLinks = Boolean(bucket) && (
      (bucket?.dividas.length ?? 0)
      + (bucket?.compras.length ?? 0)
      + (bucket?.servicoPessoas.length ?? 0)
    ) > 0;

    const requestedPessoaId = normalizeOptionalText(data.pessoaIdExistente);
    let targetPessoa: Pessoa | undefined;
    let createdPessoa = false;

    if (requestedPessoaId) {
      targetPessoa = await this.storage.getPessoa(requestedPessoaId, userId);
      if (!targetPessoa) return { error: "TARGET_PESSOA_NOT_FOUND" };
      if (targetPessoa.deletedAt) return { error: "TARGET_PESSOA_REMOVED" };

      if (!hasOrphanLinks) {
        return {
          pessoaId: targetPessoa.id,
          createdPessoa: false,
          linkedDividasCount: 0,
          linkedServicosCount: 0,
          linkedComprasCount: 0,
        };
      }
    } else {
      if (!hasOrphanLinks) return { error: "ORPHAN_GROUP_NOT_FOUND" };

      const nome = normalizeOptionalText(data.nome);
      if (!nome) return { error: "NOME_REQUIRED" };

      const pessoasAtivas = await this.storage.getPessoasByStatus(userId, "active");
      targetPessoa = pessoasAtivas.find((pessoa) => normalizePersonName(pessoa.nome) === normalizePersonName(nome));

      if (!targetPessoa) {
        const totalAReceber = bucket?.dividas.reduce((sum, divida) => (
          sum + (divida.tipo === "receber" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
        ), 0) ?? 0;

        const totalAPagar = bucket?.dividas.reduce((sum, divida) => (
          sum + (divida.tipo === "pagar" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
        ), 0) ?? 0;

        const tipo: PessoaBodyInput["tipo"] = totalAPagar > totalAReceber ? "eu_devo" : "me_deve";
        targetPessoa = await this.storage.createPessoa({
          userId,
          nome,
          tipo,
          telefone: null,
          observacao: null,
        });
        createdPessoa = true;
      }
    }

    if (!targetPessoa) return { error: "TARGET_PESSOA_NOT_FOUND" };
    if (!hasOrphanLinks || !bucket) {
      return {
        pessoaId: targetPessoa.id,
        createdPessoa,
        linkedDividasCount: 0,
        linkedServicosCount: 0,
        linkedComprasCount: 0,
      };
    }

    let linkedDividasCount = 0;
    let linkedServicosCount = 0;
    let linkedComprasCount = 0;

    for (const divida of bucket.dividas) {
      const updated = await this.storage.updateDivida(divida.id, userId, { pessoaId: targetPessoa.id });
      if (updated) linkedDividasCount += 1;
    }

    for (const compra of bucket.compras) {
      const updated = await this.storage.updateCompraCartao(compra.id, userId, { pessoaId: targetPessoa.id });
      if (updated) linkedComprasCount += 1;
    }

    for (const servicoPessoa of bucket.servicoPessoas) {
      const updated = await this.storage.updateServicoPessoa(servicoPessoa.id, userId, { pessoaId: targetPessoa.id });
      if (updated) linkedServicosCount += 1;
    }

    return {
      pessoaId: targetPessoa.id,
      createdPessoa,
      linkedDividasCount,
      linkedServicosCount,
      linkedComprasCount,
    };
  }
}
