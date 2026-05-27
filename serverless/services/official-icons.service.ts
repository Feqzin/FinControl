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
  users,
  userIconLibrary,
  type OfficialIconLibraryItem,
  type OfficialIconPack,
  type UserIconLibraryItem,
} from "../../shared/schema.js";
import type {
  AdminCreateOfficialIconBodyInput,
  AdminCreateOfficialIconPackBodyInput,
  AdminUpdateOfficialIconBodyInput,
  AdminUpdateOfficialIconPackBodyInput,
  CreateCommunityPackBodyInput,
  OfficialIconPacksListQueryInput,
  PublishCommunityIconBodyInput,
  OfficialIconsListQueryInput,
  UpdateCommunityPackBodyInput,
} from "../validators/official-icons.validators.js";
import { createHash, randomUUID } from "node:crypto";

const MAX_ICON_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_SIGNATURE_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const MIN_NORMALIZED_TERM_LENGTH = 3;
const MAX_NORMALIZED_TERM_LENGTH = 140;
const COMMUNITY_ICON_KEY_PREFIX = "community:";
const COMMUNITY_PACK_ID_PREFIX = "community_pack:";
const COMMUNITY_PACK_ICON_SEGMENT = ":pack:";

export class OfficialIconNotFoundError extends Error {}
export class OfficialIconPackNotFoundError extends Error {}
export class CommunityIconPublicationNotFoundError extends Error {}
export class CommunityIconPublicationOwnershipError extends Error {}
export class CommunityPackNotFoundError extends Error {}
export class CommunityPackOwnershipError extends Error {}
export class UserIconOwnershipError extends Error {}
export class CommunityIconPublishConflictError extends Error {}

export type OfficialIconListItemView = {
  id: string;
  iconKey: string;
  sourceType: "official" | "community";
  sourceUserIconId: string | null;
  ownerUserId: string | null;
  ownerLabel: string | null;
  ownerPublicCode: string | null;
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
  sourceType: "official" | "community";
  ownerUserId: string | null;
  ownerLabel: string | null;
  ownerPublicCode: string | null;
  isPublished: boolean;
  iconsCount: number;
  addedIconsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CommunityIconPackDetailsView = {
  pack: OfficialIconPackView;
  icons: OfficialIconListItemView[];
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

type OfficialIconOrigin = "official" | "community" | "all";

type PublishedIconCandidate = {
  id: string;
  iconKey: string;
  name: string;
  imageUrl: string;
  category: string | null;
};

type UserIconLookup = {
  byId: Map<string, UserIconLibraryItem>;
  byOfficialIconId: Map<string, UserIconLibraryItem>;
  byFingerprint: Map<string, UserIconLibraryItem>;
};

function buildCommunityIconKey(ownerUserId: string, sourceUserIconId: string): string {
  return `${COMMUNITY_ICON_KEY_PREFIX}${ownerUserId}:${sourceUserIconId}`;
}

function buildCommunityPackId(ownerUserId: string): string {
  return `${COMMUNITY_PACK_ID_PREFIX}${ownerUserId}:${randomUUID()}`;
}

function buildCommunityPackIconKey(ownerUserId: string, sourceUserIconId: string, packId: string): string {
  return `${COMMUNITY_ICON_KEY_PREFIX}${ownerUserId}:${sourceUserIconId}${COMMUNITY_PACK_ICON_SEGMENT}${packId}`;
}

function parseCommunityIconKey(iconKey: string): { ownerUserId: string; sourceUserIconId: string } | null {
  const normalized = String(iconKey ?? "").trim();
  if (!normalized.startsWith(COMMUNITY_ICON_KEY_PREFIX)) {
    return null;
  }
  const payload = normalized.slice(COMMUNITY_ICON_KEY_PREFIX.length);
  const delimiterIndex = payload.indexOf(":");
  if (delimiterIndex <= 0) return null;
  const ownerUserId = payload.slice(0, delimiterIndex).trim();
  const sourcePayload = payload.slice(delimiterIndex + 1).trim();
  const sourceUserIconId = sourcePayload.split(COMMUNITY_PACK_ICON_SEGMENT)[0]?.trim() ?? "";
  if (!ownerUserId || !sourceUserIconId) return null;
  return { ownerUserId, sourceUserIconId };
}

function parseCommunityPackId(packId: string): { ownerUserId: string } | null {
  const normalized = String(packId ?? "").trim();
  if (!normalized.startsWith(COMMUNITY_PACK_ID_PREFIX)) return null;
  const payload = normalized.slice(COMMUNITY_PACK_ID_PREFIX.length);
  const delimiterIndex = payload.indexOf(":");
  if (delimiterIndex <= 0) return null;
  const ownerUserId = payload.slice(0, delimiterIndex).trim();
  if (!ownerUserId) return null;
  return { ownerUserId };
}

function resolveIconOrigin(iconKey: string): "official" | "community" {
  return parseCommunityIconKey(iconKey) ? "community" : "official";
}

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

function resolvePublicAuthorLabel(user: { nomeCompleto: string | null; username: string | null } | null | undefined): string {
  const displayName = sanitizeOptionalText(user?.nomeCompleto, 80);
  if (displayName) return displayName;

  const username = sanitizeOptionalText(user?.username, 120);
  if (username) {
    const safeUsername = username.includes("@")
      ? sanitizeOptionalText(username.split("@")[0] ?? "", 60)
      : username;
    if (safeUsername) return safeUsername;
  }

  return "Usuário";
}

function buildFallbackPublicCodeFromUserId(userId: string): string {
  const hash = createHash("sha256").update(userId).digest("hex").slice(0, 8).toUpperCase();
  return `USR-${hash}`;
}

function resolvePublicCode(
  value: string | null | undefined,
  userId: string,
): string {
  const trimmed = sanitizeOptionalText(value, 24);
  if (trimmed) return trimmed;
  return buildFallbackPublicCodeFromUserId(userId);
}

function isMissingUsersPublicCodeColumnError(error: unknown): boolean {
  const messages: string[] = [];
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === "string") {
      messages.push(current.toLowerCase());
      continue;
    }

    if (typeof current === "object") {
      const maybeError = current as { message?: unknown; code?: unknown; cause?: unknown };
      if (typeof maybeError.message === "string") {
        messages.push(maybeError.message.toLowerCase());
      }
      if (typeof maybeError.code === "string") {
        messages.push(maybeError.code.toLowerCase());
      }
      if (maybeError.cause !== undefined) {
        queue.push(maybeError.cause);
      }
    }
  }

  const combined = messages.join(" | ");
  return combined.includes("42703") && combined.includes("public_code");
}

