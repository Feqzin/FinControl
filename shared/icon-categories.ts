export type IconCategoryOption = {
  value: string;
  label: string;
};

export const ICON_CATEGORY_DEFAULT_VALUE = "outro";

// Apenas categorias exibíveis na UI (selects/filtros).
export const ICON_CATEGORY_OPTIONS: readonly IconCategoryOption[] = [
  { value: "banco", label: "Banco" },
  { value: "servico", label: "Serviço" },
  { value: "loja", label: "Loja" },
  { value: "mercado", label: "Mercado" },
  { value: "delivery", label: "Delivery" },
  { value: "farmacia", label: "Farmácia" },
  { value: "transporte", label: "Transporte" },
  { value: "game", label: "Game" },
  { value: "streaming", label: "Streaming" },
  { value: "saude", label: "Saúde" },
  { value: "imposto", label: "Imposto" },
  { value: "seguro", label: "Seguro" },
  { value: "internet", label: "Internet" },
  { value: "energia", label: "Energia" },
  { value: "viagem", label: "Viagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "casa", label: "Casa" },
  { value: "pet", label: "Pet" },
  { value: ICON_CATEGORY_DEFAULT_VALUE, label: "Outro" },
] as const;

// Categorias/aliases legados aceitos internamente para compatibilidade.
export const LEGACY_ICON_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  bancos: "banco",
  carteira: "banco",
  carteiras: "banco",
  servicos: "servico",
  assinatura: "servico",
  educacao: "servico",
  marketplaces: "loja",
  supermercados: "mercado",
  games: "game",
  telefonia: "internet",
};

const WHITESPACE_REGEX = /\s+/g;
const NON_ALNUM_REGEX = /[^a-z0-9]/g;

function normalizeCategoryToken(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(WHITESPACE_REGEX, "")
    .replace(NON_ALNUM_REGEX, "");
}

const visibleCategoryByValue = new Map(ICON_CATEGORY_OPTIONS.map((category) => [category.value, category]));
const visibleCategoryTokens = new Set(
  ICON_CATEGORY_OPTIONS.map((category) => normalizeCategoryToken(category.value)),
);

const categoryTokenToCanonical = (() => {
  const entries = new Map<string, string>();
  for (const option of ICON_CATEGORY_OPTIONS) {
    entries.set(normalizeCategoryToken(option.value), option.value);
  }
  for (const [legacyToken, canonical] of Object.entries(LEGACY_ICON_CATEGORY_ALIASES)) {
    entries.set(normalizeCategoryToken(legacyToken), canonical);
  }
  return entries;
})();

const legacyAliasByCanonical = (() => {
  const grouped = new Map<string, string[]>();
  for (const [legacyToken, canonical] of Object.entries(LEGACY_ICON_CATEGORY_ALIASES)) {
    const current = grouped.get(canonical) ?? [];
    current.push(legacyToken);
    grouped.set(canonical, current);
  }
  return grouped;
})();

export function resolveIconCategoryValue(value: string | null | undefined): string {
  const normalized = normalizeCategoryToken(value);
  if (!normalized) return ICON_CATEGORY_DEFAULT_VALUE;
  return categoryTokenToCanonical.get(normalized) ?? ICON_CATEGORY_DEFAULT_VALUE;
}

export function normalizeIconCategoryForDisplay(value: string | null | undefined): string {
  return resolveIconCategoryValue(value);
}

export function isVisibleIconCategory(value: string | null | undefined): boolean {
  const normalized = normalizeCategoryToken(value);
  if (!normalized) return false;
  return visibleCategoryTokens.has(normalized);
}

export function getIconCategoryLabel(value: string | null | undefined): string {
  const canonical = normalizeIconCategoryForDisplay(value);
  return visibleCategoryByValue.get(canonical)?.label ?? "Outro";
}

export function getIconCategoryFilterValues(selectedCategoryValue: string): string[] {
  const canonical = resolveIconCategoryValue(selectedCategoryValue);
  const legacyAliases = legacyAliasByCanonical.get(canonical) ?? [];
  return Array.from(new Set([canonical, ...legacyAliases]));
}

export function matchesIconCategory(
  iconCategory: string | null | undefined,
  selectedCategoryValue: string | null | undefined,
): boolean {
  if (!selectedCategoryValue || selectedCategoryValue === "all") return true;
  const filterValues = getIconCategoryFilterValues(selectedCategoryValue).map((value) => normalizeCategoryToken(value));
  const normalizedIconCategory = normalizeCategoryToken(iconCategory);
  return filterValues.includes(normalizedIconCategory);
}

// Compatibilidade: manter export antigo apontando para opções visíveis.
export const ICON_CATEGORIES = ICON_CATEGORY_OPTIONS;
