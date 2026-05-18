import { LIBRARY_ICONS } from "@/lib/brand-icons";

export type UserIconMatchRule = {
  id: string;
  iconId: string;
  normalizedTerm: string;
  originalTerm: string;
};

export type IconMatchSource = "personal_rule" | "builtin_keyword";

export type PurchaseIconMatchResult = {
  matched: boolean;
  iconId: string | null;
  label: string | null;
  confidenceScore: number;
  confidenceLevel: "alta" | "media" | "baixa";
  shouldAutoApply: boolean;
  shouldSuggest: boolean;
  source: IconMatchSource | null;
  matchedTerm: string | null;
};

type Candidate = {
  iconId: string;
  label: string;
  term: string;
  source: IconMatchSource;
};

const MIN_TERM_LENGTH = 3;
const AUTO_APPLY_THRESHOLD = 0.9;
const SUGGEST_THRESHOLD = 0.72;
const MIN_MATCH_THRESHOLD = 0.62;

const BUILTIN_ALIASES: Record<string, string[]> = {
  netflix: ["netflix", "netflix com", "netflix.com"],
  spotify: ["spotify", "dm spotify"],
  youtube: ["youtube", "youtube premium", "google youtube"],
  apple: ["apple", "icloud", "applecombill"],
  mercadopago: ["mercado pago", "mercadopago", "mlp"],
  amazon: ["amazon", "amazon br", "amazon marketplace"],
  amazonprime: ["amazon prime", "prime video", "prime"],
  google: ["google", "google one"],
  hbo: ["hbo", "max", "hbo max"],
  disney: ["disney", "disney plus", "disney+"],
  itau: ["itau", "itaucard", "itaú"],
  nubank: ["nubank", "nu cartao", "nucredito"],
  inter: ["inter", "banco inter"],
  kabum: ["kabum", "ka bum", "mlp kabum"],
};

const ICON_LABEL_BY_ID = new Map<string, string>(LIBRARY_ICONS.map((icon) => [icon.key, icon.label]));

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesByWordBoundary(normalizedDescription: string, normalizedTerm: string): boolean {
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
  return regex.test(normalizedDescription);
}

function scoreCandidate(normalizedDescription: string, normalizedTerm: string): number {
  if (!normalizedDescription || !normalizedTerm) return 0;
  if (normalizedDescription === normalizedTerm) return 1;
  if (includesByWordBoundary(normalizedDescription, normalizedTerm)) return 0.94;
  if (normalizedDescription.includes(normalizedTerm)) return 0.86;

  const descTokens = new Set(normalizedDescription.split(" ").filter(Boolean));
  const termTokens = normalizedTerm.split(" ").filter(Boolean);
  if (termTokens.length > 1 && termTokens.every((token) => descTokens.has(token))) {
    return 0.78;
  }

  return 0;
}

function resolveConfidence(score: number): "alta" | "media" | "baixa" {
  if (score >= AUTO_APPLY_THRESHOLD) return "alta";
  if (score >= SUGGEST_THRESHOLD) return "media";
  return "baixa";
}

function buildBuiltinCandidates(): Candidate[] {
  const candidates: Candidate[] = [];

  for (const icon of LIBRARY_ICONS) {
    const labelTerm = normalizeText(icon.label);
    if (labelTerm.length >= MIN_TERM_LENGTH) {
      candidates.push({
        iconId: icon.key,
        label: icon.label,
        term: labelTerm,
        source: "builtin_keyword",
      });
    }

    const keyTerm = normalizeText(icon.key);
    if (keyTerm.length >= MIN_TERM_LENGTH) {
      candidates.push({
        iconId: icon.key,
        label: icon.label,
        term: keyTerm,
        source: "builtin_keyword",
      });
    }

    for (const alias of BUILTIN_ALIASES[icon.key] ?? []) {
      const term = normalizeText(alias);
      if (term.length < MIN_TERM_LENGTH) continue;
      candidates.push({
        iconId: icon.key,
        label: icon.label,
        term,
        source: "builtin_keyword",
      });
    }
  }

  return candidates;
}

const BUILTIN_CANDIDATES = buildBuiltinCandidates();

function buildPersonalCandidates(rules: UserIconMatchRule[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const rule of rules) {
    const normalizedTerm = normalizeText(rule.normalizedTerm || rule.originalTerm || "");
    if (normalizedTerm.length < MIN_TERM_LENGTH) continue;
    const label = ICON_LABEL_BY_ID.get(rule.iconId) ?? "Ícone personalizado";
    candidates.push({
      iconId: rule.iconId,
      label,
      term: normalizedTerm,
      source: "personal_rule",
    });
  }
  return candidates;
}

export function normalizePurchaseIconTerm(value: string): string {
  return normalizeText(value);
}

export function matchPurchaseIconByDescription(
  description: string,
  userRules: UserIconMatchRule[] = [],
): PurchaseIconMatchResult {
  return matchIconByText(description, userRules);
}

export function matchIconByText(
  text: string,
  userRules: UserIconMatchRule[] = [],
): PurchaseIconMatchResult {
  const normalizedDescription = normalizeText(text);
  if (!normalizedDescription) {
    return {
      matched: false,
      iconId: null,
      label: null,
      confidenceScore: 0,
      confidenceLevel: "baixa",
      shouldAutoApply: false,
      shouldSuggest: false,
      source: null,
      matchedTerm: null,
    };
  }

  const candidates = [...buildPersonalCandidates(userRules), ...BUILTIN_CANDIDATES];
  let best: { candidate: Candidate; score: number } | null = null;

  for (const candidate of candidates) {
    let score = scoreCandidate(normalizedDescription, candidate.term);
    if (score <= 0) continue;
    if (candidate.source === "personal_rule") {
      score = Math.min(0.99, score + 0.08);
    }
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  if (!best || best.score < MIN_MATCH_THRESHOLD) {
    return {
      matched: false,
      iconId: null,
      label: null,
      confidenceScore: best?.score ?? 0,
      confidenceLevel: "baixa",
      shouldAutoApply: false,
      shouldSuggest: false,
      source: null,
      matchedTerm: null,
    };
  }

  const confidenceLevel = resolveConfidence(best.score);
  const shouldAutoApply = best.score >= AUTO_APPLY_THRESHOLD;
  const shouldSuggest = best.score >= SUGGEST_THRESHOLD;

  return {
    matched: true,
    iconId: best.candidate.iconId,
    label: best.candidate.label,
    confidenceScore: best.score,
    confidenceLevel,
    shouldAutoApply,
    shouldSuggest,
    source: best.candidate.source,
    matchedTerm: best.candidate.term,
  };
}