type PublicUserProfile = {
  displayName: string;
  publicCode: string;
};

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

function normalizeCategoryTerm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildIconFingerprint(name: string, category: string | null, imageUrl: string): string {
  const normalizedName = normalizeIconTerm(name);
  const normalizedCategory = normalizeCategoryTerm(category);
  const imageHash = createHash("sha1").update(String(imageUrl ?? "").trim()).digest("hex").slice(0, 16);
  return `${normalizedName}|${normalizedCategory}|${imageHash}`;
}

export class OfficialIconLibraryService {
  private async loadUserIconLookup(userId: string): Promise<UserIconLookup> {
    const rows = await db
      .select()
      .from(userIconLibrary)
      .where(eq(userIconLibrary.userId, userId));

    const byId = new Map<string, UserIconLibraryItem>();
    const byOfficialIconId = new Map<string, UserIconLibraryItem>();
    const byFingerprint = new Map<string, UserIconLibraryItem>();

    for (const row of rows) {
      byId.set(row.id, row);
      if (row.officialIconId) {
        byOfficialIconId.set(row.officialIconId, row);
      }
      const fingerprint = buildIconFingerprint(row.name, row.category, row.imageUrl);
      if (!byFingerprint.has(fingerprint)) {
        byFingerprint.set(fingerprint, row);
      }
    }

    return {
      byId,
      byOfficialIconId,
      byFingerprint,
    };
  }

  private registerUserIconInLookup(lookup: UserIconLookup, row: UserIconLibraryItem): void {
    lookup.byId.set(row.id, row);
    if (row.officialIconId) {
      lookup.byOfficialIconId.set(row.officialIconId, row);
    }
    const fingerprint = buildIconFingerprint(row.name, row.category, row.imageUrl);
    if (!lookup.byFingerprint.has(fingerprint)) {
      lookup.byFingerprint.set(fingerprint, row);
    }
  }

