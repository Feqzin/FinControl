export type PessoaSortBy =
  | "nome_az"
  | "nome_za"
  | "maior_saldo"
  | "menor_saldo"
  | "maior_valor_receber"
  | "maior_valor_pagar"
  | "mais_recente"
  | "mais_antigo";

export type PessoaSortMetrics = {
  saldo: number;
  valorReceber: number;
  valorPagar: number;
};

type PessoaSortable = {
  id: string;
  nome: string;
};

type SortPessoasOptions = {
  sortBy: PessoaSortBy;
  getMetrics: (pessoaId: string) => PessoaSortMetrics;
};

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function getCreatedAtMaybe(pessoa: PessoaSortable): string | null {
  const createdAt = (pessoa as Record<string, unknown>).createdAt;
  return typeof createdAt === "string" && createdAt.length > 0 ? createdAt : null;
}

export function sortPessoasForView<TPessoa extends PessoaSortable>(
  pessoas: TPessoa[],
  options: SortPessoasOptions,
): TPessoa[] {
  const { sortBy, getMetrics } = options;

  return [...pessoas].sort((a, b) => {
    const nameA = normalizeName(a.nome);
    const nameB = normalizeName(b.nome);

    switch (sortBy) {
      case "nome_za":
        return nameB.localeCompare(nameA);
      case "maior_saldo": {
        const diff = getMetrics(b.id).saldo - getMetrics(a.id).saldo;
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "menor_saldo": {
        const diff = getMetrics(a.id).saldo - getMetrics(b.id).saldo;
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "maior_valor_receber": {
        const diff = getMetrics(b.id).valorReceber - getMetrics(a.id).valorReceber;
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "maior_valor_pagar": {
        const diff = getMetrics(b.id).valorPagar - getMetrics(a.id).valorPagar;
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "mais_recente": {
        const createdA = getCreatedAtMaybe(a);
        const createdB = getCreatedAtMaybe(b);
        const diff = toTimestampDesc(createdB) - toTimestampDesc(createdA);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "mais_antigo": {
        const createdA = getCreatedAtMaybe(a);
        const createdB = getCreatedAtMaybe(b);
        const diff = toTimestampAsc(createdA) - toTimestampAsc(createdB);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      }
      case "nome_az":
      default:
        return nameA.localeCompare(nameB);
    }
  });
}
