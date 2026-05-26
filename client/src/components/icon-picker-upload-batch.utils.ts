const NON_ALNUM_REGEX = /[^a-z0-9\s]/g;
const SPACE_REGEX = /\s+/g;
const FILE_EXT_REGEX = /\.[a-z0-9]{2,5}$/i;
const FILE_YEAR_SUFFIX_REGEX = /\b(19|20)\d{2}\b$/;
const MAX_ICON_NAME_LENGTH = 120;
const MAX_ICON_KEYWORD_LENGTH = 80;
const TECHNICAL_TOKENS = new Set([
  "logo",
  "icon",
  "icone",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "webp",
  "final",
  "copy",
  "copia",
  "download",
  "image",
  "img",
]);
const KNOWN_NUMERIC_BRANDS = new Set(["99"]);
const SIMPLE_ALNUM_TOKEN_REGEX = /^[a-z0-9]+$/;
const PURE_NUMBER_TOKEN_REGEX = /^\d+$/;

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

function tokenizeKeywordSource(value: string): string[] {
  return value
    .replace(FILE_EXT_REGEX, "")
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]{}.,;:!?/\\|@#$%^&*+=~`"'<>\u2013\u2014]/g, " ")
    .replace(SPACE_REGEX, " ")
    .trim()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function sanitizeIconKeywordToken(token: string): string | null {
  const trimmed = String(token ?? "").trim();
  if (!trimmed) return null;

  const normalized = normalizeKeyword(trimmed);
  if (!normalized) return null;
  if (normalized.length < 2) return null;
  if (TECHNICAL_TOKENS.has(normalized)) return null;

  if (PURE_NUMBER_TOKEN_REGEX.test(normalized)) {
    if (KNOWN_NUMERIC_BRANDS.has(normalized)) {
      return normalized;
    }
    return null;
  }

  if (!SIMPLE_ALNUM_TOKEN_REGEX.test(normalized)) return null;

  const digitCount = (normalized.match(/\d/g) ?? []).length;
  const letterCount = (normalized.match(/[a-z]/g) ?? []).length;
  if (digitCount > 0 && letterCount > 0) {
    const isLikelyHashLike = normalized.length >= 8 && digitCount >= 4 && letterCount >= 4;
    if (isLikelyHashLike) return null;
  }

  return normalized;
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

function appendKeywordValue(
  value: string,
  output: string[],
  unique: Set<string>,
): void {
  const trimmed = value.trim().replace(SPACE_REGEX, " ");
  if (!trimmed) return;
  const normalized = normalizeKeyword(trimmed);
  if (!normalized || unique.has(normalized)) return;
  unique.add(normalized);
  output.push(trimmed.slice(0, MAX_ICON_KEYWORD_LENGTH));
}

function getMeaningfulTokensForKeywordSource(source: string): string[] {
  const output: string[] = [];
  for (const token of tokenizeKeywordSource(source)) {
    const sanitized = sanitizeIconKeywordToken(token);
    if (!sanitized) continue;
    output.push(token);
  }
  return output;
}

export function buildIconKeywordsFromNameAndFilename(params: {
  name?: string | null;
  originalFileName?: string | null;
  baseKeywords?: string[] | string | null;
}): string[] {
  const unique = new Set<string>();
  const output: string[] = [];

  const manualKeywords = parseKeywordInput(params.baseKeywords);
  for (const manualKeyword of manualKeywords) {
    appendKeywordValue(manualKeyword, output, unique);
  }

  const cleanName = sanitizeIconNameInput(String(params.name ?? ""));
  const cleanFileName = sanitizeIconNameInput(String(params.originalFileName ?? ""));
  const nameTokens = getMeaningfulTokensForKeywordSource(cleanName);
  const fileTokens = getMeaningfulTokensForKeywordSource(cleanFileName);

  for (const token of nameTokens) {
    appendKeywordValue(token, output, unique);
  }
  for (const token of fileTokens) {
    appendKeywordValue(token, output, unique);
  }

  if (nameTokens.length >= 2) {
    appendKeywordValue(nameTokens.join(" "), output, unique);
  }
  if (fileTokens.length >= 2) {
    appendKeywordValue(fileTokens.join(" "), output, unique);
  }

  if (nameTokens.length === 0 && fileTokens.length === 0 && cleanName) {
    appendKeywordValue(cleanName, output, unique);
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
  const baseKeywords = [
    ...parseKeywordInput(params.defaultKeywords),
    ...parseKeywordInput(params.itemKeywords),
  ];
  return buildIconKeywordsFromNameAndFilename({
    name: params.iconName,
    originalFileName: params.originalFileName,
    baseKeywords,
  });
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