  private findExistingUserIconForPublishedIcon(
    userId: string,
    publishedIcon: PublishedIconCandidate,
    lookup: UserIconLookup,
  ): UserIconLibraryItem | null {
    const byOfficialId = lookup.byOfficialIconId.get(publishedIcon.id);
    if (byOfficialId) return byOfficialId;

    const parsedCommunity = parseCommunityIconKey(publishedIcon.iconKey);
    if (parsedCommunity && parsedCommunity.ownerUserId === userId) {
      const bySourceUserIconId = lookup.byId.get(parsedCommunity.sourceUserIconId);
      if (bySourceUserIconId) return bySourceUserIconId;
    }

    const fingerprint = buildIconFingerprint(publishedIcon.name, publishedIcon.category, publishedIcon.imageUrl);
    const byFingerprint = lookup.byFingerprint.get(fingerprint);
    if (byFingerprint) return byFingerprint;

    return null;
  }

  private async getPublicUserProfilesByIds(userIds: string[]): Promise<Map<string, PublicUserProfile>> {
    const uniqueUserIds = Array.from(
      new Set(
        userIds
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );

    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const profiles = new Map<string, PublicUserProfile>();
    const assignProfiles = (
      rows: Array<{ id: string; username: string | null; nomeCompleto: string | null; publicCode?: string | null }>,
    ): void => {
      for (const row of rows) {
        profiles.set(row.id, {
          displayName: resolvePublicAuthorLabel(row),
          publicCode: resolvePublicCode(row.publicCode ?? null, row.id),
        });
      }
    };

    try {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          nomeCompleto: users.nomeCompleto,
          publicCode: users.publicCode,
        })
        .from(users)
        .where(inArray(users.id, uniqueUserIds));
      assignProfiles(rows);
    } catch (error) {
      if (!isMissingUsersPublicCodeColumnError(error)) throw error;
      const fallbackRows = await db
        .select({
          id: users.id,
          username: users.username,
          nomeCompleto: users.nomeCompleto,
        })
        .from(users)
        .where(inArray(users.id, uniqueUserIds));
      assignProfiles(fallbackRows);
    }

    for (const userId of uniqueUserIds) {
      if (profiles.has(userId)) continue;
      profiles.set(userId, {
        displayName: "Usuário",
        publicCode: buildFallbackPublicCodeFromUserId(userId),
      });
    }

