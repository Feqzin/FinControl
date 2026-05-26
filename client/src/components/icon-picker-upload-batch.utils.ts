const NON_ALNUM_REGEX = /[^a-z0-9\s]/g;
const SPACE_REGEX = /\s+/g;
const FILE_EXT_REGEX = /\.[a-z0-9]{2,5}$/i;
const FILE_YEAR_SUFFIX_REGEX = /\b(19|20)\d{2}\b$/;
const MAX_ICON_NAME_LENGTH = 120;
const MAX_ICON_KEYWORD_LENGTH = 80;

export const ICON_UPLOAD_MAX_BYTES = 512 * 1024;
export const ICON_BATCH_UPLOAD_MAX_ITEMS = 30;
export const ICON_ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"] as const;

export function isIconMimeTypeAllowed(mimeType: string): boolean {
  return ICON_ALLOWED_MIME_TYPES.includes(mimeType as (typeof ICON_ALLOWED_MIME_TYPES)[number]);
}

export function sanitizeIconNameInput(value: string): string {
  return value
    .replace(FILE_EXT_REGEX, "")
    .replace(/[_-]+/g, " ")
    .replace(SPACE_REGEX, " ")
    .trim()
    .slice(0, MAX_ICON_NAME_LENGTH);
}

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(NON_ALNUM_REGEX, " ")
    .replace(SPACE_REGEX, " ")
    .trim();
}

export function parseKeywordInput(value: string | string[] | null | undefined): string[] {
  const rawEntries = Array.isArray(value)
    ? value
    : String(value ?? "")
      .split(",");

  const unique = new Set<string>();
  const output: string[] = [];
  for (const raw of rawEntries) {
    const trimmed = String(raw ?? "").trim().replace(SPACE_REGEX, " ");
    if (!trimmed) continue;
    const normalized = normalizeKeyword(trimmed);
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    output.push(trimmed.slice(0, MAX_ICON_KEYWORD_LENGTH));
  }
  return output;
}

export function suggestBatchIconNameFromFileName(fileName: string): string {
  const sanitized = sanitizeIconNameInput(fileName);
  const withoutYearSuffix = sanitized.replace(FILE_YEAR_SUFFIX_REGEX, "").replace(SPACE_REGEX, " ").trim();
  const source = withoutYearSuffix || sanitized;
  if (!source) return "Ícone personalizado";

  return source
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ")
    .slice(0, MAX_ICON_NAME_LENGTH);
}

export function mergeBatchUploadKeywords(params: {
  defaultKeywords?: string[] | string | null;
  itemKeywords?: string[] | string | null;
  iconName?: string | null;
  originalFileName?: string | null;
}): string[] {
  const fileTerm = sanitizeIconNameInput(String(params.originalFileName ?? ""));
  return parseKeywordInput([
    ...parseKeywordInput(params.defaultKeywords),
    ...parseKeywordInput(params.itemKeywords),
    String(params.iconName ?? ""),
    fileTerm,
  ]);
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        reject(new Error("Falha ao ler o arquivo."));
        return;
      }
      resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

