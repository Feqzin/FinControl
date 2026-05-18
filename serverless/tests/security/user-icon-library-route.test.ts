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
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
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
    async create(userId: string, payload: { imageDataUrl: string; name?: string | null; category?: string | null }) {
      const row: InMemoryIcon = {
        id: `icon_${seq++}`,
        userId,
        name: payload.name?.trim() || "Ícone personalizado",
        imageUrl: payload.imageDataUrl,
        storagePath: null,
        category: payload.category ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      icons.push(row);
      return row;
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
  app.delete("/api/user-icon-library/:id", requireAuth, controller.remove);
  return { app, fixture };
}

test("rota /api/user-icon-library em serverless exige requireAuth em GET/POST/DELETE", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const getPattern = /app\.get\(\s*"\/api\/user-icon-library"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.list\s*\)/m;
  const postPattern = /app\.post\(\s*"\/api\/user-icon-library"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.create\s*\)/m;
  const deletePattern = /app\.delete\(\s*"\/api\/user-icon-library\/:id"\s*,\s*requireAuth\s*,\s*userIconLibraryController\.remove\s*\)/m;

  assert.ok(getPattern.test(routesSource));
  assert.ok(postPattern.test(routesSource));
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
        imageDataUrl: SAMPLE_PNG_DATA_URL,
      }),
    });
    assert.equal(createA.status, 201);
    const createBody = await createA.json();
    assert.equal(createBody.icon.userId, "user_a");
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
