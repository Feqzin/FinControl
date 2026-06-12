import { LIBRARY_ICONS } from "@/lib/brand-icons";
import type { UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";

export type UserIconMatchRule = {
  id: string;
  iconId: string;
  normalizedTerm: string;
  originalTerm: string;
};

export const BUILTIN_ICON_PREFERENCE_RULE_ICON_ID = "__builtin_icon_preference__";

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

type MatchableUserIcon = Pick<
  UserIconLibraryItemApiModel,
  "id" | "imageUrl" | "isActive" | "name" | "sourceType" | "officialIconId"
>;

const MIN_TERM_LENGTH = 3;
const AUTO_APPLY_THRESHOLD = 0.9;
const SUGGEST_THRESHOLD = 0.72;
const MIN_MATCH_THRESHOLD = 0.62;
const BUILTIN_ICON_DISABLE_TERM_PREFIX = "builtin-icon-disabled:";

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
const BUILTIN_ICON_KEYS = new Set<string>(LIBRARY_ICONS.map((icon) => normalizeBuiltinIconKey(icon.key)));

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBuiltinIconKey(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isValidBuiltinIconKey(value: string): boolean {
  const normalized = normalizeBuiltinIconKey(value);
  return normalized.length > 0 && BUILTIN_ICON_KEYS.has(normalized);
}

function isUserIconActive(icon: MatchableUserIcon | null | undefined): boolean {
  return icon?.isActive !== false;
}

function matchesBuiltinIconFromInactiveUserIcon(icon: MatchableUserIcon, builtinKey: string): boolean {
  const normalizedName = normalizeText(icon.name ?? "");
  if (!normalizedName) return false;

  const builtin = LIBRARY_ICONS.find((entry) => entry.key === builtinKey);
  if (!builtin) return false;

  if (normalizeText(builtin.label) === normalizedName) return true;
  if (normalizeText(builtin.key) === normalizedName) return true;

  return (BUILTIN_ALIASES[builtin.key] ?? []).some((alias) => normalizeText(alias) === normalizedName);
}

function getInactiveBuiltinIconKeysFromUserIcons(userIcons: MatchableUserIcon[]): Set<string> {
  const disabled = new Set<string>();

  for (const icon of userIcons) {
    if (isUserIconActive(icon)) continue;
    if (icon.sourceType !== "official" && !icon.officialIconId) continue;

    for (const builtin of LIBRARY_ICONS) {
      if (matchesBuiltinIconFromInactiveUserIcon(icon, builtin.key)) {
        disabled.add(builtin.key);
      }
    }
  }

  return disabled;
}

export function buildBuiltinIconDisablePreferenceTerm(iconKey: string): string {
  return `${BUILTIN_ICON_DISABLE_TERM_PREFIX}${normalizeBuiltinIconKey(iconKey)}`;
}

export function parseBuiltinIconDisablePreferenceTerm(term: string): string | null {
  const normalizedTerm = String(term ?? "").trim().toLowerCase();
  if (!normalizedTerm.startsWith(BUILTIN_ICON_DISABLE_TERM_PREFIX)) return null;

  const key = normalizeBuiltinIconKey(normalizedTerm.slice(BUILTIN_ICON_DISABLE_TERM_PREFIX.length));
  if (!isValidBuiltinIconKey(key)) return null;
  return key;
}

export function getDisabledBuiltinIconKeysFromRules(rules: UserIconMatchRule[]): Set<string> {
  const disabled = new Set<string>();
  for (const rule of rules) {
    if (rule.iconId !== BUILTIN_ICON_PREFERENCE_RULE_ICON_ID) continue;
    const key = parseBuiltinIconDisablePreferenceTerm(rule.originalTerm ?? "");
    if (key) disabled.add(key);
  }
  return disabled;
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

const ALL_BUILTIN_CANDIDATES = buildBuiltinCandidates();

function buildPersonalCandidates(
  rules: UserIconMatchRule[],
  options: {
    userIcons?: MatchableUserIcon[];
    disabledBuiltinIconKeys?: Set<string>;
  } = {},
): Candidate[] {
  const disabledBuiltinIconKeys = options.disabledBuiltinIconKeys ?? new Set<string>();
  const userIcons = options.userIcons ?? [];
  const candidates: Candidate[] = [];
  for (const rule of rules) {
    if (rule.iconId === BUILTIN_ICON_PREFERENCE_RULE_ICON_ID) continue;
    if (disabledBuiltinIconKeys.has(normalizeBuiltinIconKey(rule.iconId))) continue;

    const matchedUserIcon = userIcons.find((icon) => icon.id === rule.iconId || icon.imageUrl === rule.iconId);
    if (matchedUserIcon && !isUserIconActive(matchedUserIcon)) continue;

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
  options: {
    userIcons?: MatchableUserIcon[];
  } = {},
): PurchaseIconMatchResult {
  return matchIconByText(description, userRules, options);
}

export function matchIconByText(
  text: string,
  userRules: UserIconMatchRule[] = [],
  options: {
    userIcons?: MatchableUserIcon[];
  } = {},
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

  const disabledBuiltinIconKeys = getDisabledBuiltinIconKeysFromRules(userRules);
  const inactiveBuiltinKeysFromUserIcons = getInactiveBuiltinIconKeysFromUserIcons(options.userIcons ?? []);
  const blockedBuiltinKeys = new Set<string>();
  disabledBuiltinIconKeys.forEach((key) => blockedBuiltinKeys.add(key));
  inactiveBuiltinKeysFromUserIcons.forEach((key) => blockedBuiltinKeys.add(key));

  const builtinCandidates = blockedBuiltinKeys.size === 0
    ? ALL_BUILTIN_CANDIDATES
    : ALL_BUILTIN_CANDIDATES.filter((candidate) => !blockedBuiltinKeys.has(candidate.iconId));

  const candidates = [
    ...buildPersonalCandidates(userRules, {
      userIcons: options.userIcons,
      disabledBuiltinIconKeys: blockedBuiltinKeys,
    }),
    ...builtinCandidates,
  ];
  let best: { candidate: Candidate; score: number; sourcePriority: number } | null = null;

  for (const candidate of candidates) {
    let score = scoreCandidate(normalizedDescription, candidate.term);
    if (score <= 0) continue;
    if (candidate.source === "personal_rule") {
      score = Math.min(0.99, score + 0.08);
    }
    const sourcePriority =
      candidate.source === "personal_rule" && score >= SUGGEST_THRESHOLD ? 1 : 0;

    if (
      !best
      || sourcePriority > best.sourcePriority
      || (sourcePriority === best.sourcePriority && score > best.score)
    ) {
      best = { candidate, score, sourcePriority };
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
