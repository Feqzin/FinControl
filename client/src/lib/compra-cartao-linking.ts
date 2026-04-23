import type { Cartao, CompraCartao, Pessoa } from "@shared/schema";

export type CompraCartaoCandidate = {
  compra: CompraCartao;
  cartaoNome: string;
  pessoaNomeVinculada: string | null;
  searchableText: string;
  normalizedDescricao: string;
  normalizedCartaoNome: string;
  valorParcela: number;
  valorTotal: number;
  dataCompraEpoch: number | null;
};

export type CompraCartaoSuggestionContext = {
  text?: string | null;
  value?: number | null;
  date?: string | null;
};

export type CompraCartaoSuggestion = {
  candidate: CompraCartaoCandidate;
  score: number;
};

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toMoneyTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const fixed = value.toFixed(2);
  return `${fixed} ${fixed.replace(".", ",")} ${fixed.replace(/[^\d]/g, "")}`;
}

function parseIsoDateToEpoch(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function tokenize(value: string): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  );
}

export function buildCompraCartaoCandidates(
  compras: CompraCartao[],
  cartoes: Cartao[],
  pessoas?: Pessoa[],
): CompraCartaoCandidate[] {
  const cartaoById = new Map(cartoes.map((cartao) => [cartao.id, cartao] as const));
  const pessoaById = new Map((pessoas ?? []).map((pessoa) => [pessoa.id, pessoa] as const));

  return compras
    .map((compra) => {
      const cartaoNome = cartaoById.get(compra.cartaoId)?.nome ?? "Cartão";
      const pessoaNomeVinculada = compra.pessoaId ? (pessoaById.get(compra.pessoaId)?.nome ?? null) : null;
      const normalizedDescricao = normalizeForMatch(compra.descricao ?? "");
      const normalizedCartaoNome = normalizeForMatch(cartaoNome);
      const valorParcela = Number(compra.valorParcela) || 0;
      const valorTotal = Number(compra.valorTotal) || 0;
      const dataCompra = String(compra.dataCompra ?? "");
      const searchableText = normalizeForMatch(
        [
          compra.descricao ?? "",
          cartaoNome,
          pessoaNomeVinculada ?? "",
          toMoneyTokens(valorParcela),
          toMoneyTokens(valorTotal),
          dataCompra,
        ].join(" "),
      );

      return {
        compra,
        cartaoNome,
        pessoaNomeVinculada,
        searchableText,
        normalizedDescricao,
        normalizedCartaoNome,
        valorParcela,
        valorTotal,
        dataCompraEpoch: parseIsoDateToEpoch(dataCompra),
      };
    })
    .sort((a, b) => {
      const aDate = a.dataCompraEpoch ?? 0;
      const bDate = b.dataCompraEpoch ?? 0;
      return bDate - aDate;
    });
}

export function filterCompraCartaoCandidates(
  candidates: CompraCartaoCandidate[],
  query: string,
  maxResults = 80,
): CompraCartaoCandidate[] {
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) return candidates.slice(0, maxResults);

  const filtered = candidates.filter((candidate) => candidate.searchableText.includes(normalizedQuery));
  return filtered.slice(0, maxResults);
}

export function scoreCompraCartaoCandidate(
  candidate: CompraCartaoCandidate,
  context: CompraCartaoSuggestionContext,
): number {
  let score = 0;

  const contextText = (context.text ?? "").trim();
  if (contextText) {
    const normalizedContext = normalizeForMatch(contextText);
    const desc = candidate.normalizedDescricao;
    const card = candidate.normalizedCartaoNome;

    if (desc === normalizedContext) score += 40;
    if (desc.includes(normalizedContext)) score += 22;
    if (normalizedContext.includes(desc) && desc.length >= 5) score += 16;

    for (const token of tokenize(contextText)) {
      if (desc.includes(token)) score += 12;
      else if (card.includes(token)) score += 7;
    }
  }

  const contextValue = Number(context.value);
  if (Number.isFinite(contextValue) && contextValue > 0) {
    const values = [candidate.valorParcela, candidate.valorTotal].filter((value) => value > 0);
    if (values.length > 0) {
      const minRatio = values.reduce((best, current) => {
        const ratio = Math.abs(current - contextValue) / Math.max(current, contextValue, 1);
        return Math.min(best, ratio);
      }, Number.POSITIVE_INFINITY);

      if (minRatio <= 0.03) score += 20;
      else if (minRatio <= 0.1) score += 12;
      else if (minRatio <= 0.2) score += 6;
    }
  }

  const contextDateEpoch = parseIsoDateToEpoch(context.date ?? null);
  if (contextDateEpoch && candidate.dataCompraEpoch) {
    const diffDays = Math.abs(candidate.dataCompraEpoch - contextDateEpoch) / (1000 * 60 * 60 * 24);
    if (diffDays <= 15) score += 10;
    else if (diffDays <= 45) score += 6;
    else if (diffDays <= 90) score += 3;
  }

  return score;
}

export function suggestCompraCartaoCandidates(
  candidates: CompraCartaoCandidate[],
  context: CompraCartaoSuggestionContext,
  maxSuggestions = 5,
): CompraCartaoSuggestion[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCompraCartaoCandidate(candidate, context),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.candidate.dataCompraEpoch ?? 0) - (a.candidate.dataCompraEpoch ?? 0);
    })
    .slice(0, maxSuggestions);
}
