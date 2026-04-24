import type { Cartao } from "@shared/schema";

type CardIssuer = "nubank" | "itau" | "mercado_pago";

type IssuerConfig = {
  label: string;
  sourceKeywords: string[];
  cardKeywords: string[];
};

export type ImportCardSuggestion =
  | { kind: "single_match"; issuer: CardIssuer; issuerLabel: string; card: Cartao }
  | { kind: "multiple_cards"; issuer: CardIssuer; issuerLabel: string; cards: Cartao[] }
  | { kind: "issuer_without_card"; issuer: CardIssuer; issuerLabel: string }
  | { kind: "multiple_issuers"; issuerLabels: string[] }
  | { kind: "no_issuer" };

const ISSUER_CONFIG: Record<CardIssuer, IssuerConfig> = {
  nubank: {
    label: "Nubank",
    sourceKeywords: ["nubank", "nu cartao"],
    cardKeywords: ["nubank", "nu "],
  },
  itau: {
    label: "Itaú",
    sourceKeywords: ["itau", "itaú", "itaucard", "itaúcard"],
    cardKeywords: ["itau", "itaú", "itaucard", "itaúcard"],
  },
  mercado_pago: {
    label: "Mercado Pago",
    sourceKeywords: ["mercado pago", "mercadopago", "mercado-pago", "mp card", "cartao mp"],
    cardKeywords: ["mercado pago", "mercadopago", "mp "],
  },
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectIssuers(sourceText: string): CardIssuer[] {
  const normalized = normalizeText(sourceText);
  return (Object.entries(ISSUER_CONFIG) as Array<[CardIssuer, IssuerConfig]>)
    .filter(([, config]) => config.sourceKeywords.some((keyword) => normalized.includes(normalizeText(keyword))))
    .map(([issuer]) => issuer);
}

function findCardsByIssuer(cards: Cartao[], issuer: CardIssuer): Cartao[] {
  const config = ISSUER_CONFIG[issuer];
  return cards.filter((card) => {
    const normalizedName = normalizeText(card.nome);
    return config.cardKeywords.some((keyword) => normalizedName.includes(normalizeText(keyword)));
  });
}

export function suggestImportCardByText(sourceText: string, cards: Cartao[]): ImportCardSuggestion {
  const issuers = detectIssuers(sourceText);
  if (issuers.length === 0) return { kind: "no_issuer" };
  if (issuers.length > 1) {
    return {
      kind: "multiple_issuers",
      issuerLabels: issuers.map((issuer) => ISSUER_CONFIG[issuer].label),
    };
  }

  const issuer = issuers[0];
  const issuerLabel = ISSUER_CONFIG[issuer].label;
  const matchedCards = findCardsByIssuer(cards, issuer);

  if (matchedCards.length === 1) {
    return { kind: "single_match", issuer, issuerLabel, card: matchedCards[0] };
  }

  if (matchedCards.length > 1) {
    return { kind: "multiple_cards", issuer, issuerLabel, cards: matchedCards };
  }

  return { kind: "issuer_without_card", issuer, issuerLabel };
}

function extractCardLast4(cardName: string): string | null {
  const explicitFinal = cardName.match(/(?:final|ending)\s*(\d{4})/i);
  if (explicitFinal?.[1]) return explicitFinal[1];

  const masked = cardName.match(/\*{2,}\s*(\d{4})/);
  if (masked?.[1]) return masked[1];

  const trailing = cardName.match(/\b(\d{4})$/);
  if (trailing?.[1]) return trailing[1];

  return null;
}

export function formatImportCardOptionLabel(card: Cartao): string {
  const last4 = extractCardLast4(card.nome);
  if (!last4) return card.nome;
  if (/final\s*\d{4}/i.test(card.nome) || /\*{2,}\s*\d{4}/.test(card.nome)) {
    return card.nome;
  }
  return `${card.nome} · final ${last4}`;
}
