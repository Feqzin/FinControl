import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { iconMatchRules, userIconLibrary, type UserIconLibraryItem } from "../../shared/schema.js";
import type {
  UserIconLibraryBatchCreateBodyInput,
  UserIconLibraryCreateBodyInput,
  UserIconLibraryUpdateBodyInput,
} from "../validators/user-icon-library.validators.js";

const MAX_ICON_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_SIGNATURE_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const MAX_KEYWORDS = 30;
const MAX_TERM_LENGTH = 120;
const MIN_NORMALIZED_TERM_LENGTH = 2;
const TECHNICAL_FILE_TOKENS = new Set([
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
const PURE_NUMBER_REGEX = /^\d+$/;
const SIMPLE_ALNUM_REGEX = /^[a-z0-9]+$/;

function startsWithSignature(buffer: Buffer, signature: Buffer): boolean {
  if (buffer.length < signature.length) return false;
  return buffer.subarray(0, signature.length).equals(signature);
}

function normalizeMimeType(value: string): string {
  if (value === "image/jpg") return "image/jpeg";
  return value;
}

function parseBase64DataUrl(value: string): { mimeType: string; buffer: Buffer } {
  const trimmed = value.trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!match) {
    throw new Error("Formato de imagem inválido.");
  }

  const rawMimeType = match[1]?.toLowerCase() ?? "";
  const mimeType = normalizeMimeType(rawMimeType);
  const base64Part = match[2] ?? "";
  const compact = base64Part.replace(/\s+/g, "");
  if (!compact) {
    throw new Error("Conteúdo da imagem inválido.");
  }

  const buffer = Buffer.from(compact, "base64");
  if (buffer.length === 0) {
    throw new Error("Conteúdo da imagem inválido.");
  }

  const normalizedInput = compact.replace(/=+$/g, "");
  const normalizedDecoded = buffer.toString("base64").replace(/=+$/g, "");
  if (normalizedInput !== normalizedDecoded) {
    throw new Error("Conteúdo da imagem inválido.");
  }

  return { mimeType, buffer };
}

function sanitizeIconName(input: string | null | undefined): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "Ícone personalizado";
  const noExtension = trimmed.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  const compact = noExtension.replace(/\s+/g, " ");
  return compact.slice(0, 120) || "Ícone personalizado";
}

function sanitizeOptionalCategory(input: string | null | undefined): string | null {
  if (input === null) return null;
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 40);
}

function normalizeIconTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  const output: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const normalized = normalizeIconTerm(trimmed);
    if (!normalized) continue;
    if (unique.has(normalized)) continue;
    unique.add(normalized);
    output.push(trimmed.slice(0, 80));
    if (output.length >= MAX_KEYWORDS) break;
  }

  return output;
}

function mergeKeywordLists(primary: string[], secondary: string[]): string[] {
  const unique = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...primary, ...secondary]) {
    const trimmed = String(entry ?? "").trim();
    if (!trimmed) continue;
    const normalized = normalizeIconTerm(trimmed);
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    merged.push(trimmed.slice(0, 80));
    if (merged.length >= MAX_KEYWORDS) break;
  }
  return merged;
}

function sanitizeFileNameTerm(value: string | null | undefined): string {
  if (!value) return "";

  const rawTokens = value
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]{}.,;:!?/\\|@#$%^&*+=~`"'<>\u2013\u2014]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  const sanitizedTokens: string[] = [];
  const unique = new Set<string>();
  for (const token of rawTokens) {
    const normalized = normalizeIconTerm(token).replace(/\s+/g, "");
    if (!normalized) continue;
    if (normalized.length < 2) continue;
    if (TECHNICAL_FILE_TOKENS.has(normalized)) continue;
    if (PURE_NUMBER_REGEX.test(normalized) && !KNOWN_NUMERIC_BRANDS.has(normalized)) continue;
    if (!SIMPLE_ALNUM_REGEX.test(normalized)) continue;

    const digitCount = (normalized.match(/\d/g) ?? []).length;
    const letterCount = (normalized.match(/[a-z]/g) ?? []).length;
    const isLikelyHash = normalized.length >= 8 && digitCount >= 4 && letterCount >= 4;
    if (isLikelyHash) continue;
    if (unique.has(normalized)) continue;

    unique.add(normalized);
    sanitizedTokens.push(token);
  }

  return sanitizedTokens.join(" ").slice(0, MAX_TERM_LENGTH).trim();
}

