import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { ENV } from "../../env";
import { createOfficialIconsController } from "../../controllers/official-icons.controller";

type InMemoryOfficialIcon = {
  id: string;
  iconKey: string;
  packItemPublicCode: string | null;
  name: string;
  imageUrl: string;
  category: string | null;
  tags: string[];
  aliases: string[];
  packId: string | null;
  packName: string | null;
  isActive: boolean;
  createdBy: string | null;
};

type InMemoryPack = {
  id: string;
  publicCode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  coverIconId: string | null;
  coverImageUrl: string | null;
  sourceType: "official" | "community";
  ownerUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type InMemoryUserIcon = {
  id: string;
  userId: string;
  sourceType: "upload" | "official" | "community";
  officialIconId: string | null;
  name: string;
  imageUrl: string;
  category: string | null;
  tags: string[];
};

type InMemoryPackInstall = {
  userId: string;
  packId: string;
  createdAt: Date;
};

type InMemoryPackRating = {
  userId: string;
  packId: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
};

const COMMUNITY_PREFIX = "community:";
const COMMUNITY_PACK_ICON_SEGMENT = ":pack:";

function buildPackPublicCode(ownerPublicCode: string, index: number): string {
  return `${ownerPublicCode}-P${String(index).padStart(3, "0")}`;
}

function buildPackItemPublicCode(packPublicCode: string, index: number): string {
  return `${packPublicCode}-I${String(index).padStart(3, "0")}`;
}

function isCommunityIconKey(iconKey: string): boolean {
  return iconKey.startsWith(COMMUNITY_PREFIX);
}

function parseCommunityKeyParts(iconKey: string): { ownerUserId: string; sourceUserIconId: string } | null {
  if (!isCommunityIconKey(iconKey)) return null;
  const payload = iconKey.slice(COMMUNITY_PREFIX.length);
  const delimiterIndex = payload.indexOf(":");
  if (delimiterIndex <= 0) return null;
  const ownerUserId = payload.slice(0, delimiterIndex).trim();
  const sourcePayload = payload.slice(delimiterIndex + 1).trim();
  const sourceUserIconId = sourcePayload.split(COMMUNITY_PACK_ICON_SEGMENT)[0]?.trim() ?? "";
  if (!ownerUserId || !sourceUserIconId) return null;
  return { ownerUserId, sourceUserIconId };
}

function parseCommunitySourceUserIconId(iconKey: string): string | null {
  return parseCommunityKeyParts(iconKey)?.sourceUserIconId ?? null;
}

function normalizeIconTerm(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function buildIconFingerprint(name: string, category: string | null, imageUrl: string): string {
  return `${normalizeIconTerm(name)}|${normalizeIconTerm(category)}|${String(imageUrl ?? "").trim()}`;
}

function buildIconNameCategoryFingerprint(name: string, category: string | null): string {
  return `${normalizeIconTerm(name)}|${normalizeIconTerm(category)}`;
}

const PUBLIC_USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/;

const testPublicUsersById: Record<string, { username: string | null }> = {
  user_a: { username: "fernandoq87" },
  user_b: { username: "elza.finance@example.com" },
  admin_user: { username: "admin" },
};

function resolvePublicOwnerLabel(ownerUserId: string | null | undefined): string {
  if (!ownerUserId) return "Usuário";
  const profile = testPublicUsersById[ownerUserId];
  const ownerPublicCode = `USR-${ownerUserId.toUpperCase()}`;
  if (!profile) return `Usuário ${ownerPublicCode.slice(0, 8)}`;

  const username = String(profile.username ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (PUBLIC_USERNAME_REGEX.test(username)) {
    return `@${username}`;
  }

  return `Usuário ${ownerPublicCode.slice(0, 8)}`;
}

function createInMemoryServiceFixture() {
  const packs: InMemoryPack[] = [
    {
      id: "pack-bancos",
      publicCode: "USR-ADMIN_USER-P001",
      name: "Bancos BR",
      description: "Ícones oficiais de bancos",
      category: "bancos",
      coverIconId: null,
      coverImageUrl: null,
      sourceType: "official",
      ownerUserId: null,
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    },
  ];

  const officialIcons: InMemoryOfficialIcon[] = [
    {
      id: "official-kabum",
      iconKey: "kabum-official",
      packItemPublicCode: "USR-ADMIN_USER-P001-I001",
      name: "KaBuM",
      imageUrl: "data:image/png;base64,kabum",
      category: "marketplaces",
      tags: ["kabum", "lojas"],
      aliases: ["mlp kabum", "kabum.com"],
      packId: "pack-bancos",
      packName: "Bancos BR",
      isActive: true,
      createdBy: "admin_user",
    },
    {
      id: "official-inativo",
      iconKey: "off-inativo",
      packItemPublicCode: "USR-ADMIN_USER-P001-I099",
      name: "Inativo",
      imageUrl: "data:image/png;base64,inativo",
      category: "marketplaces",
      tags: [],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos BR",
      isActive: false,
      createdBy: "admin_user",
    },
  ];

  const userIcons: InMemoryUserIcon[] = [
    {
      id: "user-upload-a",
      userId: "user_a",
      sourceType: "upload",
      officialIconId: null,
      name: "Club Ifood",
      imageUrl: "data:image/png;base64,ifood-club",
      category: "delivery",
      tags: ["ifood", "club ifood"],
    },
    {
      id: "user-upload-b",
      userId: "user_b",
      sourceType: "upload",
      officialIconId: null,
      name: "Mercado Pago Custom",
      imageUrl: "data:image/png;base64,mp-custom",
      category: "carteira",
      tags: ["mercado pago", "mp"],
    },
  ];

  const rules: Array<{ userId: string; iconId: string; term: string }> = [];
  const packInstalls: InMemoryPackInstall[] = [];
  const packRatings: InMemoryPackRating[] = [];
  let userIconSeq = 1;
  let officialSeq = 1;

  const findExistingUserIconForOfficial = (userId: string, icon: InMemoryOfficialIcon): InMemoryUserIcon | null => {
    const byOfficialId = userIcons.find((row) => row.userId === userId && row.officialIconId === icon.id);
    if (byOfficialId) return byOfficialId;

    const parsedCommunity = parseCommunityKeyParts(icon.iconKey);
    if (parsedCommunity && parsedCommunity.ownerUserId === userId) {
      const bySourceUserIconId = userIcons.find((row) =>
        row.userId === userId && row.id === parsedCommunity.sourceUserIconId);
      if (bySourceUserIconId) return bySourceUserIconId;
    }

    const fingerprint = buildIconFingerprint(icon.name, icon.category, icon.imageUrl);
    const byFingerprint = userIcons.find((row) =>
      row.userId === userId && buildIconFingerprint(row.name, row.category, row.imageUrl) === fingerprint);
    if (byFingerprint) return byFingerprint;

    return null;
  };

  const mapListItem = (icon: InMemoryOfficialIcon, userId: string) => ({
    id: icon.id,
    iconKey: icon.iconKey,
    packItemPublicCode: icon.packItemPublicCode,
    sourceType: isCommunityIconKey(icon.iconKey) ? "community" : "official",
    sourceUserIconId: parseCommunitySourceUserIconId(icon.iconKey),
    ownerUserId: isCommunityIconKey(icon.iconKey) ? icon.createdBy : null,
    ownerLabel: isCommunityIconKey(icon.iconKey) ? resolvePublicOwnerLabel(icon.createdBy) : null,
    ownerPublicCode: isCommunityIconKey(icon.iconKey) && icon.createdBy ? `USR-${icon.createdBy.toUpperCase()}` : null,
    name: icon.name,
    imageUrl: icon.imageUrl,
    storagePath: null,
    category: icon.category,
    tags: icon.tags,
    aliases: icon.aliases,
    packId: icon.packId,
    packName: icon.packName,
    packPublicCode: packs.find((pack) => pack.id === icon.packId)?.publicCode ?? null,
    alreadyInLibrary: Boolean(findExistingUserIconForOfficial(userId, icon)),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const addToLibrary = (userId: string, iconId: string, sourceType: "official" | "community") => {
    const icon = officialIcons.find((row) =>
      row.id === iconId
      && row.isActive
      && (sourceType === "community" ? isCommunityIconKey(row.iconKey) : !isCommunityIconKey(row.iconKey)));

    if (!icon) {
      const message = sourceType === "community" ? "Ícone publicado não encontrado." : "Ícone oficial não encontrado.";
      const error = new Error(message);
      error.name = "OfficialIconNotFoundError";
      throw error;
    }

    const existing = findExistingUserIconForOfficial(userId, icon);
    if (existing) {
      return {
        icon: {
          id: existing.id,
          userId,
          sourceType: existing.sourceType,
          officialIconId: icon.id,
          name: existing.name,
          imageUrl: existing.imageUrl,
          storagePath: null,
          category: existing.category,
          tags: existing.tags,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        alreadyInLibrary: true,
        createdMatchRules: 0,
      };
    }

    const row: InMemoryUserIcon = {
      id: `user_icon_${userIconSeq++}`,
      userId,
      sourceType,
      officialIconId: icon.id,
      name: icon.name,
      imageUrl: icon.imageUrl,
      category: icon.category,
      tags: icon.tags,
    };
    userIcons.push(row);

    const terms = [icon.name, ...icon.tags, ...icon.aliases];
    let createdMatchRules = 0;
    for (const term of terms) {
      if (!rules.some((rule) => rule.userId === userId && rule.term === term)) {
        rules.push({ userId, iconId: row.imageUrl, term });
        createdMatchRules += 1;
      }
    }

    return {
      icon: {
        id: row.id,
        userId,
        sourceType: row.sourceType,
        officialIconId: icon.id,
        name: row.name,
        imageUrl: row.imageUrl,
        storagePath: null,
        category: row.category,
        tags: row.tags,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      alreadyInLibrary: false,
      createdMatchRules,
    };
  };

  const sortPackViews = (
    list: Array<{
      name: string;
      createdAt: Date;
      installCount: number;
      ratingAverage: number | null;
      ratingCount: number;
    } & Record<string, unknown>>,
    sort: "recent" | "downloads" | "most-rated" | "top-rated" | "name-asc" = "recent",
  ) => [...list].sort((a, b) => {
    switch (sort) {
      case "downloads": {
        const diff = b.installCount - a.installCount;
        if (diff !== 0) return diff;
        break;
      }
      case "most-rated": {
        const diff = b.ratingCount - a.ratingCount;
        if (diff !== 0) return diff;
        break;
      }
      case "top-rated": {
        const diff = (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
        if (diff !== 0) return diff;
        const tieBreak = b.ratingCount - a.ratingCount;
        if (tieBreak !== 0) return tieBreak;
        break;
      }
      case "name-asc":
        return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
      case "recent":
      default: {
        const diff = b.createdAt.getTime() - a.createdAt.getTime();
        if (diff !== 0) return diff;
        break;
      }
    }
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });

  const service = {
    async listOfficialIcons(
      userId: string,
      query?: {
        origin?: "official" | "community" | "all";
        packId?: string;
        search?: string;
        category?: string;
        includePackItems?: boolean;
      },
    ) {
      const origin = query?.origin ?? "official";
      const normalizedSearch = String(query?.search ?? "").trim().toLowerCase();
      const normalizedCategory = String(query?.category ?? "").trim().toLowerCase();
      const packId = String(query?.packId ?? "").trim();
      const includePackItems = query?.includePackItems === true;
      let list = officialIcons
        .filter((icon) => icon.isActive)
        .filter((icon) => {
          if (origin === "community") return isCommunityIconKey(icon.iconKey);
          if (origin === "official") return !isCommunityIconKey(icon.iconKey);
          return true;
        })
        .filter((icon) => {
          if (packId) return icon.packId === packId;
          if (includePackItems) return true;
          return !icon.packId;
        });

      if (!packId && !includePackItems) {
        const packedIcons = officialIcons
          .filter((icon) => icon.isActive)
          .filter((icon) => (origin === "community" ? isCommunityIconKey(icon.iconKey) : origin === "official" ? !isCommunityIconKey(icon.iconKey) : true))
          .filter((icon) => Boolean(icon.packId));

        const packedSourceUserIconIds = new Set<string>();
        const packedCommunityIconKeys = new Set<string>();
        const packedFingerprints = new Set<string>();
        const packedNameCategoryFingerprints = new Set<string>();

        for (const packed of packedIcons) {
          const parsed = parseCommunityKeyParts(packed.iconKey);
          if (parsed?.sourceUserIconId) {
            packedSourceUserIconIds.add(parsed.sourceUserIconId);
          }
          if (isCommunityIconKey(packed.iconKey)) {
            packedCommunityIconKeys.add(packed.iconKey);
          }
          packedFingerprints.add(buildIconFingerprint(packed.name, packed.category, packed.imageUrl));
          packedNameCategoryFingerprints.add(buildIconNameCategoryFingerprint(packed.name, packed.category));
        }

        list = list.filter((icon) => {
          const parsed = parseCommunityKeyParts(icon.iconKey);
          const sourceUserIconId = parsed?.sourceUserIconId ?? null;
          if (sourceUserIconId && packedSourceUserIconIds.has(sourceUserIconId)) return false;
          if (isCommunityIconKey(icon.iconKey) && packedCommunityIconKeys.has(icon.iconKey)) return false;

          const fingerprint = buildIconFingerprint(icon.name, icon.category, icon.imageUrl);
          if (packedFingerprints.has(fingerprint)) return false;

          const hasImageUrl = String(icon.imageUrl ?? "").trim().length > 0;
          if (!hasImageUrl) {
            const nameCategory = buildIconNameCategoryFingerprint(icon.name, icon.category);
            if (packedNameCategoryFingerprints.has(nameCategory)) return false;
          }
          return true;
        });
      }

      return list
        .filter((icon) => (!normalizedCategory ? true : String(icon.category ?? "").toLowerCase() === normalizedCategory))
        .filter((icon) => {
          if (!normalizedSearch) return true;
          const haystack = `${icon.name} ${icon.category ?? ""} ${icon.tags.join(" ")} ${icon.aliases.join(" ")}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        })
        .map((icon) => mapListItem(icon, userId));
    },
    async listCommunityIcons(
      userId: string,
      query?: { packId?: string; search?: string; category?: string; includePackItems?: boolean },
    ) {
      return service.listOfficialIcons(userId, { ...query, origin: "community" });
    },
    async listOfficialPacks(
      userId: string,
      query?: {
        origin?: "all" | "official" | "community";
        category?: string;
        search?: string;
        sort?: "recent" | "downloads" | "most-rated" | "top-rated" | "name-asc";
      },
    ) {
      const origin = query?.origin ?? "all";
      const normalizedCategory = String(query?.category ?? "").trim().toLowerCase();
      const normalizedSearch = String(query?.search ?? "").trim().toLowerCase();
      const filtered = packs
        .filter((pack) => pack.isActive)
        .filter((pack) => (origin === "all" ? true : pack.sourceType === origin))
        .filter((pack) => (!normalizedCategory ? true : String(pack.category ?? "").toLowerCase() === normalizedCategory))
        .filter((pack) => (!normalizedSearch
          ? true
          : `${pack.name} ${pack.description ?? ""} ${pack.category ?? ""}`.toLowerCase().includes(normalizedSearch)))
        .map((pack) => {
          const totalIcons = officialIcons.filter((icon) =>
            icon.isActive && icon.packId === pack.id).length;
          const addedIconsCount = officialIcons.filter((icon) =>
            icon.isActive
            && icon.packId === pack.id
            && Boolean(findExistingUserIconForOfficial(userId, icon))).length;
          const missingIconsCount = Math.max(0, totalIcons - addedIconsCount);
          const ratings = packRatings.filter((entry) => entry.packId === pack.id);
          const ratingCount = ratings.length;
          const ratingAverage = ratingCount > 0
            ? Number((ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratingCount).toFixed(1))
            : null;
          const userRating = packRatings.find((entry) => entry.packId === pack.id && entry.userId === userId)?.rating ?? null;
          const libraryStatus = addedIconsCount <= 0
            ? "none"
            : addedIconsCount >= totalIcons
              ? "full"
              : "partial";
          return {
            ...pack,
            ownerUserId: null,
            ownerLabel: pack.sourceType === "community" ? resolvePublicOwnerLabel(pack.ownerUserId) : null,
            ownerPublicCode: pack.sourceType === "community" && pack.ownerUserId ? `USR-${pack.ownerUserId.toUpperCase()}` : null,
            coverImageUrl: pack.coverImageUrl ?? officialIcons.find((icon) => icon.isActive && icon.packId === pack.id)?.imageUrl ?? null,
            isPublished: pack.isActive,
            iconsCount: totalIcons,
            addedIconsCount,
            missingIconsCount,
            libraryStatus,
            installCount: packInstalls.filter((entry) => entry.packId === pack.id).length,
            ratingAverage,
            ratingCount,
            userRating,
            createdAt: pack.createdAt,
            updatedAt: pack.updatedAt,
          };
        });
      return sortPackViews(filtered, query?.sort ?? "recent");
    },
    async addOfficialIconToLibrary(userId: string, officialIconId: string) {
      return addToLibrary(userId, officialIconId, "official");
    },
    async addCommunityIconToLibrary(userId: string, communityIconId: string) {
      return addToLibrary(userId, communityIconId, "community");
    },
    async publishCommunityIcon(userId: string, payload: { userIconId: string }) {
      const source = userIcons.find((row) => row.userId === userId && row.id === payload.userIconId);
      if (!source) {
        const error = new Error("Ícone pessoal não encontrado.");
        error.name = "UserIconOwnershipError";
        throw error;
      }

      const iconKey = `${COMMUNITY_PREFIX}${userId}:${source.id}`;
      const existing = officialIcons.find((row) => row.iconKey === iconKey);
      if (existing) {
        existing.name = source.name;
        existing.imageUrl = source.imageUrl;
        existing.category = source.category;
        existing.tags = [...source.tags];
        existing.aliases = [...source.tags];
        existing.isActive = true;
        return {
          publication: {
            ...existing,
            storagePath: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          alreadyPublished: true,
        };
      }

      const created: InMemoryOfficialIcon = {
        id: `community_${officialSeq++}`,
        iconKey,
        packItemPublicCode: null,
        name: source.name,
        imageUrl: source.imageUrl,
        category: source.category,
        tags: [...source.tags],
        aliases: [...source.tags],
        packId: null,
        packName: null,
        isActive: true,
        createdBy: userId,
      };
      officialIcons.push(created);

      return {
        publication: {
          ...created,
          storagePath: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        alreadyPublished: false,
      };
    },
    async unpublishCommunityIcon(userId: string, publicationId: string, options?: { canManageAny?: boolean }) {
      const publication = officialIcons.find((row) => row.id === publicationId && isCommunityIconKey(row.iconKey));
      if (!publication) {
        const error = new Error("Publicação comunitária não encontrada.");
        error.name = "CommunityIconPublicationNotFoundError";
        throw error;
      }

      if (publication.createdBy !== userId && !options?.canManageAny) {
        const error = new Error("Você não pode despublicar este ícone.");
        error.name = "CommunityIconPublicationOwnershipError";
        throw error;
      }

      publication.isActive = false;
      return {
        ...publication,
        storagePath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async listCommunityPacks(userId: string, query?: { category?: string; search?: string }) {
      return service.listOfficialPacks(userId, {
        ...query,
        origin: "community",
      });
    },
    async getCommunityPackDetails(userId: string, packId: string) {
      const pack = packs.find((item) => item.id === packId && item.isActive && item.sourceType === "community");
      if (!pack) {
        const error = new Error("Pack comunitário não encontrado.");
        error.name = "CommunityPackNotFoundError";
        throw error;
      }
      const list = await service.listOfficialPacks(userId, { origin: "community" });
      const packView = list.find((item) => item.id === pack.id);
      if (!packView) {
        const error = new Error("Pack comunitário não encontrado.");
        error.name = "CommunityPackNotFoundError";
        throw error;
      }
      const icons = await service.listCommunityIcons(userId, { packId });
      return { pack: packView, icons };
    },
    async createCommunityPack(
      userId: string,
      payload: { name: string; userIconIds: string[]; description?: string | null; category?: string | null; publish?: boolean },
    ) {
      const uniqueIconIds = Array.from(new Set(payload.userIconIds));
      const selectedIcons = userIcons.filter((icon) => icon.userId === userId && uniqueIconIds.includes(icon.id));
      if (selectedIcons.length !== uniqueIconIds.length) {
        const error = new Error("Você só pode criar pack com ícones da sua biblioteca.");
        error.name = "UserIconOwnershipError";
        throw error;
      }

      const publish = payload.publish ?? true;
      const packId = `community_pack:${userId}:${packs.length + 1}`;
      const ownerPublicCode = `USR-${userId.toUpperCase()}`;
      const packPublicCode = buildPackPublicCode(ownerPublicCode, packs.filter((item) => item.ownerUserId === userId).length + 1);
      const now = new Date();
      packs.push({
        id: packId,
        publicCode: packPublicCode,
        name: payload.name,
        description: payload.description ?? null,
        category: payload.category ?? null,
        coverIconId: null,
        coverImageUrl: selectedIcons[0]?.imageUrl ?? null,
        sourceType: "community",
        ownerUserId: userId,
        isActive: publish,
        createdAt: now,
        updatedAt: now,
      });

      for (const [index, source] of selectedIcons.entries()) {
        officialIcons.push({
          id: `community_pack_icon_${officialSeq++}`,
          iconKey: `${COMMUNITY_PREFIX}${userId}:${source.id}:pack:${packId}`,
          packItemPublicCode: buildPackItemPublicCode(packPublicCode, index + 1),
          name: source.name,
          imageUrl: source.imageUrl,
          category: source.category,
          tags: [...source.tags],
          aliases: [...source.tags],
          packId,
          packName: payload.name,
          isActive: publish,
          createdBy: userId,
        });
      }

      return service.getCommunityPackDetails(userId, packId);
    },
    async addCommunityPackToLibrary(userId: string, packId: string) {
      const pack = packs.find((item) => item.id === packId && item.isActive && item.sourceType === "community");
      if (!pack) {
        const error = new Error("Pack comunitário não encontrado.");
        error.name = "CommunityPackNotFoundError";
        throw error;
      }
      const icons = officialIcons.filter((icon) => icon.isActive && icon.packId === packId && isCommunityIconKey(icon.iconKey));
      let addedCount = 0;
      let alreadyInLibraryCount = 0;
      let createdMatchRules = 0;
      for (const icon of icons) {
        const result = await service.addCommunityIconToLibrary(userId, icon.id);
        if (result.alreadyInLibrary) alreadyInLibraryCount += 1;
        else addedCount += 1;
        createdMatchRules += result.createdMatchRules;
      }
      if (!packInstalls.some((entry) => entry.userId === userId && entry.packId === packId)) {
        packInstalls.push({ userId, packId, createdAt: new Date() });
      }
      return {
        packId,
        packPublicCode: pack.publicCode ?? null,
        totalIcons: icons.length,
        addedCount,
        alreadyInLibraryCount,
        missingIconsCount: 0,
        libraryStatus: icons.length > 0 ? "full" : "none",
        createdMatchRules,
      };
    },
    async addCommunityPackItemToLibrary(userId: string, itemPublicCode: string) {
      const icon = officialIcons.find((row) =>
        row.isActive
        && row.packItemPublicCode === itemPublicCode
        && row.packId
        && isCommunityIconKey(row.iconKey),
      );
      if (!icon) {
        const error = new Error("Item do pack comunitário não encontrado.");
        error.name = "CommunityPackItemNotFoundError";
        throw error;
      }

      const pack = packs.find((row) => row.id === icon.packId && row.isActive);
      if (!pack) {
        const error = new Error("Item do pack comunitário não encontrado.");
        error.name = "CommunityPackItemNotFoundError";
        throw error;
      }

      const result = await service.addCommunityIconToLibrary(userId, icon.id);
      return {
        added: !result.alreadyInLibrary,
        alreadyInLibrary: result.alreadyInLibrary,
        userIconId: result.icon.id,
        packPublicCode: pack.publicCode,
        packItemPublicCode: icon.packItemPublicCode!,
        createdMatchRules: result.createdMatchRules,
      };
    },
    async updateCommunityPack(
      userId: string,
      packId: string,
      payload: { name?: string; description?: string | null; category?: string | null; publish?: boolean },
      options?: { canManageAny?: boolean },
    ) {
      const pack = packs.find((item) => item.id === packId && item.sourceType === "community");
      if (!pack) {
        const error = new Error("Pack comunitário não encontrado.");
        error.name = "CommunityPackNotFoundError";
        throw error;
      }
      if (pack.ownerUserId !== userId && !options?.canManageAny) {
        const error = new Error("Você não pode alterar este pack.");
        error.name = "CommunityPackOwnershipError";
        throw error;
      }
      if (payload.name !== undefined) pack.name = payload.name;
      if (payload.description !== undefined) pack.description = payload.description;
      if (payload.category !== undefined) pack.category = payload.category;
      if (payload.publish !== undefined) {
        pack.isActive = payload.publish;
        for (const icon of officialIcons) {
          if (icon.packId === packId && isCommunityIconKey(icon.iconKey)) {
            icon.isActive = payload.publish;
          }
        }
      }
      return {
        ...pack,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async unpublishCommunityPack(userId: string, packId: string, options?: { canManageAny?: boolean }) {
      return service.updateCommunityPack(userId, packId, { publish: false }, options);
    },
    async addOfficialPackToLibrary(userId: string, packId: string) {
      const pack = packs.find((item) => item.id === packId && item.isActive);
      if (!pack) {
        const error = new Error("Pack oficial não encontrado.");
        error.name = "OfficialIconPackNotFoundError";
        throw error;
      }
      const icons = officialIcons.filter((icon) => icon.isActive && icon.packId === packId && !isCommunityIconKey(icon.iconKey));
      let addedCount = 0;
      let alreadyInLibraryCount = 0;
      let createdMatchRules = 0;
      for (const icon of icons) {
        const result = await service.addOfficialIconToLibrary(userId, icon.id);
        if (result.alreadyInLibrary) alreadyInLibraryCount += 1;
        else addedCount += 1;
        createdMatchRules += result.createdMatchRules;
      }
      if (!packInstalls.some((entry) => entry.userId === userId && entry.packId === packId)) {
        packInstalls.push({ userId, packId, createdAt: new Date() });
      }
      return {
        packId,
        packPublicCode: pack.publicCode ?? null,
        totalIcons: icons.length,
        addedCount,
        alreadyInLibraryCount,
        missingIconsCount: 0,
        libraryStatus: icons.length > 0 ? "full" : "none",
        createdMatchRules,
      };
    },
    async rateOfficialPack(userId: string, packId: string, rating: number) {
      const pack = packs.find((item) => item.id === packId && item.isActive);
      if (!pack) {
        const error = new Error("Pack não encontrado.");
        error.name = "OfficialIconPackNotFoundError";
        throw error;
      }

      const normalizedRating = Math.max(1, Math.min(5, Math.trunc(Number(rating) || 0)));
      const existing = packRatings.find((entry) => entry.userId === userId && entry.packId === packId) ?? null;
      if (existing) {
        existing.rating = normalizedRating;
        existing.updatedAt = new Date();
      } else {
        packRatings.push({
          userId,
          packId,
          rating: normalizedRating,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const ratings = packRatings.filter((entry) => entry.packId === packId);
      return {
        ratingAverage: Number((ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length).toFixed(1)),
        ratingCount: ratings.length,
        userRating: normalizedRating,
        updated: Boolean(existing),
      };
    },
    async createOfficialPack(_adminUserId: string, payload: { name: string }) {
      const now = new Date();
      const pack = {
        id: `pack_${packs.length + 1}`,
        publicCode: buildPackPublicCode("USR-ADMIN_USER", packs.length + 1),
        name: payload.name,
        description: null,
        category: null,
        coverIconId: null,
        coverImageUrl: null,
        sourceType: "official",
        ownerUserId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      packs.push(pack);
      return pack;
    },
    async updateOfficialPack(id: string, payload: { name?: string }) {
      const pack = packs.find((item) => item.id === id);
      if (!pack) {
        const error = new Error("Pack oficial não encontrado.");
        error.name = "OfficialIconPackNotFoundError";
        throw error;
      }
      if (payload.name) pack.name = payload.name;
      pack.updatedAt = new Date();
      return {
        ...pack,
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt,
      };
    },
    async createOfficialIcon(_adminUserId: string, payload: { iconKey: string; name: string; imageUrl?: string | null }) {
      const icon = {
        id: `official_${officialIcons.length + 1}`,
        iconKey: payload.iconKey,
        packItemPublicCode: null,
        name: payload.name,
        imageUrl: payload.imageUrl ?? "data:image/png;base64,new",
        storagePath: null,
        category: null,
        tags: [],
        aliases: [],
        packId: null,
        packItemPublicCode: null,
        isActive: true,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      officialIcons.push({
        id: icon.id,
        iconKey: icon.iconKey,
        packItemPublicCode: null,
        name: icon.name,
        imageUrl: icon.imageUrl,
        category: null,
        tags: [],
        aliases: [],
        packId: null,
        packName: null,
        isActive: true,
        createdBy: null,
      });
      return icon;
    },
    async updateOfficialIcon(id: string, payload: { name?: string }) {
      const icon = officialIcons.find((item) => item.id === id);
      if (!icon) {
        const error = new Error("Ícone oficial não encontrado.");
        error.name = "OfficialIconNotFoundError";
        throw error;
      }
      if (payload.name) icon.name = payload.name;
      return {
        id: icon.id,
        iconKey: icon.iconKey,
        name: icon.name,
        imageUrl: icon.imageUrl,
        storagePath: null,
        category: icon.category,
        tags: icon.tags,
        aliases: icon.aliases,
        packId: icon.packId,
        packItemPublicCode: icon.packItemPublicCode,
        isActive: icon.isActive,
        createdBy: icon.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };

  return { service, packs, userIcons, rules, officialIcons, packInstalls, packRatings };
}

async function withTestServer(
  app: ReturnType<typeof express>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createOfficialIconsRouteApp() {
  const fixture = createInMemoryServiceFixture();
  const controller = createOfficialIconsController(fixture.service as any);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a" || authUser === "user_b" || authUser === "admin_user";
    req.user = authUser
      ? { id: authUser, username: authUser, subscriptionTier: "premium" }
      : undefined;
    next();
  });

  app.get("/api/icons/official", requireAuth, controller.listOfficial);
  app.get("/api/icons/community", requireAuth, controller.listCommunity);
  app.get("/api/icons/packs", requireAuth, controller.listPacks);
  app.get("/api/icons/community/packs", requireAuth, controller.listCommunityPacks);
  app.get("/api/icons/community/packs/:id", requireAuth, controller.getCommunityPackDetails);
  app.post("/api/icons/community/publish", requireAuth, controller.publishCommunityIcon);
  app.post("/api/icons/community/packs", requireAuth, controller.createCommunityPack);
  app.post("/api/icons/community/:id/add-to-library", requireAuth, controller.addCommunityIconToLibrary);
  app.post("/api/icons/community/pack-items/:itemPublicCode/add-to-library", requireAuth, controller.addCommunityPackItemToLibrary);
  app.post("/api/icons/community/packs/:id/add-to-library", requireAuth, controller.addCommunityPackToLibrary);
  app.patch("/api/icons/community/packs/:id", requireAuth, controller.updateCommunityPack);
  app.patch("/api/icons/community/packs/:id/unpublish", requireAuth, controller.unpublishCommunityPack);
  app.patch("/api/icons/community/:id/unpublish", requireAuth, controller.unpublishCommunityIcon);
  app.post("/api/icons/official/:id/add-to-library", requireAuth, controller.addOfficialIconToLibrary);
  app.post("/api/icons/packs/:id/rating", requireAuth, controller.rateOfficialPack);
  app.post("/api/icons/packs/:id/add-to-library", requireAuth, controller.addOfficialPackToLibrary);
  app.post("/api/admin/icons/packs", requireAuth, controller.adminCreatePack);
  app.patch("/api/admin/icons/packs/:id", requireAuth, controller.adminUpdatePack);
  app.post("/api/admin/icons/official", requireAuth, controller.adminCreateOfficialIcon);
  app.patch("/api/admin/icons/official/:id", requireAuth, controller.adminUpdateOfficialIcon);

  return { app, fixture };
}

test("rotas /api/icons/* e /api/admin/icons/* em serverless exigem requireAuth", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const patterns = [
    /app\.get\(\s*"\/api\/icons\/official"\s*,\s*requireAuth\s*,\s*officialIconsController\.listOfficial\s*\)/m,
    /app\.get\(\s*"\/api\/icons\/community"\s*,\s*requireAuth\s*,\s*officialIconsController\.listCommunity\s*\)/m,
    /app\.get\(\s*"\/api\/icons\/community\/packs"\s*,\s*requireAuth\s*,\s*officialIconsController\.listCommunityPacks\s*\)/m,
    /app\.get\(\s*"\/api\/icons\/community\/packs\/:id"\s*,\s*requireAuth\s*,\s*officialIconsController\.getCommunityPackDetails\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/community\/publish"\s*,\s*requireAuth\s*,\s*officialIconsController\.publishCommunityIcon\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/community\/packs"\s*,\s*requireAuth\s*,\s*officialIconsController\.createCommunityPack\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/community\/:id\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addCommunityIconToLibrary\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/community\/pack-items\/:itemPublicCode\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addCommunityPackItemToLibrary\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/community\/packs\/:id\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addCommunityPackToLibrary\s*\)/m,
    /app\.patch\(\s*"\/api\/icons\/community\/packs\/:id"\s*,\s*requireAuth\s*,\s*officialIconsController\.updateCommunityPack\s*\)/m,
    /app\.patch\(\s*"\/api\/icons\/community\/packs\/:id\/unpublish"\s*,\s*requireAuth\s*,\s*officialIconsController\.unpublishCommunityPack\s*\)/m,
    /app\.patch\(\s*"\/api\/icons\/community\/:id\/unpublish"\s*,\s*requireAuth\s*,\s*officialIconsController\.unpublishCommunityIcon\s*\)/m,
    /app\.get\(\s*"\/api\/icons\/packs"\s*,\s*requireAuth\s*,\s*officialIconsController\.listPacks\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/official\/:id\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addOfficialIconToLibrary\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/packs\/:id\/rating"\s*,\s*requireAuth\s*,\s*officialIconsController\.rateOfficialPack\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/packs\/:id\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addOfficialPackToLibrary\s*\)/m,
    /app\.post\(\s*"\/api\/admin\/icons\/official"\s*,\s*requireAuth\s*,\s*officialIconsController\.adminCreateOfficialIcon\s*\)/m,
    /app\.post\(\s*"\/api\/admin\/icons\/packs"\s*,\s*requireAuth\s*,\s*officialIconsController\.adminCreatePack\s*\)/m,
  ];

  for (const pattern of patterns) {
    assert.ok(pattern.test(routesSource));
  }
});

test("official icons: usuário lista somente ícones ativos", async () => {
  const { app } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/icons/official`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.icons), true);
    assert.equal(body.icons.length, 0);

    const withPackItems = await fetch(`${baseUrl}/api/icons/official?includePackItems=true`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(withPackItems.status, 200);
    const withPackItemsBody = await withPackItems.json();
    assert.equal(Array.isArray(withPackItemsBody.icons), true);
    assert.equal(withPackItemsBody.icons.length, 1);
    assert.equal(withPackItemsBody.icons[0].id, "official-kabum");
  });
});

test("official icons: adicionar à biblioteca respeita ownership e evita duplicação", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const addA = await fetch(`${baseUrl}/api/icons/official/official-kabum/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(addA.status, 201);
    const addABody = await addA.json();
    assert.equal(addABody.alreadyInLibrary, false);
    assert.equal(addABody.createdMatchRules > 0, true);

    const addAAgain = await fetch(`${baseUrl}/api/icons/official/official-kabum/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(addAAgain.status, 201);
    const addAAgainBody = await addAAgain.json();
    assert.equal(addAAgainBody.alreadyInLibrary, true);

    const userAIcons = fixture.userIcons.filter((icon) => icon.userId === "user_a" && icon.officialIconId === "official-kabum");
    const userBIcons = fixture.userIcons.filter((icon) => icon.userId === "user_b" && icon.officialIconId === "official-kabum");
    assert.equal(userAIcons.length, 1);
    assert.equal(userBIcons.length, 0);
  });
});

test("official packs: rating exige autenticação e atualiza sem duplicar avaliação do usuário", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/icons/packs/pack-bancos/rating`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(unauthenticated.status, 401);

    const firstRating = await fetch(`${baseUrl}/api/icons/packs/pack-bancos/rating`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ rating: 1 }),
    });
    assert.equal(firstRating.status, 200);
    const firstBody = await firstRating.json();
    assert.equal(firstBody.userRating, 1);
    assert.equal(firstBody.ratingAverage, 1);
    assert.equal(firstBody.ratingCount, 1);
    assert.equal(firstBody.updated, false);

    const secondRating = await fetch(`${baseUrl}/api/icons/packs/pack-bancos/rating`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(secondRating.status, 200);
    const secondBody = await secondRating.json();
    assert.equal(secondBody.userRating, 5);
    assert.equal(secondBody.ratingAverage, 5);
    assert.equal(secondBody.ratingCount, 1);
    assert.equal(secondBody.updated, true);
    assert.equal(fixture.packRatings.length, 1);
  });
});

test("official packs: downloads e ordenações de avaliação usam métricas agregadas do pack", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  fixture.packs.push(
    {
      id: "pack-servicos",
      publicCode: "USR-ADMIN_USER-P002",
      name: "Serviços Essenciais",
      description: "Pack de serviços do dia a dia",
      category: "servico",
      coverIconId: null,
      coverImageUrl: null,
      sourceType: "official",
      ownerUserId: null,
      isActive: true,
      createdAt: new Date("2026-05-15T10:00:00.000Z"),
      updatedAt: new Date("2026-05-15T10:00:00.000Z"),
    },
    {
      id: "pack-wallets",
      publicCode: "USR-ADMIN_USER-P003",
      name: "Carteiras",
      description: "Pack de carteiras digitais",
      category: "carteira",
      coverIconId: null,
      coverImageUrl: null,
      sourceType: "official",
      ownerUserId: null,
      isActive: true,
      createdAt: new Date("2026-06-10T10:00:00.000Z"),
      updatedAt: new Date("2026-06-10T10:00:00.000Z"),
    },
  );
  fixture.officialIcons.push(
    {
      id: "official-google-one",
      iconKey: "official-google-one",
      packItemPublicCode: "USR-ADMIN_USER-P002-I001",
      name: "Google One",
      imageUrl: "data:image/png;base64,google-one",
      category: "servico",
      tags: ["google one"],
      aliases: ["google"],
      packId: "pack-servicos",
      packName: "Serviços Essenciais",
      isActive: true,
      createdBy: "admin_user",
    },
    {
      id: "official-mercado-pago",
      iconKey: "official-mercado-pago",
      packItemPublicCode: "USR-ADMIN_USER-P003-I001",
      name: "Mercado Pago",
      imageUrl: "data:image/png;base64,mercado-pago",
      category: "carteira",
      tags: ["mercado pago"],
      aliases: ["mp"],
      packId: "pack-wallets",
      packName: "Carteiras",
      isActive: true,
      createdBy: "admin_user",
    },
  );
  fixture.packInstalls.push(
    { userId: "user_a", packId: "pack-servicos", createdAt: new Date("2026-06-01T00:00:00.000Z") },
    { userId: "user_b", packId: "pack-servicos", createdAt: new Date("2026-06-02T00:00:00.000Z") },
    { userId: "user_a", packId: "pack-wallets", createdAt: new Date("2026-06-03T00:00:00.000Z") },
  );
  fixture.packRatings.push(
    {
      userId: "user_a",
      packId: "pack-servicos",
      rating: 4,
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      updatedAt: new Date("2026-06-05T00:00:00.000Z"),
    },
    {
      userId: "user_b",
      packId: "pack-servicos",
      rating: 5,
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:00:00.000Z"),
    },
    {
      userId: "user_a",
      packId: "pack-wallets",
      rating: 5,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    },
  );

  await withTestServer(app, async (baseUrl) => {
    const downloadsResponse = await fetch(`${baseUrl}/api/icons/packs?sort=downloads`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(downloadsResponse.status, 200);
    const downloadsBody = await downloadsResponse.json();
    assert.deepEqual(downloadsBody.packs.slice(0, 3).map((pack: { id: string }) => pack.id), [
      "pack-servicos",
      "pack-wallets",
      "pack-bancos",
    ]);

    const mostRatedResponse = await fetch(`${baseUrl}/api/icons/packs?sort=most-rated`, {
      headers: { "x-test-auth": "user_a" },
    });
    const mostRatedBody = await mostRatedResponse.json();
    assert.deepEqual(mostRatedBody.packs.slice(0, 3).map((pack: { id: string }) => pack.id), [
      "pack-servicos",
      "pack-wallets",
      "pack-bancos",
    ]);

    const topRatedResponse = await fetch(`${baseUrl}/api/icons/packs?sort=top-rated`, {
      headers: { "x-test-auth": "user_a" },
    });
    const topRatedBody = await topRatedResponse.json();
    assert.deepEqual(topRatedBody.packs.slice(0, 3).map((pack: { id: string }) => pack.id), [
      "pack-wallets",
      "pack-servicos",
      "pack-bancos",
    ]);

    const recentResponse = await fetch(`${baseUrl}/api/icons/packs?sort=recent`, {
      headers: { "x-test-auth": "user_a" },
    });
    const recentBody = await recentResponse.json();
    assert.deepEqual(recentBody.packs.slice(0, 3).map((pack: { id: string }) => pack.id), [
      "pack-wallets",
      "pack-servicos",
      "pack-bancos",
    ]);

    const alphabeticalResponse = await fetch(`${baseUrl}/api/icons/packs?sort=name-asc`, {
      headers: { "x-test-auth": "user_a" },
    });
    const alphabeticalBody = await alphabeticalResponse.json();
    assert.deepEqual(alphabeticalBody.packs.slice(0, 3).map((pack: { id: string }) => pack.id), [
      "pack-bancos",
      "pack-wallets",
      "pack-servicos",
    ]);
  });
});

test("official packs: reinstalar o mesmo pack não duplica download do usuário", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const firstInstall = await fetch(`${baseUrl}/api/icons/packs/pack-bancos/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(firstInstall.status, 201);

    const secondInstall = await fetch(`${baseUrl}/api/icons/packs/pack-bancos/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(secondInstall.status, 201);

    assert.equal(fixture.packInstalls.filter((entry) => entry.userId === "user_a" && entry.packId === "pack-bancos").length, 1);

    const packsResponse = await fetch(`${baseUrl}/api/icons/packs?sort=downloads`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(packsResponse.status, 200);
    const packsBody = await packsResponse.json();
    const pack = packsBody.packs.find((entry: { id: string }) => entry.id === "pack-bancos");
    assert.equal(pack?.installCount, 1);
  });
});

test("community icons: usuário publica ícone próprio e outro usuário consegue adicionar à biblioteca", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const publish = await fetch(`${baseUrl}/api/icons/community/publish`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userIconId: "user-upload-a" }),
    });
    assert.equal(publish.status, 201);
    const publishBody = await publish.json();
    assert.equal(publishBody.alreadyPublished, false);
    assert.equal(publishBody.publication.category, "delivery");

    const communityList = await fetch(`${baseUrl}/api/icons/community`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(communityList.status, 200);
    const communityBody = await communityList.json();
    const published = communityBody.icons.find((icon: { id: string }) => icon.id === publishBody.publication.id);
    assert.ok(published);

    const addToLibrary = await fetch(`${baseUrl}/api/icons/community/${publishBody.publication.id}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addToLibrary.status, 201);
    const addBody = await addToLibrary.json();
    assert.equal(addBody.alreadyInLibrary, false);

    const bCopy = fixture.userIcons.find((icon) =>
      icon.userId === "user_b" && icon.officialIconId === publishBody.publication.id);
    assert.ok(bCopy);
  });
});

test("community icons: ownership impede publicar/despublicar ícone de outro usuário", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const publish = await fetch(`${baseUrl}/api/icons/community/publish`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userIconId: "user-upload-a" }),
    });
    assert.equal(publish.status, 201);
    const publishBody = await publish.json();

    const publishForeign = await fetch(`${baseUrl}/api/icons/community/publish`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userIconId: "user-upload-a" }),
    });
    assert.equal(publishForeign.status, 400);

    const unpublishForeign = await fetch(`${baseUrl}/api/icons/community/${publishBody.publication.id}/unpublish`, {
      method: "PATCH",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(unpublishForeign.status, 403);

    const ownUnpublish = await fetch(`${baseUrl}/api/icons/community/${publishBody.publication.id}/unpublish`, {
      method: "PATCH",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(ownUnpublish.status, 200);
    const publication = fixture.officialIcons.find((icon) => icon.id === publishBody.publication.id);
    assert.equal(publication?.isActive, false);
  });
});

