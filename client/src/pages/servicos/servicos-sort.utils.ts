import type { Servico } from "@shared/schema";

export type ServicoSortBy =
  | "dia_cobranca_mais_proximo"
  | "dia_cobranca_mais_distante"
  | "nome_az"
  | "nome_za"
  | "maior_valor"
  | "menor_valor"
  | "categoria"
  | "status"
  | "mais_recente"
  | "mais_antigo";

type SortOptions = {
  sortBy: ServicoSortBy;
  referenceDay?: number;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toSafeNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toDayNumber(value: unknown): number {
  const day = Math.trunc(toSafeNumber(value));
  if (day < 1) return 1;
  if (day > 31) return 31;
  return day;
}

function getCreatedAtMaybe(servico: Servico): string | null {
  const raw = servico as Record<string, unknown>;
  const createdAt = raw.createdAt;
  if (typeof createdAt === "string" && createdAt.length > 0) return createdAt;
  const updatedAt = raw.updatedAt;
  if (typeof updatedAt === "string" && updatedAt.length > 0) return updatedAt;
  return null;
}

function toTimestampAsc(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function toTimestampDesc(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getStatusRank(status: string): number {
  const normalized = normalizeText(status);
  if (normalized === "ativo") return 0;
  if (normalized === "pausado" || normalized === "cancelado") return 1;
  return 2;
}

function getDistanceFromReference(day: number, referenceDay: number): number {
  const clampedRef = toDayNumber(referenceDay);
  const diff = (day - clampedRef + 31) % 31;
  return diff;
}

export function sortServicosForView(servicos: Servico[], options: SortOptions): Servico[] {
  if (!Array.isArray(servicos) || servicos.length === 0) {
    return [];
  }

  const { sortBy } = options;
  const referenceDay = options.referenceDay ?? new Date().getDate();

  return [...servicos].sort((a, b) => {
    const nameA = normalizeText(a.nome);
    const nameB = normalizeText(b.nome);

    switch (sortBy) {
      case "nome_za":
        return nameB.localeCompare(nameA);
      case "maior_valor": {
        const diff = toSafeNumber(b.valorMensal) - toSafeNumber(a.valorMensal);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "menor_valor": {
        const diff = toSafeNumber(a.valorMensal) - toSafeNumber(b.valorMensal);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "dia_cobranca_mais_proximo": {
        const dayA = toDayNumber(a.dataCobranca);
        const dayB = toDayNumber(b.dataCobranca);
        const distanceA = getDistanceFromReference(dayA, referenceDay);
        const distanceB = getDistanceFromReference(dayB, referenceDay);
        const diff = distanceA - distanceB;
        if (diff !== 0) return diff;
        if (dayA !== dayB) return dayA - dayB;
        return nameA.localeCompare(nameB);
      }
      case "dia_cobranca_mais_distante": {
        const dayA = toDayNumber(a.dataCobranca);
        const dayB = toDayNumber(b.dataCobranca);
        const distanceA = getDistanceFromReference(dayA, referenceDay);
        const distanceB = getDistanceFromReference(dayB, referenceDay);
        const diff = distanceB - distanceA;
        if (diff !== 0) return diff;
        if (dayA !== dayB) return dayB - dayA;
        return nameA.localeCompare(nameB);
      }
      case "categoria": {
        const categoryA = normalizeText(a.categoria);
        const categoryB = normalizeText(b.categoria);
        const diff = categoryA.localeCompare(categoryB);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "status": {
        const diff = getStatusRank(a.status) - getStatusRank(b.status);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "mais_recente": {
        const createdA = getCreatedAtMaybe(a);
        const createdB = getCreatedAtMaybe(b);
        const diff = toTimestampDesc(createdB) - toTimestampDesc(createdA);
        if (diff !== 0) return diff;
        const dayDiff = toDayNumber(b.dataCobranca) - toDayNumber(a.dataCobranca);
        if (dayDiff !== 0) return dayDiff;
        return nameA.localeCompare(nameB);
      }
      case "mais_antigo": {
        const createdA = getCreatedAtMaybe(a);
        const createdB = getCreatedAtMaybe(b);
        const diff = toTimestampAsc(createdA) - toTimestampAsc(createdB);
        if (diff !== 0) return diff;
        const dayDiff = toDayNumber(a.dataCobranca) - toDayNumber(b.dataCobranca);
        if (dayDiff !== 0) return dayDiff;
        return nameA.localeCompare(nameB);
      }
      case "nome_az":
      default:
        return nameA.localeCompare(nameB);
    }
  });
}