function buildMatchTerms(
  name: string,
  keywords: string[],
  originalFileName?: string | null,
): Array<{ originalTerm: string; normalizedTerm: string }> {
  const candidates = [
    name,
    ...keywords,
    sanitizeFileNameTerm(originalFileName),
  ];
  const unique = new Map<string, { originalTerm: string; normalizedTerm: string }>();

  for (const term of candidates) {
    const originalTerm = String(term ?? "").trim();
    if (!originalTerm) continue;
    const normalizedTerm = normalizeIconTerm(originalTerm);
    if (normalizedTerm.length < MIN_NORMALIZED_TERM_LENGTH) continue;
    if (normalizedTerm.length > MAX_TERM_LENGTH) continue;
    if (!unique.has(normalizedTerm)) {
      unique.set(normalizedTerm, {
        originalTerm: originalTerm.slice(0, MAX_TERM_LENGTH),
        normalizedTerm,
      });
    }
  }

  return Array.from(unique.values());
}

function extractExistingIconKeywords(icon: Pick<UserIconLibraryItem, "tags">): string[] {
  return sanitizeKeywordList(icon.tags);
}

function validateIconBinarySignatureOrThrow(mimeType: string, buffer: Buffer): void {
  if (mimeType === "image/png") {
    if (!startsWithSignature(buffer, PNG_SIGNATURE)) {
      throw new Error("Arquivo PNG inválido.");
    }
    return;
  }

  if (mimeType === "image/jpeg") {
    if (!startsWithSignature(buffer, JPG_SIGNATURE_PREFIX)) {
      throw new Error("Arquivo JPG inválido.");
    }
    return;
  }

  if (mimeType === "image/svg+xml") {
    const svgText = buffer.toString("utf8");
    if (!/<svg[\s>]/i.test(svgText)) {
      throw new Error("Arquivo SVG inválido.");
    }
    if (/<script[\s>]/i.test(svgText) || /javascript:/i.test(svgText)) {
      throw new Error("SVG com conteúdo não permitido.");
    }
    return;
  }

  throw new Error("Tipo de ícone não permitido. Envie PNG, JPG ou SVG.");
}

function normalizeIconDataUrl(input: UserIconLibraryCreateBodyInput): {
  name: string;
  category: string | null;
  imageUrl: string;
  keywords: string[];
  originalFileName: string;
} {
  const { mimeType, buffer } = parseBase64DataUrl(input.imageDataUrl);
  if (buffer.length > MAX_ICON_BYTES) {
    throw new Error("Ícone muito grande. Limite de 512 KB.");
  }

  validateIconBinarySignatureOrThrow(mimeType, buffer);
  const imageUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const name = sanitizeIconName(input.name);
  const keywords = sanitizeKeywordList(input.keywords);
  const originalFileName = String(input.originalFileName ?? "").trim();

  return {
    name,
    category: sanitizeOptionalCategory(input.category),
    imageUrl,
    keywords,
    originalFileName,
  };
}

async function upsertRulesForIcon(
  userId: string,
  iconId: string,
  terms: Array<{ originalTerm: string; normalizedTerm: string }>,
  previousTerms: Array<{ originalTerm: string; normalizedTerm: string }> = [],
): Promise<void> {
  const previousNormalizedTerms = Array.from(new Set(previousTerms.map((term) => term.normalizedTerm)));
  if (previousNormalizedTerms.length > 0) {
    await db
      .delete(iconMatchRules)
      .where(and(
        eq(iconMatchRules.userId, userId),
        eq(iconMatchRules.iconId, iconId),
        inArray(iconMatchRules.normalizedTerm, previousNormalizedTerms),
      ));
  }

  for (const term of terms) {
    const [existingByTerm] = await db
      .select()
      .from(iconMatchRules)
      .where(and(
        eq(iconMatchRules.userId, userId),
        eq(iconMatchRules.normalizedTerm, term.normalizedTerm),
      ))
      .limit(1);

    if (existingByTerm) {
      await db
        .update(iconMatchRules)
        .set({
          iconId,
          originalTerm: term.originalTerm,
          updatedAt: new Date(),
        })
        .where(and(
          eq(iconMatchRules.id, existingByTerm.id),
          eq(iconMatchRules.userId, userId),
        ));
      continue;
    }

    await db
      .insert(iconMatchRules)
      .values({
        userId,
        iconId,
        normalizedTerm: term.normalizedTerm,
        originalTerm: term.originalTerm,
      });
  }
}

async function removeRulesForIcon(userId: string, iconId: string): Promise<void> {
  await db
    .delete(iconMatchRules)
    .where(and(
      eq(iconMatchRules.userId, userId),
      eq(iconMatchRules.iconId, iconId),
    ));
}

export class UserIconLibraryService {
  async list(userId: string): Promise<UserIconLibraryItem[]> {
    return db
      .select()
      .from(userIconLibrary)
      .where(eq(userIconLibrary.userId, userId))
      .orderBy(desc(userIconLibrary.updatedAt), desc(userIconLibrary.createdAt));
  }

