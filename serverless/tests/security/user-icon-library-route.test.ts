import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createUserIconLibraryController } from "../../controllers/user-icon-library.controller";

type InMemoryIcon = {
  id: string;
  userId: string;
  sourceType: "upload" | "official";
  officialIconId: string | null;
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
  tags: string[] | null;
  createdAt: Date;
  updatedAt: Date;
};

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Xk2wAAAAASUVORK5CYII=";

function createInMemoryServiceFixture() {
  const icons: InMemoryIcon[] = [];
  let seq = 1;

  const service = {
    async list(userId: string) {
      return icons.filter((icon) => icon.userId === userId);
    },
    async create(userId: string, payload: {
      imageDataUrl: string;
      name: string;
      category?: string | null;
      keywords?: string[];
    }) {
      const row: InMemoryIcon = {
        id: `icon_${seq++}`,
        userId,
        sourceType: "upload",
        officialIconId: null,
        name: payload.name?.trim() || "Ícone personalizado",
        imageUrl: payload.imageDataUrl,
        storagePath: null,
        category: payload.category ?? null,
        tags: payload.keywords ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      icons.push(row);
      return row;
    },
    async createBatch(userId: string, payload: {
      defaultCategory?: string | null;
      defaultKeywords?: string[];
      icons: Array<{
        imageDataUrl: string;
        name: string;
        category?: string | null;
        keywords?: string[];
        originalFileName?: string | null;
      }>;
    }) {
      const created: InMemoryIcon[] = [];
      const failed: Array<{ requestIndex: number; originalFileName: string; reason: string }> = [];

      for (const [requestIndex, item] of payload.icons.entries()) {
        const name = item.name?.trim() ?? "";
        if (!name || name.length < 2) {
          failed.push({
            requestIndex,
            originalFileName: item.originalFileName ?? `icone_${requestIndex + 1}`,
            reason: "Nome do ícone obrigatório.",
          });
          continue;
        }
        if (!String(item.imageDataUrl ?? "").startsWith("data:image/")) {
          failed.push({
            requestIndex,
            originalFileName: item.originalFileName ?? `icone_${requestIndex + 1}`,
            reason: "Formato de imagem inválido.",
          });
          continue;
        }
        const icon = await service.create(userId, {
          imageDataUrl: item.imageDataUrl,
          name,
          category: item.category ?? payload.defaultCategory ?? null,
          keywords: [...(payload.defaultKeywords ?? []), ...(item.keywords ?? [])],
        });
        created.push(icon);
      }

      return { created, failed };
    },
    async update(userId: string, id: string, payload: { name?: string; category?: string | null; keywords?: string[] }) {
      const icon = icons.find((entry) => entry.id === id && entry.userId === userId);
      if (!icon) return null;
      if (payload.name !== undefined) icon.name = payload.name;
      if (payload.category !== undefined) icon.category = payload.category;
      if (payload.keywords !== undefined) icon.tags = payload.keywords;
      icon.updatedAt = new Date();
      return icon;
    },
    async remove(userId: string, id: string) {
      const index = icons.findIndex((icon) => icon.id === id && icon.userId === userId);
      if (index < 0) return false;
      icons.splice(index, 1);
      return true;
    },
  };

  return { service, icons };
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

function createUserIconLibraryRouteApp() {
  const fixture = createInMemoryServiceFixture();
  const controller = createUserIconLibraryController(fixture.service as any);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a" || authUser === "user_b";
    req.user = authUser ? { id: authUser, subscriptionTier: "premium" } : undefined;
    next();
  });
  app.get("/api/user-icon-library", requireAuth, controller.list);
  app.post("/api/user-icon-library", requireAuth, controller.create);
  app.post("/api/user-icon-library/batch", requireAuth, controller.createBatch);
  app.patch("/api/user-icon-library/:id", requireAuth, controller.update);
  app.delete("/api/user-icon-library/:id", requireAuth, controller.remove);
  return { app, fixture };
}

test("rota /api/user-icon-library em serverless exige requireAuth em GET/POST/BATCH/PATCH/DELETE", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const getPattern = /app\.get\(\s*"\/api\/user-icon-library"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.list\s*\)/m;
  const postPattern = /app\.post\(\s*"\/api\/user-icon-library"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.create\s*\)/m;
  const postBatchPattern = /app\.post\(\s*"\/api\/user-icon-library\/batch"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.createBatch\s*\)/m;
  const patchPattern = /app\.patch\(\s*"\/api\/user-icon-library\/:id"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.update\s*\)/m;
  const deletePattern = /app\.delete\(\s*"\/api\/user-icon-library\/:id"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.remove\s*\)/m;

  assert.ok(getPattern.test(routesSource));
  assert.ok(postPattern.test(routesSource));
  assert.ok(postBatchPattern.test(routesSource));
  assert.ok(patchPattern.test(routesSource));
  assert.ok(deletePattern.test(routesSource));
});

