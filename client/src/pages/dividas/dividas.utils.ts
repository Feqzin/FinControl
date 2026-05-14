import { isPast, parseISO } from "date-fns";
import { formatIsoDateToBR, formatCurrencyBRL } from "@/utils/formatters";
import type { Divida, Parcela } from "@shared/schema";

export const FORMAS_PAGAMENTO_DIVIDA = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
] as const;

export function formatDividaCurrency(value: number): string {
  return formatCurrencyBRL(value);
}

export function formatDividaDate(value?: string | null): string {
  return formatIsoDateToBR(value);
}

export function isOverdueDate(value?: string | null): boolean {
  if (!value) return false;
  try {
    return isPast(parseISO(`${value}T23:59:59`));
  } catch {
    return false;
  }
}

export type DividaSortBy =
  | "vencimento_mais_proximo"
  | "vencimento_mais_distante"
  | "mais_recente"
  | "mais_antigo"
  | "maior_valor"
  | "menor_valor"
  | "nome_az"
  | "nome_za"
  | "status";

export type DividaSortable = Divida & { parcelas: Parcela[] };

type SortDividasOptions = {
  sortBy: DividaSortBy;
  getPessoaNome: (pessoaId: string) => string;
  getDividaStatus: (divida: DividaSortable) => string;
  nowIsoDate?: string;
};

function toDateTimestamp(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00`);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return parsed;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toDateTimestampDesc(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00`);
  if (!Number.isFinite(parsed)) return Number.NEGATIVE_INFINITY;
  return parsed;
}

function getCreatedAtMaybe(divida: DividaSortable): string | null {
  const maybeCreatedAt = (divida as Record<string, unknown>).createdAt;
  return typeof maybeCreatedAt === "string" && maybeCreatedAt.length > 0 ? maybeCreatedAt : null;
}

function getPrimaryDueDate(divida: DividaSortable): string | null {
  if (divida.parcelas.length === 0) return divida.dataVencimento ?? null;

  const pendentesOrdenadas = divida.parcelas
    .filter((parcela) => parcela.status === "pendente")
    .sort((a, b) => (a.dataVencimento ?? "").localeCompare(b.dataVencimento ?? ""));

  if (pendentesOrdenadas.length > 0) return pendentesOrdenadas[0]?.dataVencimento ?? null;

  const todasOrdenadas = [...divida.parcelas].sort((a, b) => (a.dataVencimento ?? "").localeCompare(b.dataVencimento ?? ""));
  return todasOrdenadas[0]?.dataVencimento ?? divida.dataVencimento ?? null;
}

function getDisplayTotal(divida: DividaSortable): number {
  if (divida.parcelas.length === 0) return Number(divida.valor) || 0;
  return divida.parcelas.reduce((sum, parcela) => sum + (Number(parcela.valor) || 0), 0);
}

function getEffectiveStatusSortRank(
  divida: DividaSortable,
  getDividaStatus: (divida: DividaSortable) => string,
  nowIsoDate: string,
): number {
  const status = getDividaStatus(divida);
  if (status === "pago") return 2;

  const isVencida = divida.parcelas.length > 0
    ? divida.parcelas.some((parcela) => parcela.status === "pendente" && Boolean(parcela.dataVencimento && parcela.dataVencimento < nowIsoDate))
    : status === "pendente" && Boolean(divida.dataVencimento && divida.dataVencimento < nowIsoDate);

  return isVencida ? 0 : 1;
}

export function sortDividasForView(dividas: DividaSortable[], options: SortDividasOptions): DividaSortable[] {
  if (!Array.isArray(dividas) || dividas.length === 0) {
    return [];
  }

  const { sortBy, getPessoaNome, getDividaStatus } = options;
  const nowIsoDate = options.nowIsoDate ?? new Date().toISOString().slice(0, 10);
  const normalizedName = (pessoaId: string) => {
    try {
      return normalizeText(getPessoaNome(pessoaId));
    } catch {
      return "";
    }
  };
  const resolveStatus = (divida: DividaSortable) => {
    try {
      return getDividaStatus(divida);
    } catch {
      return "pendente";
    }
  };

  const sorted = [...dividas].sort((a, b) => {
    switch (sortBy) {
      case "vencimento_mais_distante": {
        const diff = toDateTimestampDesc(getPrimaryDueDate(b)) - toDateTimestampDesc(getPrimaryDueDate(a));
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "mais_recente": {
        const aRef = getCreatedAtMaybe(a) ?? getPrimaryDueDate(a);
        const bRef = getCreatedAtMaybe(b) ?? getPrimaryDueDate(b);
        const diff = toDateTimestampDesc(bRef) - toDateTimestampDesc(aRef);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "mais_antigo": {
        const aRef = getCreatedAtMaybe(a) ?? getPrimaryDueDate(a);
        const bRef = getCreatedAtMaybe(b) ?? getPrimaryDueDate(b);
        const diff = toDateTimestamp(aRef) - toDateTimestamp(bRef);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "maior_valor": {
        const diff = getDisplayTotal(b) - getDisplayTotal(a);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "menor_valor": {
        const diff = getDisplayTotal(a) - getDisplayTotal(b);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "nome_za":
        return normalizedName(b.pessoaId).localeCompare(normalizedName(a.pessoaId));
      case "status": {
        const diff = getEffectiveStatusSortRank(a, resolveStatus, nowIsoDate) - getEffectiveStatusSortRank(b, resolveStatus, nowIsoDate);
        if (diff !== 0) return diff;
        return toDateTimestamp(getPrimaryDueDate(a)) - toDateTimestamp(getPrimaryDueDate(b));
      }
      case "nome_az":
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      case "vencimento_mais_proximo":
      default: {
        const diff = toDateTimestamp(getPrimaryDueDate(a)) - toDateTimestamp(getPrimaryDueDate(b));
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
    }
  });

  return sorted;
}
