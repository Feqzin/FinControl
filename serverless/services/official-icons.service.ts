import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db.js";
import {
  iconMatchRules,
  officialIconLibrary,
  officialIconPacks,
  userIconLibrary,
  type OfficialIconLibraryItem,
  type OfficialIconPack,
  type UserIconLibraryItem,
} from "@shared/schema";
import type {
  AdminCreateOfficialIconBodyInput,
  AdminCreateOfficialIconPackBodyInput,
  AdminUpdateOfficialIconBodyInput,
  AdminUpdateOfficialIconPackBodyInput,
  OfficialIconsListQueryInput,
} from "../validators/official-icons.validators.js";

const MAX_ICON_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_SIGNATURE_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const MIN_NORMALIZED_TERM_LENGTH = 3;
const MAX_NORMALIZED_TERM_LENGTH = 140;

export class OfficialIconNotFoundError extends Error {}
export class OfficialIconPackNotFoundError extends Error {}

export type OfficialIconListItemView = {
  id: string;
  iconKey: string;
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
  tags: string[];
  aliases: string[];
  packId: string | null;
  packName: string | null;
  alreadyInLibrary: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type OfficialIconPackView = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  iconsCount: number;
  addedIconsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type OfficialIconLike = {
  id: string;
  iconKey: string;
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
  tags: unknown;
  aliases: unknown;
};

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

function resolveImageUrlFromInput(input: { imageUrl?: string | null; imageDataUrl?: string | null }): string {
  const imageDataUrl = input.imageDataUrl?.trim();
  if (imageDataUrl) {
    const { mimeType, buffer } = parseBase64DataUrl(imageDataUrl);
    if (buffer.length > MAX_ICON_BYTES) {
      throw new Error("Ícone muito grande. Limite de 512 KB.");
    }
    validateIconBinarySignatureOrThrow(mimeType, buffer);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  const imageUrl = input.imageUrl?.trim();
  if (!imageUrl) {
    throw new Error("Informe imageUrl ou imageDataUrl.");
  }
  if (!(imageUrl.startsWith("http://") || imageUrl.startsWith("https://") || imageUrl.startsWith("data:"))) {
    throw new Error("imageUrl inválida.");
  }
  return imageUrl;
}

function sanitizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
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

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const normalizedKey = trimmed.toLowerCase();
    if (unique.has(normalizedKey)) continue;
    unique.add(normalizedKey);
    output.push(trimmed.slice(0, 80));
  }
  return output;
}

function buildOfficialIconTerms(icon: OfficialIconLike): Array<{ originalTerm: string; normalizedTerm: string }> {
  const terms = [
    icon.name,
    icon.iconKey,
    ...sanitizeStringArray(icon.aliases),
    ...sanitizeStringArray(icon.tags),
  ];

  const unique = new Map<string, { originalTerm: string; normalizedTerm: string }>();
  for (const rawTerm of terms) {
    const originalTerm = String(rawTerm ?? "").trim();
    if (!originalTerm) continue;
    const normalizedTerm = normalizeIconTerm(originalTerm);
    if (normalizedTerm.length < MIN_NORMALIZED_TERM_LENGTH) continue;
    if (normalizedTerm.length > MAX_NORMALIZED_TERM_LENGTH) continue;
    if (!unique.has(normalizedTerm)) {
      unique.set(normalizedTerm, { originalTerm, normalizedTerm });
    }
  }

  return Array.from(unique.values());
}

function iconMatchesSearch(icon: OfficialIconListItemView, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true;
  const haystack = normalizeIconTerm([
    icon.name,
    icon.iconKey,
    icon.category ?? "",
    icon.packName ?? "",
    ...icon.tags,
    ...icon.aliases,
  ].join(" "));
  return haystack.includes(normalizedSearch);
}

