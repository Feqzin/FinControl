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
  name: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  sourceType: "official" | "community";
  ownerUserId: string | null;
  isActive: boolean;
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

const COMMUNITY_PREFIX = "community:";

function isCommunityIconKey(iconKey: string): boolean {
  return iconKey.startsWith(COMMUNITY_PREFIX);
}

function parseCommunitySourceUserIconId(iconKey: string): string | null {
  if (!isCommunityIconKey(iconKey)) return null;
  const payload = iconKey.slice(COMMUNITY_PREFIX.length);
  const chunks = payload.split(":");
  if (chunks.length < 2) return null;
  return chunks.slice(1).join(":") || null;
}

function createInMemoryServiceFixture() {
  const packs: InMemoryPack[] = [
    {
      id: "pack-bancos",
      name: "Bancos BR",
      description: "Ícones oficiais de bancos",
      category: "bancos",
      coverImageUrl: null,
      sourceType: "official",
      ownerUserId: null,
      isActive: true,
    },
  ];

  const officialIcons: InMemoryOfficialIcon[] = [
    {
      id: "official-kabum",
      iconKey: "kabum-official",
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
  let userIconSeq = 1;
  let officialSeq = 1;

  const mapListItem = (icon: InMemoryOfficialIcon, userId: string) => ({
    id: icon.id,
    iconKey: icon.iconKey,
    sourceType: isCommunityIconKey(icon.iconKey) ? "community" : "official",
    sourceUserIconId: parseCommunitySourceUserIconId(icon.iconKey),
    ownerUserId: isCommunityIconKey(icon.iconKey) ? icon.createdBy : null,
    ownerLabel: isCommunityIconKey(icon.iconKey) ? "Publicado por usuário" : null,
    name: icon.name,
    imageUrl: icon.imageUrl,
    storagePath: null,
    category: icon.category,
    tags: icon.tags,
    aliases: icon.aliases,
    packId: icon.packId,
    packName: icon.packName,
    alreadyInLibrary: userIcons.some((row) => row.userId === userId && row.officialIconId === icon.id),
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

    const existing = userIcons.find((row) => row.userId === userId && row.officialIconId === icon.id);
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

  const service = {
    async listOfficialIcons(
      userId: string,
      query?: { origin?: "official" | "community" | "all"; packId?: string; search?: string; category?: string },
    ) {
      const origin = query?.origin ?? "official";
      const normalizedSearch = String(query?.search ?? "").trim().toLowerCase();
      const normalizedCategory = String(query?.category ?? "").trim().toLowerCase();
      const packId = String(query?.packId ?? "").trim();
      return officialIcons
        .filter((icon) => icon.isActive)
        .filter((icon) => {
          if (origin === "community") return isCommunityIconKey(icon.iconKey);
          if (origin === "official") return !isCommunityIconKey(icon.iconKey);
          return true;
        })
        .filter((icon) => (!packId ? true : icon.packId === packId))
        .filter((icon) => (!normalizedCategory ? true : String(icon.category ?? "").toLowerCase() === normalizedCategory))
        .filter((icon) => {
          if (!normalizedSearch) return true;
          const haystack = `${icon.name} ${icon.category ?? ""} ${icon.tags.join(" ")} ${icon.aliases.join(" ")}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        })
        .map((icon) => mapListItem(icon, userId));
    },
    async listCommunityIcons(userId: string, query?: { packId?: string; search?: string; category?: string }) {
      return service.listOfficialIcons(userId, { ...query, origin: "community" });
    },
    async listOfficialPacks(userId: string, query?: { origin?: "all" | "official" | "community"; category?: string; search?: string }) {
      const origin = query?.origin ?? "all";
      const normalizedCategory = String(query?.category ?? "").trim().toLowerCase();
      const normalizedSearch = String(query?.search ?? "").trim().toLowerCase();
      return packs
        .filter((pack) => pack.isActive)
        .filter((pack) => (origin === "all" ? true : pack.sourceType === origin))
        .filter((pack) => (!normalizedCategory ? true : String(pack.category ?? "").toLowerCase() === normalizedCategory))
        .filter((pack) => (!normalizedSearch
          ? true
          : `${pack.name} ${pack.description ?? ""} ${pack.category ?? ""}`.toLowerCase().includes(normalizedSearch)))
        .map((pack) => {
          const totalIcons = officialIcons.filter((icon) =>
            icon.isActive && icon.packId === pack.id).length;
          const addedIconsCount = userIcons.filter((icon) =>
            icon.userId === userId
            && icon.officialIconId
            && officialIcons.some((official) =>
              official.id === icon.officialIconId
              && official.packId === pack.id)).length;
          return {
            ...pack,
            ownerLabel: pack.sourceType === "community" ? "Publicado por usuário" : null,
            isPublished: pack.isActive,
            iconsCount: totalIcons,
            addedIconsCount,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });
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
      packs.push({
        id: packId,
        name: payload.name,
        description: payload.description ?? null,
        category: payload.category ?? null,
        coverImageUrl: selectedIcons[0]?.imageUrl ?? null,
        sourceType: "community",
        ownerUserId: userId,
        isActive: publish,
      });

      for (const source of selectedIcons) {
        officialIcons.push({
          id: `community_pack_icon_${officialSeq++}`,
          iconKey: `${COMMUNITY_PREFIX}${userId}:${source.id}:pack:${packId}`,
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
      return {
        packId,
        totalIcons: icons.length,
        addedCount,
        alreadyInLibraryCount,
        createdMatchRules,
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
      return {
        packId,
        totalIcons: icons.length,
        addedCount,
        alreadyInLibraryCount,
        createdMatchRules,
      };
    },
    async createOfficialPack(_adminUserId: string, payload: { name: string }) {
      const pack = {
        id: `pack_${packs.length + 1}`,
        name: payload.name,
        description: null,
        category: null,
        coverImageUrl: null,
        sourceType: "official",
        ownerUserId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
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
      return {
        ...pack,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async createOfficialIcon(_adminUserId: string, payload: { iconKey: string; name: string; imageUrl?: string | null }) {
      const icon = {
        id: `official_${officialIcons.length + 1}`,
        iconKey: payload.iconKey,
        name: payload.name,
        imageUrl: payload.imageUrl ?? "data:image/png;base64,new",
        storagePath: null,
        category: null,
        tags: [],
        aliases: [],
        packId: null,
        isActive: true,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      officialIcons.push({
        id: icon.id,
        iconKey: icon.iconKey,
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
        isActive: icon.isActive,
        createdBy: icon.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };

  return { service, userIcons, rules, officialIcons };
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
  app.post("/api/icons/community/packs/:id/add-to-library", requireAuth, controller.addCommunityPackToLibrary);
  app.patch("/api/icons/community/packs/:id", requireAuth, controller.updateCommunityPack);
  app.patch("/api/icons/community/packs/:id/unpublish", requireAuth, controller.unpublishCommunityPack);
  app.patch("/api/icons/community/:id/unpublish", requireAuth, controller.unpublishCommunityIcon);
  app.post("/api/icons/official/:id/add-to-library", requireAuth, controller.addOfficialIconToLibrary);
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
    /app\.post\(\s*"\/api\/icons\/community\/packs\/:id\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addCommunityPackToLibrary\s*\)/m,
    /app\.patch\(\s*"\/api\/icons\/community\/packs\/:id"\s*,\s*requireAuth\s*,\s*officialIconsController\.updateCommunityPack\s*\)/m,
    /app\.patch\(\s*"\/api\/icons\/community\/packs\/:id\/unpublish"\s*,\s*requireAuth\s*,\s*officialIconsController\.unpublishCommunityPack\s*\)/m,
    /app\.patch\(\s*"\/api\/icons\/community\/:id\/unpublish"\s*,\s*requireAuth\s*,\s*officialIconsController\.unpublishCommunityIcon\s*\)/m,
    /app\.get\(\s*"\/api\/icons\/packs"\s*,\s*requireAuth\s*,\s*officialIconsController\.listPacks\s*\)/m,
    /app\.post\(\s*"\/api\/icons\/official\/:id\/add-to-library"\s*,\s*requireAuth\s*,\s*officialIconsController\.addOfficialIconToLibrary\s*\)/m,
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
    assert.equal(body.icons.length, 1);
    assert.equal(body.icons[0].id, "official-kabum");
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
    assert.equal(typeof packId, "string");

    const listAsUserB = await fetch(`${baseUrl}/api/icons/community/packs`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(listAsUserB.status, 200);
    const listBody = await listAsUserB.json();
    assert.equal(listBody.packs.some((pack: { id: string }) => pack.id === packId), true);

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
