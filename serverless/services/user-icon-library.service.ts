import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { userIconLibrary, type UserIconLibraryItem } from "@shared/schema";
import type { UserIconLibraryCreateBodyInput } from "../validators/user-icon-library.validators.js";

const MAX_ICON_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_SIGNATURE_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);

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
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 40);
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

function normalizeIconDataUrl(input: UserIconLibraryCreateBodyInput): { name: string; category: string | null; imageUrl: string } {
  const { mimeType, buffer } = parseBase64DataUrl(input.imageDataUrl);
  if (buffer.length > MAX_ICON_BYTES) {
    throw new Error("Ícone muito grande. Limite de 512 KB.");
  }

  validateIconBinarySignatureOrThrow(mimeType, buffer);
  const imageUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  return {
    name: sanitizeIconName(input.name),
    category: sanitizeOptionalCategory(input.category),
    imageUrl,
  };
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

    const [existing] = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.userId, userId),
        eq(userIconLibrary.imageUrl, normalized.imageUrl),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userIconLibrary)
        .set({
          name: normalized.name,
          category: normalized.category,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userIconLibrary.id, existing.id),
          eq(userIconLibrary.userId, userId),
        ))
        .returning();

      return updated ?? existing;
    }

    const [created] = await db
      .insert(userIconLibrary)
      .values({
        userId,
        name: normalized.name,
        imageUrl: normalized.imageUrl,
        storagePath: null,
        category: normalized.category,
      })
      .returning();

    if (!created) {
      throw new Error("Não foi possível salvar o ícone.");
    }

    return created;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(userIconLibrary)
      .where(and(
        eq(userIconLibrary.id, id),
        eq(userIconLibrary.userId, userId),
      ))
      .returning({ id: userIconLibrary.id });

    return deleted.length > 0;
  }
}