test("community icons: despublicar não apaga cópias já adicionadas por outros usuários", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const publish = await fetch(`${baseUrl}/api/icons/community/publish`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userIconId: "user-upload-a" }),
    });
    assert.equal(publish.status, 201);
    const publishBody = await publish.json();

    const add = await fetch(`${baseUrl}/api/icons/community/${publishBody.publication.id}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(add.status, 201);

    const unpublish = await fetch(`${baseUrl}/api/icons/community/${publishBody.publication.id}/unpublish`, {
      method: "PATCH",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(unpublish.status, 200);

    const userBCopy = fixture.userIcons.find((icon) =>
      icon.userId === "user_b" && icon.officialIconId === publishBody.publication.id);
    assert.ok(userBCopy);
  });
});

test("community packs: usuário cria pack com ícones próprios e outro usuário adiciona sem duplicar", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createPack = await fetch(`${baseUrl}/api/icons/community/packs`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Bancos da Comunidade",
        category: "banco",
        userIconIds: ["user-upload-a"],
        publish: true,
      }),
    });

    assert.equal(createPack.status, 201);
    const createBody = await createPack.json();
    const packId = createBody?.pack?.id as string;
    const packPublicCode = createBody?.pack?.publicCode as string;
    assert.equal(typeof packId, "string");
    assert.equal(typeof packPublicCode, "string");
    assert.equal(/^USR-USER_A-P\d{3}$/.test(packPublicCode), true);
    assert.equal(Array.isArray(createBody?.icons), true);
    assert.equal(createBody.icons.every((icon: { packItemPublicCode?: string | null }) => /^USR-USER_A-P\d{3}-I\d{3}$/.test(String(icon.packItemPublicCode ?? ""))), true);

    const listAsUserB = await fetch(`${baseUrl}/api/icons/community/packs`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(listAsUserB.status, 200);
    const listBody = await listAsUserB.json();
    assert.equal(listBody.packs.some((pack: { id: string }) => pack.id === packId), true);
    const listedPack = listBody.packs.find((pack: { id: string }) => pack.id === packId);
    assert.equal(listedPack?.ownerLabel, "@fernandoq87");
    assert.equal(listedPack?.ownerPublicCode, "USR-USER_A");
    assert.equal(listedPack?.publicCode, packPublicCode);
    assert.equal(listedPack?.libraryStatus, "none");
    assert.equal(String(listedPack?.ownerLabel ?? "").includes("@"), true);
    assert.equal(JSON.stringify(listedPack).includes("example.com"), false);

    const detailsAsUserB = await fetch(`${baseUrl}/api/icons/community/packs/${packId}`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(detailsAsUserB.status, 200);
    const detailsBody = await detailsAsUserB.json();
    assert.equal(detailsBody?.pack?.ownerLabel, "@fernandoq87");
    assert.equal(detailsBody?.pack?.ownerPublicCode, "USR-USER_A");
    assert.equal(String(detailsBody?.pack?.ownerLabel ?? "").includes("@"), true);
    assert.equal(JSON.stringify(detailsBody?.pack ?? {}).includes("example.com"), false);

    const listAsOwner = await fetch(`${baseUrl}/api/icons/community/packs`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(listAsOwner.status, 200);
    const ownerBody = await listAsOwner.json();
    const ownerPack = ownerBody.packs.find((pack: { id: string }) => pack.id === packId);
    assert.equal(ownerPack?.addedIconsCount, ownerPack?.iconsCount);

    const addPackAsOwner = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(addPackAsOwner.status, 201);
    const addPackAsOwnerBody = await addPackAsOwner.json();
    assert.equal(addPackAsOwnerBody.addedCount, 0);
    assert.equal(addPackAsOwnerBody.alreadyInLibraryCount, addPackAsOwnerBody.totalIcons);

    const addPack = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addPack.status, 201);
    const addPackBody = await addPack.json();
    assert.equal(addPackBody.addedCount > 0, true);

    const addPackAgain = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addPackAgain.status, 201);
    const addPackAgainBody = await addPackAgain.json();
    assert.equal(addPackAgainBody.addedCount, 0);
    assert.equal(addPackAgainBody.alreadyInLibraryCount >= addPackBody.addedCount, true);

    const bCopies = fixture.userIcons.filter((icon) => icon.userId === "user_b" && icon.sourceType === "community");
    assert.equal(bCopies.length > 0, true);
  });
});

test("community packs: adição parcial adiciona apenas faltantes sem duplicar existentes", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  fixture.userIcons.push({
    id: "user-upload-a-2",
    userId: "user_a",
    sourceType: "upload",
    officialIconId: null,
    name: "Nubank Custom",
    imageUrl: "data:image/png;base64,nubank-custom",
    category: "banco",
    tags: ["nubank", "nu"],
  });

  await withTestServer(app, async (baseUrl) => {
    const createPack = await fetch(`${baseUrl}/api/icons/community/packs`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Pack Parcial",
        category: "banco",
        userIconIds: ["user-upload-a", "user-upload-a-2"],
        publish: true,
      }),
    });
    assert.equal(createPack.status, 201);
    const createBody = await createPack.json();
    const packId = createBody?.pack?.id as string;
    assert.equal(typeof packId, "string");
    assert.equal(createBody.icons.length, 2);

    const oneIconFromPack = createBody.icons[0]?.packItemPublicCode as string;
    const addSingleIcon = await fetch(`${baseUrl}/api/icons/community/pack-items/${oneIconFromPack}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addSingleIcon.status, 201);
    const addSingleBody = await addSingleIcon.json();
    assert.equal(addSingleBody.added, true);
    assert.equal(addSingleBody.packItemPublicCode, oneIconFromPack);

    const addSingleAgain = await fetch(`${baseUrl}/api/icons/community/pack-items/${oneIconFromPack}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addSingleAgain.status, 201);
    const addSingleAgainBody = await addSingleAgain.json();
    assert.equal(addSingleAgainBody.added, false);
    assert.equal(addSingleAgainBody.alreadyInLibrary, true);

    const listAfterSingle = await fetch(`${baseUrl}/api/icons/community/packs`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(listAfterSingle.status, 200);
    const listAfterSingleBody = await listAfterSingle.json();
    const partiallyAddedPack = listAfterSingleBody.packs.find((pack: { id: string }) => pack.id === packId);
    assert.equal(partiallyAddedPack?.libraryStatus, "partial");
    assert.equal(partiallyAddedPack?.addedIconsCount, 1);
    assert.equal(partiallyAddedPack?.iconsCount, 2);

    const addPack = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addPack.status, 201);
    const addPackBody = await addPack.json();
    assert.equal(addPackBody.totalIcons, 2);
    assert.equal(addPackBody.addedCount, 1);
    assert.equal(addPackBody.alreadyInLibraryCount, 1);

    const bIconsForPack = fixture.userIcons.filter((icon) =>
      icon.userId === "user_b"
      && icon.officialIconId
      && createBody.icons.some((packIcon: { id: string }) => packIcon.id === icon.officialIconId));
    assert.equal(bIconsForPack.length, 2);
  });
});

test("community icons: listagem geral exclui itens de pack e detalhe do pack mantém os ícones", async () => {
  const { app } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createPack = await fetch(`${baseUrl}/api/icons/community/packs`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Pack Bancos",
        category: "banco",
        userIconIds: ["user-upload-a"],
        publish: true,
      }),
    });
    assert.equal(createPack.status, 201);
    const createPackBody = await createPack.json();
    const packId = createPackBody?.pack?.id as string;
    assert.equal(typeof packId, "string");

    const publishIndividual = await fetch(`${baseUrl}/api/icons/community/publish`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userIconId: "user-upload-a" }),
    });
    assert.equal(publishIndividual.status, 201);
    const publishIndividualBody = await publishIndividual.json();
    const hiddenIndividualPublicationId = publishIndividualBody?.publication?.id as string;
    assert.equal(typeof hiddenIndividualPublicationId, "string");

    const publishUnrelatedIndividual = await fetch(`${baseUrl}/api/icons/community/publish`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userIconId: "user-upload-b" }),
    });
    assert.equal(publishUnrelatedIndividual.status, 201);
    const publishUnrelatedBody = await publishUnrelatedIndividual.json();
    const visibleIndividualPublicationId = publishUnrelatedBody?.publication?.id as string;
    assert.equal(typeof visibleIndividualPublicationId, "string");

    const communityList = await fetch(`${baseUrl}/api/icons/community`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(communityList.status, 200);
    const communityListBody = await communityList.json();
    const listedIcons = Array.isArray(communityListBody?.icons) ? communityListBody.icons : [];
    assert.equal(listedIcons.some((icon: { packId: string | null }) => icon.packId === packId), false);
    assert.equal(listedIcons.some((icon: { id: string }) => icon.id === hiddenIndividualPublicationId), false);
    assert.equal(listedIcons.some((icon: { id: string }) => icon.id === visibleIndividualPublicationId), true);

    const packDetails = await fetch(`${baseUrl}/api/icons/community/packs/${packId}`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(packDetails.status, 200);
    const packDetailsBody = await packDetails.json();
    assert.equal(Array.isArray(packDetailsBody?.icons), true);
    assert.equal(packDetailsBody.icons.length > 0, true);
    assert.equal(packDetailsBody.icons.every((icon: { packId: string | null }) => icon.packId === packId), true);

    const withPackItems = await fetch(`${baseUrl}/api/icons/community?includePackItems=true`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(withPackItems.status, 200);
    const withPackItemsBody = await withPackItems.json();
    const withPackItemsIcons = Array.isArray(withPackItemsBody?.icons) ? withPackItemsBody.icons : [];
    assert.equal(withPackItemsIcons.some((icon: { packId: string | null }) => icon.packId === packId), true);
  });
});

test("community packs: fallback público usa public_code reduzido sem expor e-mail", async () => {
  const { app } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createPack = await fetch(`${baseUrl}/api/icons/community/packs`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Pack da Elza",
        category: "mercado",
        userIconIds: ["user-upload-b"],
        publish: true,
      }),
    });
    assert.equal(createPack.status, 201);
    const createBody = await createPack.json();
    const packId = createBody?.pack?.id as string;

    const listAsUserA = await fetch(`${baseUrl}/api/icons/community/packs`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(listAsUserA.status, 200);
    const listBody = await listAsUserA.json();
    const listedPack = listBody.packs.find((pack: { id: string }) => pack.id === packId);
    assert.equal(listedPack?.ownerLabel, "Usuário USR-USER");
    assert.equal(listedPack?.ownerPublicCode, "USR-USER_B");
    assert.equal(String(listedPack?.ownerLabel ?? "").includes("@"), false);
    assert.equal(JSON.stringify(listedPack).includes("example.com"), false);
  });
});

test("community packs: ownership impede criar com ícone de outro usuário e despublicar/editar pack alheio", async () => {
  const { app, fixture } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createForeignPack = await fetch(`${baseUrl}/api/icons/community/packs`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Pack Inválido",
        userIconIds: ["user-upload-a"],
        publish: true,
      }),
    });
    assert.equal(createForeignPack.status, 400);

    const createOwnPack = await fetch(`${baseUrl}/api/icons/community/packs`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Pack do User A",
        userIconIds: ["user-upload-a"],
        publish: true,
      }),
    });
    assert.equal(createOwnPack.status, 201);
    const createOwnBody = await createOwnPack.json();
    const packId = createOwnBody?.pack?.id as string;
    const firstPackItemPublicCode = createOwnBody?.icons?.[0]?.packItemPublicCode as string;

    const updateForeign = await fetch(`${baseUrl}/api/icons/community/packs/${packId}`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Hack Pack" }),
    });
    assert.equal(updateForeign.status, 403);

    const unpublishForeign = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/unpublish`, {
      method: "PATCH",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(unpublishForeign.status, 403);

    const addByUserB = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/add-to-library`, {
      method: "POST",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(addByUserB.status, 201);

    const unpublishOwn = await fetch(`${baseUrl}/api/icons/community/packs/${packId}/unpublish`, {
      method: "PATCH",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(unpublishOwn.status, 200);

    const addPackItemAfterUnpublish = await fetch(
      `${baseUrl}/api/icons/community/pack-items/${firstPackItemPublicCode}/add-to-library`,
      {
        method: "POST",
        headers: { "x-test-auth": "user_b" },
      },
    );
    assert.equal(addPackItemAfterUnpublish.status, 404);

    const bCopies = fixture.userIcons.filter((icon) => icon.userId === "user_b" && icon.sourceType === "community");
    assert.equal(bCopies.length > 0, true);
  });
});

test("official icons: usuário comum não cria ícone oficial; admin cria quando autorizado", async () => {
  const previousAdmins = [...ENV.officialIcons.adminIdentifiers];
  ENV.officialIcons.adminIdentifiers.splice(0, ENV.officialIcons.adminIdentifiers.length, "admin_user");

  const { app } = createOfficialIconsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/api/admin/icons/official`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        iconKey: "novo-icone",
        name: "Novo ícone",
        imageUrl: "data:image/png;base64,novo",
      }),
    });
    assert.equal(forbidden.status, 403);

    const allowed = await fetch(`${baseUrl}/api/admin/icons/official`, {
      method: "POST",
      headers: {
        "x-test-auth": "admin_user",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        iconKey: "novo-icone",
        name: "Novo ícone",
        category: "farmacia",
        imageUrl: "data:image/png;base64,novo",
      }),
    });
    assert.equal(allowed.status, 201);
  });

  ENV.officialIcons.adminIdentifiers.splice(0, ENV.officialIcons.adminIdentifiers.length, ...previousAdmins);
});