  async create(userId: string, payload: UserIconLibraryCreateBodyInput): Promise<UserIconLibraryItem> {
    const normalized = normalizeIconDataUrl(payload);
    const nextTerms = buildMatchTerms(normalized.name, normalized.keywords, normalized.originalFileName);

    const [existing] = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.userId, userId),
        eq(userIconLibrary.imageUrl, normalized.imageUrl),
      ))
      .limit(1);

    if (existing) {
      const oldTerms = buildMatchTerms(existing.name, extractExistingIconKeywords(existing));

      const [updated] = await db
        .update(userIconLibrary)
        .set({
          name: normalized.name,
          category: normalized.category,
          tags: normalized.keywords.length > 0 ? normalized.keywords : null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userIconLibrary.id, existing.id),
          eq(userIconLibrary.userId, userId),
        ))
        .returning();

      const icon = updated ?? existing;
      await upsertRulesForIcon(userId, icon.imageUrl, nextTerms, oldTerms);
      return icon;
    }

    const [created] = await db
      .insert(userIconLibrary)
      .values({
        userId,
        sourceType: "upload",
        officialIconId: null,
        name: normalized.name,
        imageUrl: normalized.imageUrl,
        storagePath: null,
        category: normalized.category,
        tags: normalized.keywords.length > 0 ? normalized.keywords : null,
      })
      .returning();

    if (!created) {
      throw new Error("Não foi possível salvar o ícone.");
    }

    await upsertRulesForIcon(userId, created.imageUrl, nextTerms);
    return created;
  }

  async update(userId: string, id: string, payload: UserIconLibraryUpdateBodyInput): Promise<UserIconLibraryItem | null> {
    const [existing] = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.id, id),
        eq(userIconLibrary.userId, userId),
      ))
      .limit(1);

    if (!existing) return null;

    const previousKeywords = extractExistingIconKeywords(existing);
    const nextName = payload.name !== undefined ? sanitizeIconName(payload.name) : existing.name;
    const nextCategory = payload.category !== undefined
      ? sanitizeOptionalCategory(payload.category)
      : existing.category;
    const nextKeywords = payload.keywords !== undefined
      ? sanitizeKeywordList(payload.keywords)
      : previousKeywords;

    const previousTerms = buildMatchTerms(existing.name, previousKeywords);
    const nextTerms = buildMatchTerms(nextName, nextKeywords);

    const [updated] = await db
      .update(userIconLibrary)
      .set({
        name: nextName,
        category: nextCategory,
        tags: nextKeywords.length > 0 ? nextKeywords : null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userIconLibrary.id, id),
        eq(userIconLibrary.userId, userId),
      ))
      .returning();

    if (!updated) return null;
    await upsertRulesForIcon(userId, updated.imageUrl, nextTerms, previousTerms);
    return updated;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.id, id),
        eq(userIconLibrary.userId, userId),
      ))
      .limit(1);

    if (!existing) return false;

    const deleted = await db
      .delete(userIconLibrary)
      .where(and(
        eq(userIconLibrary.id, id),
        eq(userIconLibrary.userId, userId),
      ))
      .returning({ id: userIconLibrary.id });

    if (deleted.length === 0) return false;

    await removeRulesForIcon(userId, existing.imageUrl);
    return true;
  }

  async createBatch(
    userId: string,
    payload: UserIconLibraryBatchCreateBodyInput,
  ): Promise<{
    created: UserIconLibraryItem[];
    failed: Array<{ requestIndex: number; originalFileName: string; reason: string }>;
  }> {
    const created: UserIconLibraryItem[] = [];
    const failed: Array<{ requestIndex: number; originalFileName: string; reason: string }> = [];
    const defaultKeywords = sanitizeKeywordList(payload.defaultKeywords);
    const defaultCategory = sanitizeOptionalCategory(payload.defaultCategory);

    for (let index = 0; index < payload.icons.length; index += 1) {
      const rawItem = payload.icons[index];
      if (!rawItem) continue;
      const originalFileName = String(rawItem.originalFileName ?? "").trim() || `icone_${index + 1}`;
      const mergedKeywords = mergeKeywordLists(defaultKeywords, sanitizeKeywordList(rawItem.keywords));

      try {
        const icon = await this.create(userId, {
          name: rawItem.name,
          category: rawItem.category ?? defaultCategory,
          keywords: mergedKeywords,
          originalFileName: rawItem.originalFileName,
          imageDataUrl: rawItem.imageDataUrl,
        });
        created.push(icon);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Não foi possível salvar este ícone.";
        failed.push({
          requestIndex: index,
          originalFileName,
          reason,
        });
      }
    }

    return { created, failed };
  }
}
