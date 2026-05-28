export const SERVICO_CATEGORY_DEFAULT_VALUE = "outros" as const;

export const SERVICO_CATEGORY_VALUES = [
  "streaming",
  "software",
  "lazer",
  "assinatura",
  "utilidades",
  "cuidados_pessoais",
  SERVICO_CATEGORY_DEFAULT_VALUE,
] as const;

export type ServicoCategory = (typeof SERVICO_CATEGORY_VALUES)[number];

const servicoCategoryAliases: Readonly<Record<string, ServicoCategory>> = {
  outro: "outros",
  utilidade: "utilidades",
  seguro: "utilidades",
  cuidados_pessoais: "cuidados_pessoais",
  "cuidados pessoais": "cuidados_pessoais",
  "cuidados-pessoais": "cuidados_pessoais",
  "cuidado pessoal": "cuidados_pessoais",
};

function normalizeCategoriaToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const categoryByNormalizedToken = (() => {
  const map = new Map<string, ServicoCategory>();
  for (const value of SERVICO_CATEGORY_VALUES) {
    map.set(normalizeCategoriaToken(value), value);
  }
  for (const [alias, canonical] of Object.entries(servicoCategoryAliases)) {
    map.set(normalizeCategoriaToken(alias), canonical);
  }
  return map;
})();

export function resolveServicoCategoryValue(value: string | null | undefined): ServicoCategory | null {
  const normalized = normalizeCategoriaToken(value);
  if (!normalized) return null;
  return categoryByNormalizedToken.get(normalized) ?? null;
}

export function normalizeServicoCategoryOrDefault(value: string | null | undefined): ServicoCategory {
  return resolveServicoCategoryValue(value) ?? SERVICO_CATEGORY_DEFAULT_VALUE;
}

export function isServicoCategoryValue(value: string | null | undefined): boolean {
  return resolveServicoCategoryValue(value) !== null;
}