    return profiles;
  }

  private async getPublicUserProfile(userId: string | null | undefined): Promise<PublicUserProfile> {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return {
        displayName: "Usuário",
        publicCode: buildFallbackPublicCodeFromUserId("anonymous"),
      };
    }

    const profiles = await this.getPublicUserProfilesByIds([normalizedUserId]);
    return profiles.get(normalizedUserId) ?? {
      displayName: "Usuário",
      publicCode: buildFallbackPublicCodeFromUserId(normalizedUserId),
    };
  }

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

  private async loadActiveOfficialIconById(
    id: string,
    options: { origin?: OfficialIconOrigin } = {},
  ): Promise<OfficialIconLike> {
    const origin = options.origin ?? "all";
    const originFilter = origin === "community"
      ? sql`${officialIconLibrary.iconKey} like ${`${COMMUNITY_ICON_KEY_PREFIX}%`}`
      : origin === "official"
        ? sql`${officialIconLibrary.iconKey} not like ${`${COMMUNITY_ICON_KEY_PREFIX}%`}`
        : undefined;

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
        ...(originFilter ? [originFilter] : []),
      ))
      .limit(1);

    if (!row) {
      throw new OfficialIconNotFoundError("Ícone oficial não encontrado.");
    }

    return row;
  }

  async listOfficialIcons(userId: string, query: OfficialIconsListQueryInput): Promise<OfficialIconListItemView[]> {
    const origin = query.origin ?? "official";
    const originFilter = origin === "community"
      ? sql`${officialIconLibrary.iconKey} like ${`${COMMUNITY_ICON_KEY_PREFIX}%`}`
      : origin === "official"
        ? sql`${officialIconLibrary.iconKey} not like ${`${COMMUNITY_ICON_KEY_PREFIX}%`}`
        : undefined;

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
        createdBy: officialIconLibrary.createdBy,
        createdAt: officialIconLibrary.createdAt,
        updatedAt: officialIconLibrary.updatedAt,
      })
      .from(officialIconLibrary)
      .leftJoin(officialIconPacks, eq(officialIconLibrary.packId, officialIconPacks.id))
      .where(and(
        eq(officialIconLibrary.isActive, true),
        or(isNull(officialIconLibrary.packId), eq(officialIconPacks.isActive, true)),
        ...(originFilter ? [originFilter] : []),
      ))
      .orderBy(asc(officialIconLibrary.name), desc(officialIconLibrary.createdAt));

    const normalizedSearch = normalizeIconTerm(query.search ?? "");
    const normalizedCategory = (query.category ?? "").trim().toLowerCase();
    const packId = (query.packId ?? "").trim();
    const includePackItems = query.includePackItems === true;

    const ownerUserIdByIconId = new Map<string, string | null>();
    let icons = rows.map<OfficialIconListItemView>((row) => {
      const sourceType = resolveIconOrigin(row.iconKey);
      const ownerUserId = sourceType === "community"
        ? (parseCommunityIconKey(row.iconKey)?.ownerUserId ?? row.createdBy ?? null)
        : null;
      ownerUserIdByIconId.set(row.id, ownerUserId);

      return {
        sourceType,
        sourceUserIconId: parseCommunityIconKey(row.iconKey)?.sourceUserIconId ?? null,
        ownerUserId: null,
        ownerLabel: sourceType === "community" ? "Usuário" : null,
        ownerPublicCode: sourceType === "community" ? null : null,
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
      };
    });

    if (normalizedCategory) {
      icons = icons.filter((icon) => (icon.category ?? "").trim().toLowerCase() === normalizedCategory);
    }
    if (packId) {
      icons = icons.filter((icon) => icon.packId === packId);
    } else if (!includePackItems) {
      icons = icons.filter((icon) => !icon.packId);
    }
    if (normalizedSearch) {
      icons = icons.filter((icon) => iconMatchesSearch(icon, normalizedSearch));
    }

    const ownerUserIds = Array.from(
      new Set(
        icons
          .map((icon) => ownerUserIdByIconId.get(icon.id))
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );
    const ownerProfilesByUserId = await this.getPublicUserProfilesByIds(ownerUserIds);
    icons = icons.map((icon) => {
      if (icon.sourceType !== "community") return icon;
      const ownerUserId = ownerUserIdByIconId.get(icon.id);
      if (!ownerUserId) {
        return {
          ...icon,
          ownerLabel: "Usuário",
          ownerPublicCode: null,
        };
      }
      const profile = ownerProfilesByUserId.get(ownerUserId);
      return {
        ...icon,
        ownerLabel: profile?.displayName ?? "Usuário",
        ownerPublicCode: profile?.publicCode ?? buildFallbackPublicCodeFromUserId(ownerUserId),
      };
    });

    if (icons.length === 0) {
      return [];
    }

    const userIconLookup = await this.loadUserIconLookup(userId);

    return icons.map((icon) => ({
      ...icon,
      alreadyInLibrary: Boolean(
        this.findExistingUserIconForPublishedIcon(userId, {
          id: icon.id,
          iconKey: icon.iconKey,
          name: icon.name,
          imageUrl: icon.imageUrl,
          category: icon.category,
        }, userIconLookup),
      ),
    }));
  }

  async listOfficialPacks(
    userId: string,
    query: OfficialIconPacksListQueryInput = {},
  ): Promise<OfficialIconPackView[]> {
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

    const packOwnershipRows = await db
      .select({
        packId: officialIconLibrary.packId,
        iconKey: officialIconLibrary.iconKey,
        createdBy: officialIconLibrary.createdBy,
      })
      .from(officialIconLibrary)
      .where(and(
        eq(officialIconLibrary.isActive, true),
        inArray(officialIconLibrary.packId, packIds),
      ))
      .orderBy(asc(officialIconLibrary.createdAt));

    const packIcons = await db
      .select({
        id: officialIconLibrary.id,
        packId: officialIconLibrary.packId,
        iconKey: officialIconLibrary.iconKey,
        name: officialIconLibrary.name,
        imageUrl: officialIconLibrary.imageUrl,
        category: officialIconLibrary.category,
      })
      .from(officialIconLibrary)
      .where(and(
        eq(officialIconLibrary.isActive, true),
        inArray(officialIconLibrary.packId, packIds),
      ));

    const iconCountByPackId = new Map<string, number>();
    for (const row of iconCounts) {
      if (!row.packId) continue;
      iconCountByPackId.set(row.packId, Number(row.count) || 0);
    }

    const userIconLookup = await this.loadUserIconLookup(userId);
    const addedCountByPackId = new Map<string, number>();
    for (const icon of packIcons) {
      const packId = icon.packId ?? "";
      if (!packId) continue;
      const exists = this.findExistingUserIconForPublishedIcon(userId, {
        id: icon.id,
        iconKey: icon.iconKey,
        name: icon.name,
        imageUrl: icon.imageUrl,
        category: icon.category ?? null,
      }, userIconLookup);
      if (!exists) continue;
      addedCountByPackId.set(packId, (addedCountByPackId.get(packId) ?? 0) + 1);
    }

    const sourceByPackId = new Map<string, "official" | "community">();
    const ownerByPackId = new Map<string, string | null>();
    for (const row of packOwnershipRows) {
      const packId = row.packId ?? "";
      if (!packId) continue;
      const parsedCommunity = parseCommunityIconKey(row.iconKey);
      if (parsedCommunity) {
        sourceByPackId.set(packId, "community");
        ownerByPackId.set(packId, parsedCommunity.ownerUserId || row.createdBy || null);
      } else if (!sourceByPackId.has(packId)) {
        sourceByPackId.set(packId, "official");
      }
    }

    const ownerUserIds = Array.from(
      new Set(
        Array.from(ownerByPackId.values()).filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );
    const ownerProfilesByUserId = await this.getPublicUserProfilesByIds(ownerUserIds);

    let list = packs.map((pack) => {
      const sourceType = sourceByPackId.get(pack.id) ?? (parseCommunityPackId(pack.id) ? "community" : "official");
      const ownerUserId = sourceType === "community"
        ? ownerByPackId.get(pack.id) ?? parseCommunityPackId(pack.id)?.ownerUserId ?? null
        : null;
      const ownerProfile = ownerUserId ? ownerProfilesByUserId.get(ownerUserId) : undefined;
      const ownerLabel = sourceType === "community"
        ? ownerProfile?.displayName ?? "Usuário"
        : null;
      const ownerPublicCode = sourceType === "community"
        ? (ownerProfile?.publicCode ?? (ownerUserId ? buildFallbackPublicCodeFromUserId(ownerUserId) : null))
        : null;

      return {
        id: pack.id,
        name: pack.name,
        description: pack.description ?? null,
        category: pack.category ?? null,
        coverImageUrl: pack.coverImageUrl ?? null,
        sourceType,
        ownerUserId: null,
        ownerLabel,
        ownerPublicCode,
        isPublished: Boolean(pack.isActive),
        iconsCount: iconCountByPackId.get(pack.id) ?? 0,
        addedIconsCount: addedCountByPackId.get(pack.id) ?? 0,
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt,
      } satisfies OfficialIconPackView;
    });

    const normalizedSearch = normalizeIconTerm(query.search ?? "");
    const normalizedCategory = (query.category ?? "").trim().toLowerCase();
    const origin = query.origin ?? "all";

    if (origin !== "all") {
      list = list.filter((pack) => pack.sourceType === origin);
    }
    if (normalizedCategory) {
      list = list.filter((pack) => (pack.category ?? "").trim().toLowerCase() === normalizedCategory);
    }
    if (normalizedSearch) {
      list = list.filter((pack) => normalizeIconTerm([
        pack.name,
        pack.description ?? "",
        pack.category ?? "",
        pack.ownerLabel ?? "",
        pack.ownerPublicCode ?? "",
      ].join(" ")).includes(normalizedSearch));
    }

    return list;
  }

  private async addOfficialLibraryIconToUserLibrary(
    userId: string,
    officialIconId: string,
    sourceType: "official" | "community",
    options: { userIconLookup?: UserIconLookup } = {},
  ): Promise<{
    icon: UserIconLibraryItem;
    alreadyInLibrary: boolean;
    createdMatchRules: number;
  }> {
    const officialIcon = await this.loadActiveOfficialIconById(officialIconId, { origin: sourceType });
    const lookup = options.userIconLookup ?? await this.loadUserIconLookup(userId);

    const existing = this.findExistingUserIconForPublishedIcon(userId, {
      id: officialIcon.id,
      iconKey: officialIcon.iconKey,
      name: officialIcon.name,
      imageUrl: officialIcon.imageUrl,
      category: officialIcon.category ?? null,
    }, lookup);

    if (existing) {
      const shouldRefreshFromOfficial = existing.officialIconId === officialIconId;
      let row = existing;
      if (shouldRefreshFromOfficial) {
        const [updated] = await db
          .update(userIconLibrary)
          .set({
            sourceType,
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
        if (updated) {
          row = updated;
          this.registerUserIconInLookup(lookup, updated);
        }
      }

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
          sourceType,
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
        this.registerUserIconInLookup(lookup, existingAfterConflict);
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

    this.registerUserIconInLookup(lookup, created);
    const createdMatchRules = await this.upsertMatchRulesForOfficialIcon(userId, created.imageUrl, officialIcon);
    return {
      icon: created,
      alreadyInLibrary: false,
      createdMatchRules,
    };
  }

  async addOfficialIconToLibrary(userId: string, officialIconId: string): Promise<{
    icon: UserIconLibraryItem;
    alreadyInLibrary: boolean;
    createdMatchRules: number;
  }> {
    return this.addOfficialLibraryIconToUserLibrary(userId, officialIconId, "official");
  }

  async addCommunityIconToLibrary(userId: string, communityIconId: string): Promise<{
    icon: UserIconLibraryItem;
    alreadyInLibrary: boolean;
    createdMatchRules: number;
  }> {
    return this.addOfficialLibraryIconToUserLibrary(userId, communityIconId, "community");
  }

  async publishCommunityIcon(
    userId: string,
    payload: PublishCommunityIconBodyInput,
  ): Promise<{ publication: OfficialIconLibraryItem; alreadyPublished: boolean }> {
    const [sourceIcon] = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.id, payload.userIconId),
        eq(userIconLibrary.userId, userId),
      ))
      .limit(1);

    if (!sourceIcon) {
      throw new UserIconOwnershipError("Ícone pessoal não encontrado.");
    }

    if (sourceIcon.sourceType === "official" && sourceIcon.officialIconId) {
      throw new CommunityIconPublishConflictError("Esse ícone já pertence ao catálogo explorável.");
    }

    const iconKey = buildCommunityIconKey(userId, sourceIcon.id);
    const snapshotTags = sanitizeStringArray(sourceIcon.tags);
    const snapshotAliases = snapshotTags;

    const [existingPublication] = await db
      .select()
      .from(officialIconLibrary)
      .where(eq(officialIconLibrary.iconKey, iconKey))
      .limit(1);

    if (existingPublication) {
      const [updated] = await db
        .update(officialIconLibrary)
        .set({
          name: sourceIcon.name,
          imageUrl: sourceIcon.imageUrl,
          storagePath: sourceIcon.storagePath,
          category: sourceIcon.category,
          tags: snapshotTags,
          aliases: snapshotAliases,
          isActive: true,
          createdBy: userId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(officialIconLibrary.id, existingPublication.id),
          eq(officialIconLibrary.iconKey, iconKey),
        ))
        .returning();

      if (!updated) {
        throw new Error("Não foi possível atualizar a publicação do ícone.");
      }

      return { publication: updated, alreadyPublished: true };
    }

    const [created] = await db
      .insert(officialIconLibrary)
      .values({
        iconKey,
        name: sourceIcon.name,
        imageUrl: sourceIcon.imageUrl,
        storagePath: sourceIcon.storagePath,
        category: sourceIcon.category,
        tags: snapshotTags,
        aliases: snapshotAliases,
        packId: null,
        isActive: true,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error("Não foi possível publicar o ícone.");
    }

    return { publication: created, alreadyPublished: false };
  }

  async listCommunityIcons(userId: string, query: OfficialIconsListQueryInput): Promise<OfficialIconListItemView[]> {
    return this.listOfficialIcons(userId, {
      ...query,
      origin: "community",
    });
  }

  async unpublishCommunityIcon(
    userId: string,
    communityIconId: string,
    options: { canManageAny?: boolean } = {},
  ): Promise<OfficialIconLibraryItem> {
    const [existing] = await db
      .select()
      .from(officialIconLibrary)
      .where(and(
        eq(officialIconLibrary.id, communityIconId),
        sql`${officialIconLibrary.iconKey} like ${`${COMMUNITY_ICON_KEY_PREFIX}%`}`,
      ))
      .limit(1);

    if (!existing) {
      throw new CommunityIconPublicationNotFoundError("Publicação comunitária não encontrada.");
    }

    const ownership = parseCommunityIconKey(existing.iconKey)?.ownerUserId ?? existing.createdBy ?? null;
    if (ownership !== userId && !options.canManageAny) {
      throw new CommunityIconPublicationOwnershipError("Você não pode despublicar este ícone.");
    }

    const [updated] = await db
      .update(officialIconLibrary)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(officialIconLibrary.id, communityIconId))
      .returning();

    if (!updated) {
      throw new CommunityIconPublicationNotFoundError("Publicação comunitária não encontrada.");
    }

    return updated;
  }

  private async resolvePackSourceAndOwner(packId: string): Promise<{
    sourceType: "official" | "community";
    ownerUserId: string | null;
  }> {
    const rows = await db
      .select({
        iconKey: officialIconLibrary.iconKey,
        createdBy: officialIconLibrary.createdBy,
      })
      .from(officialIconLibrary)
      .where(eq(officialIconLibrary.packId, packId))
      .orderBy(asc(officialIconLibrary.createdAt));

    for (const row of rows) {
      const parsedCommunity = parseCommunityIconKey(row.iconKey);
      if (parsedCommunity) {
        return {
          sourceType: "community",
          ownerUserId: parsedCommunity.ownerUserId || row.createdBy || null,
        };
      }
    }

    const parsedPackId = parseCommunityPackId(packId);
    if (parsedPackId) {
      return {
        sourceType: "community",
        ownerUserId: parsedPackId.ownerUserId,
      };
    }

    return {
      sourceType: "official",
      ownerUserId: null,
    };
  }

  private async assertCommunityPackOwnership(
    userId: string,
    packId: string,
    options: { canManageAny?: boolean } = {},
  ): Promise<OfficialIconPack> {
    const [pack] = await db
      .select()
      .from(officialIconPacks)
      .where(eq(officialIconPacks.id, packId))
      .limit(1);

    if (!pack) {
      throw new CommunityPackNotFoundError("Pack comunitário não encontrado.");
    }

    const metadata = await this.resolvePackSourceAndOwner(packId);
    if (metadata.sourceType !== "community") {
      throw new CommunityPackNotFoundError("Pack comunitário não encontrado.");
    }

    if (metadata.ownerUserId !== userId && !options.canManageAny) {
      throw new CommunityPackOwnershipError("Você não pode alterar este pack.");
    }

    return pack;
  }

  async listCommunityPacks(
    userId: string,
    query: OfficialIconPacksListQueryInput = {},
  ): Promise<OfficialIconPackView[]> {
    return this.listOfficialPacks(userId, {
      ...query,
      origin: "community",
    });
  }

  async getCommunityPackDetails(
    userId: string,
    packId: string,
  ): Promise<CommunityIconPackDetailsView> {
    const packs = await this.listCommunityPacks(userId, { origin: "community" });
    const pack = packs.find((item) => item.id === packId) ?? null;
    if (!pack) {
      throw new CommunityPackNotFoundError("Pack comunitário não encontrado.");
    }

    const icons = await this.listCommunityIcons(userId, {
      origin: "community",
      packId,
    });

    return { pack, icons };
  }

  async createCommunityPack(
    userId: string,
    payload: CreateCommunityPackBodyInput,
  ): Promise<CommunityIconPackDetailsView> {
    const iconIds = Array.from(new Set(payload.userIconIds.map((id) => id.trim()).filter(Boolean)));
    if (iconIds.length === 0) {
      throw new UserIconOwnershipError("Selecione ao menos um ícone pessoal para criar o pack.");
    }

    const sourceIcons = await db
      .select()
      .from(userIconLibrary)
      .where(and(
        eq(userIconLibrary.userId, userId),
        inArray(userIconLibrary.id, iconIds),
      ));

    if (sourceIcons.length !== iconIds.length) {
      throw new UserIconOwnershipError("Você só pode criar pack com ícones da sua biblioteca.");
    }

    const publish = payload.publish ?? true;
    const now = new Date();
    const packId = buildCommunityPackId(userId);
    const [createdPack] = await db
      .insert(officialIconPacks)
      .values({
        id: packId,
        name: payload.name.trim(),
        description: sanitizeOptionalText(payload.description, 280),
        category: sanitizeOptionalText(payload.category, 60),
        coverImageUrl: sourceIcons[0]?.imageUrl ?? null,
        isActive: publish,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!createdPack) {
      throw new Error("Não foi possível criar o pack comunitário.");
    }

    const snapshots = sourceIcons.map((sourceIcon) => {
      const snapshotTags = sanitizeStringArray(sourceIcon.tags);
      return {
        iconKey: buildCommunityPackIconKey(userId, sourceIcon.id, packId),
        name: sourceIcon.name,
        imageUrl: sourceIcon.imageUrl,
        storagePath: sourceIcon.storagePath,
        category: sanitizeOptionalText(sourceIcon.category, 60),
        tags: snapshotTags,
        aliases: snapshotTags,
        packId,
        isActive: publish,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };
    });

    if (snapshots.length > 0) {
      await db.insert(officialIconLibrary).values(snapshots);
    }

    const communityPacks = await this.listOfficialPacks(userId, { origin: "community" });
    let createdPackView = communityPacks.find((item) => item.id === packId);
    if (!createdPackView) {
      const owner = await this.getPublicUserProfile(userId);

      createdPackView = {
        id: createdPack.id,
        name: createdPack.name,
        description: createdPack.description ?? null,
        category: createdPack.category ?? null,
        coverImageUrl: createdPack.coverImageUrl ?? null,
        sourceType: "community",
        ownerUserId: null,
        ownerLabel: owner.displayName,
        ownerPublicCode: owner.publicCode,
        isPublished: Boolean(createdPack.isActive),
        iconsCount: snapshots.length,
        addedIconsCount: 0,
        createdAt: createdPack.createdAt,
        updatedAt: createdPack.updatedAt,
      };
    }

    const icons = await this.listCommunityIcons(userId, { packId, origin: "community" });
    return {
      pack: createdPackView,
      icons,
    };
  }

  async addCommunityPackToLibrary(userId: string, packId: string): Promise<{
    packId: string;
    totalIcons: number;
    addedCount: number;
    alreadyInLibraryCount: number;
    createdMatchRules: number;
  }> {
    const metadata = await this.resolvePackSourceAndOwner(packId);
    if (metadata.sourceType !== "community") {
      throw new CommunityPackNotFoundError("Pack comunitário não encontrado.");
    }
    return this.addOfficialPackToLibrary(userId, packId);
  }

  async updateCommunityPack(
    userId: string,
    packId: string,
    payload: UpdateCommunityPackBodyInput,
    options: { canManageAny?: boolean } = {},
  ): Promise<OfficialIconPack> {
    await this.assertCommunityPackOwnership(userId, packId, options);

    const updates: Partial<typeof officialIconPacks.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.description !== undefined) updates.description = sanitizeOptionalText(payload.description, 280);
    if (payload.category !== undefined) updates.category = sanitizeOptionalText(payload.category, 60);
    if (payload.publish !== undefined) updates.isActive = payload.publish;

    const [updated] = await db
      .update(officialIconPacks)
      .set(updates)
      .where(eq(officialIconPacks.id, packId))
      .returning();

    if (!updated) {
      throw new CommunityPackNotFoundError("Pack comunitário não encontrado.");
    }

    if (payload.publish !== undefined) {
      await db
        .update(officialIconLibrary)
        .set({
          isActive: payload.publish,
          updatedAt: new Date(),
        })
        .where(and(
          eq(officialIconLibrary.packId, packId),
          sql`${officialIconLibrary.iconKey} like ${`${COMMUNITY_ICON_KEY_PREFIX}%`}`,
        ));
    }

    return updated;
  }

  async unpublishCommunityPack(
    userId: string,
    packId: string,
    options: { canManageAny?: boolean } = {},
  ): Promise<OfficialIconPack> {
    return this.updateCommunityPack(
      userId,
      packId,
      { publish: false },
      options,
    );
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
      throw new OfficialIconPackNotFoundError("Pack não encontrado.");
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
    const userIconLookup = await this.loadUserIconLookup(userId);

    for (const icon of icons) {
      const sourceType = resolveIconOrigin(icon.iconKey);
      const added = await this.addOfficialLibraryIconToUserLibrary(userId, icon.id, sourceType, {
        userIconLookup,
      });
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
