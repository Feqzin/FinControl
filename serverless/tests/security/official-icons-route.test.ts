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
};

type InMemoryPack = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  isActive: boolean;
};

type InMemoryUserIcon = {
  id: string;
  userId: string;
  officialIconId: string;
};

function createInMemoryServiceFixture() {
  const packs: InMemoryPack[] = [
    {
      id: "pack-bancos",
      name: "Bancos BR",
      description: "Ícones oficiais de bancos",
      category: "bancos",
      coverImageUrl: null,
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
    },
  ];

  const userIcons: InMemoryUserIcon[] = [];
  const rules: Array<{ userId: string; iconId: string; term: string }> = [];
  let iconSeq = 1;

  const service = {
    async listOfficialIcons(userId: string) {
      const userOfficialIds = new Set(
        userIcons
          .filter((icon) => icon.userId === userId)
          .map((icon) => icon.officialIconId),
      );
      return officialIcons
        .filter((icon) => icon.isActive)
        .map((icon) => ({
          ...icon,
          storagePath: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alreadyInLibrary: userOfficialIds.has(icon.id),
        }));
    },
    async listOfficialPacks(userId: string) {
      return packs
        .filter((pack) => pack.isActive)
        .map((pack) => {
          const totalIcons = officialIcons.filter((icon) => icon.isActive && icon.packId === pack.id).length;
          const addedIconsCount = userIcons.filter((icon) => icon.userId === userId && officialIcons.some((official) => official.id === icon.officialIconId && official.packId === pack.id)).length;
          return {
            ...pack,
            iconsCount: totalIcons,
            addedIconsCount,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });
    },
    async addOfficialIconToLibrary(userId: string, officialIconId: string) {
      const official = officialIcons.find((icon) => icon.id === officialIconId && icon.isActive);
      if (!official) {
        const error = new Error("Ícone oficial não encontrado.");
        error.name = "OfficialIconNotFoundError";
        throw error;
      }

      const existing = userIcons.find((icon) => icon.userId === userId && icon.officialIconId === officialIconId);
      if (existing) {
        return {
          icon: {
            id: existing.id,
            userId,
            sourceType: "official",
            officialIconId: official.id,
            name: official.name,
            imageUrl: official.imageUrl,
            storagePath: null,
            category: official.category,
            tags: official.tags,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          alreadyInLibrary: true,
          createdMatchRules: 0,
        };
      }

      const row = {
        id: `user_icon_${iconSeq++}`,
        userId,
        officialIconId: official.id,
      };
      userIcons.push(row);

      let createdMatchRules = 0;
      const terms = [official.name, ...official.tags, ...official.aliases];
      for (const term of terms) {
        if (!rules.some((rule) => rule.userId === userId && rule.term === term)) {
          rules.push({ userId, iconId: official.imageUrl, term });
          createdMatchRules += 1;
        }
      }

      return {
        icon: {
          id: row.id,
          userId,
          sourceType: "official",
          officialIconId: official.id,
          name: official.name,
          imageUrl: official.imageUrl,
          storagePath: null,
          category: official.category,
          tags: official.tags,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        alreadyInLibrary: false,
        createdMatchRules,
      };
    },
    async addOfficialPackToLibrary(userId: string, packId: string) {
      const pack = packs.find((item) => item.id === packId && item.isActive);
      if (!pack) {
        const error = new Error("Pack oficial não encontrado.");
        error.name = "OfficialIconPackNotFoundError";
        throw error;
      }
      const icons = officialIcons.filter((icon) => icon.isActive && icon.packId === packId);
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
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };

  return { service, userIcons, rules };
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
  app.get("/api/icons/packs", requireAuth, controller.listPacks);
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

    const userAIcons = fixture.userIcons.filter((icon) => icon.userId === "user_a");
    const userBIcons = fixture.userIcons.filter((icon) => icon.userId === "user_b");
    assert.equal(userAIcons.length, 1);
    assert.equal(userBIcons.length, 0);
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
        imageUrl: "data:image/png;base64,novo",
      }),
    });
    assert.equal(allowed.status, 201);
  });

  ENV.officialIcons.adminIdentifiers.splice(0, ENV.officialIcons.adminIdentifiers.length, ...previousAdmins);
});