test("user icon library: criar exige auth", async () => {
  const { app } = createUserIconLibraryRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/user-icon-library`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "KaBuM",
        imageDataUrl: SAMPLE_PNG_DATA_URL,
      }),
    });
    assert.equal(response.status, 401);
  });
});

test("user icon library: listar/criar/excluir respeitam ownership por userId", async () => {
  const { app, fixture } = createUserIconLibraryRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createA = await fetch(`${baseUrl}/api/user-icon-library`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "KaBuM",
        keywords: ["kabum", "mlp kabum"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
      }),
    });
    assert.equal(createA.status, 201);
    const createBody = await createA.json();
    assert.equal(createBody.icon.userId, "user_a");
    assert.deepEqual(createBody.icon.tags, ["kabum", "mlp kabum"]);
    const iconId = createBody.icon.id as string;

    const listA = await fetch(`${baseUrl}/api/user-icon-library`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(listA.status, 200);
    const listABody = await listA.json();
    assert.equal(listABody.length, 1);

    const listB = await fetch(`${baseUrl}/api/user-icon-library`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(listB.status, 200);
    const listBBody = await listB.json();
    assert.equal(listBBody.length, 0);

    const deleteByOther = await fetch(`${baseUrl}/api/user-icon-library/${iconId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(deleteByOther.status, 404);
    assert.equal(fixture.icons.length, 1);

    const deleteOwn = await fetch(`${baseUrl}/api/user-icon-library/${iconId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(deleteOwn.status, 200);
    assert.equal(fixture.icons.length, 0);
  });
});

test("user icon library: upload exige nome e editar respeita ownership", async () => {
  const { app } = createUserIconLibraryRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const invalidCreate = await fetch(`${baseUrl}/api/user-icon-library`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        imageDataUrl: SAMPLE_PNG_DATA_URL,
      }),
    });
    assert.equal(invalidCreate.status, 400);

    const create = await fetch(`${baseUrl}/api/user-icon-library`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Itaú",
        category: "farmacia",
        keywords: ["itau", "itaucard", "unibanco"],
        imageDataUrl: SAMPLE_PNG_DATA_URL,
      }),
    });
    assert.equal(create.status, 201);
    const createdBody = await create.json();
    const iconId = createdBody.icon.id as string;
    assert.equal(createdBody.icon.category, "farmacia");

    const patchOtherUser = await fetch(`${baseUrl}/api/user-icon-library/${iconId}`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Itaú Uniclass",
      }),
    });
    assert.equal(patchOtherUser.status, 404);

    const patchOwn = await fetch(`${baseUrl}/api/user-icon-library/${iconId}`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Itaú Uniclass",
        category: "imposto",
        keywords: ["itau", "uniclass"],
      }),
    });
    assert.equal(patchOwn.status, 200);
    const patchedBody = await patchOwn.json();
    assert.equal(patchedBody.icon.name, "Itaú Uniclass");
    assert.equal(patchedBody.icon.category, "imposto");
    assert.deepEqual(patchedBody.icon.tags, ["itau", "uniclass"]);
  });
});

test("user icon library: batch exige auth e permite falha parcial sem rollback global", async () => {
  const { app, fixture } = createUserIconLibraryRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const withoutAuth = await fetch(`${baseUrl}/api/user-icon-library/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        icons: [{ name: "KaBuM", imageDataUrl: SAMPLE_PNG_DATA_URL }],
      }),
    });
    assert.equal(withoutAuth.status, 401);

    const withPartialFailure = await fetch(`${baseUrl}/api/user-icon-library/batch`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        defaultCategory: "loja",
        defaultKeywords: ["kabum"],
        icons: [
          {
            name: "KaBuM",
            originalFileName: "kabum.png",
            imageDataUrl: SAMPLE_PNG_DATA_URL,
          },
          {
            name: "Invalido",
            originalFileName: "ruim.svg",
            imageDataUrl: "not-a-data-url",
          },
        ],
      }),
    });

    assert.equal(withPartialFailure.status, 200);
    const body = await withPartialFailure.json();
    assert.equal(body.created.length, 1);
    assert.equal(body.failed.length, 1);
    assert.equal(body.failed[0].requestIndex, 1);
    assert.equal(fixture.icons.length, 1);
    assert.equal(fixture.icons[0]?.userId, "user_a");
  });
});
