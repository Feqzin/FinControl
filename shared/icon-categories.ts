export type IconCategoryOption = {
  value: string;
  label: string;
  aliases?: string[];
};

export const ICON_CATEGORY_DEFAULT_VALUE = "outro";

export const ICON_CATEGORIES: readonly IconCategoryOption[] = [
  { value: "banco", label: "Banco", aliases: ["bancos"] },
  { value: "servico", label: "Serviço", aliases: ["servicos"] },
  { value: "carteira", label: "Carteira", aliases: ["carteiras"] },
  { value: "loja", label: "Loja", aliases: ["marketplaces"] },
  { value: "mercado", label: "Mercado", aliases: ["supermercados"] },
  { value: "delivery", label: "Delivery" },
  { value: "farmacia", label: "Farmácia" },
  { value: "transporte", label: "Transporte" },
  { value: "game", label: "Game", aliases: ["games"] },
  { value: "streaming", label: "Streaming" },
  { value: "assinatura", label: "Assinatura" },
  { value: "educacao", label: "Educação" },
  { value: "saude", label: "Saúde" },
  { value: "imposto", label: "Imposto" },
  { value: "seguro", label: "Seguro" },
  { value: "telefonia", label: "Telefonia" },
  { value: "internet", label: "Internet" },
  { value: "energia", label: "Energia" },
  { value: "viagem", label: "Viagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "casa", label: "Casa" },
  { value: "pet", label: "Pet" },
  { value: ICON_CATEGORY_DEFAULT_VALUE, label: "Outro" },
] as const;

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

const categoryTokenToCanonical = (() => {
  const entries = new Map<string, string>();
  for (const category of ICON_CATEGORIES) {
    entries.set(normalizeCategoryToken(category.value), category.value);
    for (const alias of category.aliases ?? []) {
      entries.set(normalizeCategoryToken(alias), category.value);
    }
  }
  return entries;
})();

const categoryByValue = new Map(ICON_CATEGORIES.map((category) => [category.value, category]));

export function resolveIconCategoryValue(value: string | null | undefined): string {
  const normalized = normalizeCategoryToken(value);
  if (!normalized) return ICON_CATEGORY_DEFAULT_VALUE;
  return categoryTokenToCanonical.get(normalized) ?? ICON_CATEGORY_DEFAULT_VALUE;
}

export function getIconCategoryLabel(value: string | null | undefined): string {
  const canonical = resolveIconCategoryValue(value);
  return categoryByValue.get(canonical)?.label ?? "Outro";
}

export function getIconCategoryFilterValues(selectedCategoryValue: string): string[] {
  const canonical = resolveIconCategoryValue(selectedCategoryValue);
  const category = categoryByValue.get(canonical);
  if (!category) return [ICON_CATEGORY_DEFAULT_VALUE];
  return Array.from(new Set([category.value, ...(category.aliases ?? [])]));
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