export class OfficialIconLibraryService {
  private async upsertMatchRulesForOfficialIcon(userId: string, iconId: string, icon: OfficialIconLike): Promise<number> {
    const terms = buildOfficialIconTerms(icon);
    if (terms.length === 0) return 0;

    let upserts = 0;
    for (const term of terms) {
      const [existing] = await db
        .select()
        .from(iconMatchRules)
        .where(and(
          eq(iconMatchRules.userId, userId),
          eq(iconMatchRules.normalizedTerm, term.normalizedTerm),
        ))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(iconMatchRules)
          .set({
            iconId,
            originalTerm: term.originalTerm,
            updatedAt: new Date(),
          })
          .where(and(
            eq(iconMatchRules.id, existing.id),
            eq(iconMatchRules.userId, userId),
          ))
          .returning({ id: iconMatchRules.id });
        if (updated) upserts += 1;
        continue;
      }

      const [created] = await db
        .insert(iconMatchRules)
        .values({
          userId,
          iconId,
          normalizedTerm: term.normalizedTerm,
          originalTerm: term.originalTerm,
        })
        .returning({ id: iconMatchRules.id });
      if (created) upserts += 1;
    }

    return upserts;
  }

  private async loadActiveOfficialIconById(id: string): Promise<OfficialIconLike> {
    const [row] = await db
      .select({
        id: officialIconLibrary.id,
        iconKey: officialIconLibrary.iconKey,
        name: officialIconLibrary.name,
        imageUrl: officialIconLibrary.imageUrl,
        storagePath: officialIconLibrary.storagePath,
        category: officialIconLibrary.category,
        tags: officialIconLibrary.tags,
        aliases: officialIconLibrary.aliases,
      })
      .from(officialIconLibrary)
      .leftJoin(officialIconPacks, eq(officialIconLibrary.packId, officialIconPacks.id))
      .where(and(
        eq(officialIconLibrary.id, id),
        eq(officialIconLibrary.isActive, true),
        or(isNull(officialIconLibrary.packId), eq(officialIconPacks.isActive, true)),
      ))
      .limit(1);

    if (!row) {
      throw new OfficialIconNotFoundError("Ícone oficial não encontrado.");
    }

    return row;
  }

  async listOfficialIcons(userId: string, query: OfficialIconsListQueryInput): Promise<OfficialIconListItemView[]> {
    const rows = await db
      .select({
        id: officialIconLibrary.id,
        iconKey: officialIconLibrary.iconKey,
        name: officialIconLibrary.name,
        imageUrl: officialIconLibrary.imageUrl,
        storagePath: officialIconLibrary.storagePath,
        category: officialIconLibrary.category,
        tags: officialIconLibrary.tags,
        aliases: officialIconLibrary.aliases,
        packId: officialIconLibrary.packId,
        packName: officialIconPacks.name,
        createdAt: officialIconLibrary.createdAt,
        updatedAt: officialIconLibrary.updatedAt,
      })
      .from(officialIconLibrary)
      .leftJoin(officialIconPacks, eq(officialIconLibrary.packId, officialIconPacks.id))
      .where(and(
        eq(officialIconLibrary.isActive, true),
        or(isNull(officialIconLibrary.packId), eq(officialIconPacks.isActive, true)),
      ))
      .orderBy(asc(officialIconLibrary.name), desc(officialIconLibrary.createdAt));

    const normalizedSearch = normalizeIconTerm(query.search ?? "");
    const normalizedCategory = (query.category ?? "").trim().toLowerCase();
    const packId = (query.packId ?? "").trim();

    let icons = rows.map<OfficialIconListItemView>((row) => ({
      id: row.id,
      iconKey: row.iconKey,
      name: row.name,
      imageUrl: row.imageUrl,
      storagePath: row.storagePath ?? null,
      category: row.category ?? null,
      tags: sanitizeStringArray(row.tags),
      aliases: sanitizeStringArray(row.aliases),
      packId: row.packId ?? null,
      packName: row.packName ?? null,
      alreadyInLibrary: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    if (normalizedCategory) {
      icons = icons.filter((icon) => (icon.category ?? "").trim().toLowerCase() === normalizedCategory);
    }
    if (packId) {
      icons = icons.filter((icon) => icon.packId === packId);
    }
    if (normalizedSearch) {
      icons = icons.filter((icon) => iconMatchesSearch(icon, normalizedSearch));
    }

    const officialIds = icons.map((icon) => icon.id);
    if (officialIds.length === 0) {
      return [];
    }

    const userOfficialIconRows = await db
      .select({ officialIconId: userIconLibrary.officialIconId })
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.userId, userId),
        inArray(userIconLibrary.officialIconId, officialIds),
      ));

    const addedSet = new Set(
      userOfficialIconRows
        .map((row) => row.officialIconId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );

    return icons.map((icon) => ({
      ...icon,
      alreadyInLibrary: addedSet.has(icon.id),
    }));
  }

  async listOfficialPacks(userId: string): Promise<OfficialIconPackView[]> {
    const packs = await db
      .select()
      .from(officialIconPacks)
      .where(eq(officialIconPacks.isActive, true))
      .orderBy(asc(officialIconPacks.name), desc(officialIconPacks.createdAt));

    if (packs.length === 0) return [];

    const packIds = packs.map((pack) => pack.id);
    const iconCounts = await db
      .select({
        packId: officialIconLibrary.packId,
        count: sql<number>`count(*)`,
      })
      .from(officialIconLibrary)
      .where(and(
        eq(officialIconLibrary.isActive, true),
        inArray(officialIconLibrary.packId, packIds),
      ))
      .groupBy(officialIconLibrary.packId);

    const addedCounts = await db
      .select({
        packId: officialIconLibrary.packId,
        count: sql<number>`count(*)`,
      })
      .from(userIconLibrary)
      .innerJoin(officialIconLibrary, eq(userIconLibrary.officialIconId, officialIconLibrary.id))
      .where(and(
        eq(userIconLibrary.userId, userId),
        eq(officialIconLibrary.isActive, true),
        inArray(officialIconLibrary.packId, packIds),
      ))
      .groupBy(officialIconLibrary.packId);

    const iconCountByPackId = new Map<string, number>();
    for (const row of iconCounts) {
      if (!row.packId) continue;
      iconCountByPackId.set(row.packId, Number(row.count) || 0);
    }

    const addedCountByPackId = new Map<string, number>();
    for (const row of addedCounts) {
      if (!row.packId) continue;
      addedCountByPackId.set(row.packId, Number(row.count) || 0);
    }

    return packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description ?? null,
      category: pack.category ?? null,
      coverImageUrl: pack.coverImageUrl ?? null,
      iconsCount: iconCountByPackId.get(pack.id) ?? 0,
      addedIconsCount: addedCountByPackId.get(pack.id) ?? 0,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
    }));
  }

  async addOfficialIconToLibrary(userId: string, officialIconId: string): Promise<{
    icon: UserIconLibraryItem;
    alreadyInLibrary: boolean;
    createdMatchRules: number;
  }> {
    const officialIcon = await this.loadActiveOfficialIconById(officialIconId);

    const [existing] = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.userId, userId),
        eq(userIconLibrary.officialIconId, officialIconId),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userIconLibrary)
        .set({
          sourceType: "official",
          name: officialIcon.name,
          imageUrl: officialIcon.imageUrl,
          storagePath: officialIcon.storagePath,
          category: officialIcon.category,
          tags: sanitizeStringArray(officialIcon.tags),
          updatedAt: new Date(),
        })
        .where(and(
          eq(userIconLibrary.id, existing.id),
          eq(userIconLibrary.userId, userId),
        ))
        .returning();

      const row = updated ?? existing;
      const createdMatchRules = await this.upsertMatchRulesForOfficialIcon(userId, row.imageUrl, officialIcon);
      return {
        icon: row,
        alreadyInLibrary: true,
        createdMatchRules,
      };
    }

    let created: UserIconLibraryItem | undefined;
    try {
      [created] = await db
        .insert(userIconLibrary)
        .values({
          userId,
          sourceType: "official",
          officialIconId,
          name: officialIcon.name,
          imageUrl: officialIcon.imageUrl,
          storagePath: officialIcon.storagePath,
          category: officialIcon.category,
          tags: sanitizeStringArray(officialIcon.tags),
        })
        .returning();
    } catch (error: unknown) {
      const isUniqueViolation = typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: unknown }).code === "23505";

      if (!isUniqueViolation) {
        throw error;
      }

      const [existingAfterConflict] = await db
        .select()
        .from(userIconLibrary)
        .where(and(
          eq(userIconLibrary.userId, userId),
          eq(userIconLibrary.officialIconId, officialIconId),
        ))
        .limit(1);

      if (existingAfterConflict) {
        const createdMatchRules = await this.upsertMatchRulesForOfficialIcon(userId, existingAfterConflict.imageUrl, officialIcon);
        return {
          icon: existingAfterConflict,
          alreadyInLibrary: true,
          createdMatchRules,
        };
      }

      throw error;
    }

    if (!created) {
      throw new Error("Não foi possível adicionar o ícone oficial.");
    }

    const createdMatchRules = await this.upsertMatchRulesForOfficialIcon(userId, created.imageUrl, officialIcon);
    return {
      icon: created,
      alreadyInLibrary: false,
      createdMatchRules,
    };
  }

  async addOfficialPackToLibrary(userId: string, packId: string): Promise<{
    packId: string;
    totalIcons: number;
    addedCount: number;
    alreadyInLibraryCount: number;
    createdMatchRules: number;
  }> {
    const [pack] = await db
      .select()
      .from(officialIconPacks)
      .where(and(
        eq(officialIconPacks.id, packId),
        eq(officialIconPacks.isActive, true),
      ))
      .limit(1);

    if (!pack) {
      throw new OfficialIconPackNotFoundError("Pack oficial não encontrado.");
    }

    const icons = await db
      .select({
        id: officialIconLibrary.id,
        iconKey: officialIconLibrary.iconKey,
        name: officialIconLibrary.name,
        imageUrl: officialIconLibrary.imageUrl,
        storagePath: officialIconLibrary.storagePath,
        category: officialIconLibrary.category,
        tags: officialIconLibrary.tags,
        aliases: officialIconLibrary.aliases,
      })
      .from(officialIconLibrary)
      .where(and(
        eq(officialIconLibrary.packId, packId),
        eq(officialIconLibrary.isActive, true),
      ))
      .orderBy(asc(officialIconLibrary.name));

    let addedCount = 0;
    let alreadyInLibraryCount = 0;
    let createdMatchRules = 0;

    for (const icon of icons) {
      const added = await this.addOfficialIconToLibrary(userId, icon.id);
      if (added.alreadyInLibrary) {
        alreadyInLibraryCount += 1;
      } else {
        addedCount += 1;
      }
      createdMatchRules += added.createdMatchRules;
    }

    return {
      packId: pack.id,
      totalIcons: icons.length,
      addedCount,
      alreadyInLibraryCount,
      createdMatchRules,
    };
  }

  async createOfficialPack(_adminUserId: string, payload: AdminCreateOfficialIconPackBodyInput): Promise<OfficialIconPack> {
    const [created] = await db
      .insert(officialIconPacks)
      .values({
        name: payload.name.trim(),
        description: sanitizeOptionalText(payload.description, 280),
        category: sanitizeOptionalText(payload.category, 60),
        coverImageUrl: sanitizeOptionalText(payload.coverImageUrl, 2_000_000),
        isActive: payload.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error("Não foi possível criar o pack oficial.");
    }

    return created;
  }

  async updateOfficialPack(id: string, payload: AdminUpdateOfficialIconPackBodyInput): Promise<OfficialIconPack> {
    const updates: Partial<typeof officialIconPacks.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.description !== undefined) updates.description = sanitizeOptionalText(payload.description, 280);
    if (payload.category !== undefined) updates.category = sanitizeOptionalText(payload.category, 60);
    if (payload.coverImageUrl !== undefined) updates.coverImageUrl = sanitizeOptionalText(payload.coverImageUrl, 2_000_000);
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;

    const [updated] = await db
      .update(officialIconPacks)
      .set(updates)
      .where(eq(officialIconPacks.id, id))
      .returning();

    if (!updated) {
      throw new OfficialIconPackNotFoundError("Pack oficial não encontrado.");
    }

    return updated;
  }

  async createOfficialIcon(adminUserId: string, payload: AdminCreateOfficialIconBodyInput): Promise<OfficialIconLibraryItem> {
    const packId = sanitizeOptionalText(payload.packId, 128);
    if (packId) {
      const [pack] = await db
        .select({ id: officialIconPacks.id })
        .from(officialIconPacks)
        .where(and(
          eq(officialIconPacks.id, packId),
          eq(officialIconPacks.isActive, true),
        ))
        .limit(1);
      if (!pack) {
        throw new OfficialIconPackNotFoundError("Pack oficial não encontrado.");
      }
    }

    const imageUrl = resolveImageUrlFromInput(payload);

    const [created] = await db
      .insert(officialIconLibrary)
      .values({
        iconKey: payload.iconKey.trim(),
        name: payload.name.trim(),
        imageUrl,
        storagePath: sanitizeOptionalText(payload.storagePath, 2_000),
        category: sanitizeOptionalText(payload.category, 60),
        tags: sanitizeStringArray(payload.tags),
        aliases: sanitizeStringArray(payload.aliases),
        packId,
        isActive: payload.isActive ?? true,
        createdBy: adminUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error("Não foi possível criar o ícone oficial.");
    }

    return created;
  }

  async updateOfficialIcon(id: string, payload: AdminUpdateOfficialIconBodyInput): Promise<OfficialIconLibraryItem> {
    const updates: Partial<typeof officialIconLibrary.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (payload.iconKey !== undefined) updates.iconKey = payload.iconKey.trim();
    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.storagePath !== undefined) updates.storagePath = sanitizeOptionalText(payload.storagePath, 2_000);
    if (payload.category !== undefined) updates.category = sanitizeOptionalText(payload.category, 60);
    if (payload.tags !== undefined) updates.tags = sanitizeStringArray(payload.tags);
    if (payload.aliases !== undefined) updates.aliases = sanitizeStringArray(payload.aliases);
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;
    if (payload.packId !== undefined) {
      const packId = sanitizeOptionalText(payload.packId, 128);
      if (packId) {
        const [pack] = await db
          .select({ id: officialIconPacks.id })
          .from(officialIconPacks)
          .where(and(
            eq(officialIconPacks.id, packId),
            eq(officialIconPacks.isActive, true),
          ))
          .limit(1);
        if (!pack) {
          throw new OfficialIconPackNotFoundError("Pack oficial não encontrado.");
        }
      }
      updates.packId = packId;
    }

    if (payload.imageUrl !== undefined || payload.imageDataUrl !== undefined) {
      updates.imageUrl = resolveImageUrlFromInput({
        imageUrl: payload.imageUrl,
        imageDataUrl: payload.imageDataUrl,
      });
    }

    const [updated] = await db
      .update(officialIconLibrary)
      .set(updates)
      .where(eq(officialIconLibrary.id, id))
      .returning();

    if (!updated) {
      throw new OfficialIconNotFoundError("Ícone oficial não encontrado.");
    }

    return updated;
  }
}
