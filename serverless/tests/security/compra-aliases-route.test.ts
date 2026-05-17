import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createCompraAliasesController } from "../../controllers/compra-aliases.controller";
import { CompraAliasesService } from "../../services/compra-aliases.service";

type InMemoryCompra = {
  id: string;
  userId: string;
  cartaoId: string;
  descricao: string;
};

type InMemoryCartao = {
  id: string;
  userId: string;
};

type InMemoryAlias = {
  id: string;
  userId: string;
  compraCartaoId: string;
  cartaoId: string | null;
  nomeOriginal: string | null;
  nomeImportado: string;
  nomeNormalizado: string;
  issuer: string | null;
  parserUsed: string | null;
  cardLast4: string | null;
  valorParcela: string | null;
  totalParcelas: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function createInMemoryStorageFixture() {
  const compras: InMemoryCompra[] = [
    { id: "compra_a_1", userId: "user_a", cartaoId: "cartao_a_1", descricao: "PS Portal" },
    { id: "compra_b_1", userId: "user_b", cartaoId: "cartao_b_1", descricao: "Netflix" },
  ];
  const cartoes: InMemoryCartao[] = [
    { id: "cartao_a_1", userId: "user_a" },
    { id: "cartao_b_1", userId: "user_b" },
  ];
  const aliases: InMemoryAlias[] = [];
  let seq = 1;

  const storage = {
    async getCompraCartao(id: string, userId: string) {
      return compras.find((item) => item.id === id && item.userId === userId) ?? undefined;
    },
    async getCartao(id: string, userId: string) {
      return cartoes.find((item) => item.id === id && item.userId === userId) ?? undefined;
    },
    async getCompraAliases(userId: string) {
      return aliases.filter((item) => item.userId === userId);
    },
    async createCompraAlias(payload: Omit<InMemoryAlias, "id" | "createdAt" | "updatedAt">) {
      const row: InMemoryAlias = {
        ...payload,
        id: `alias_${seq++}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      aliases.push(row);
      return row;
    },
    async deleteCompraAlias(id: string, userId: string) {
      const index = aliases.findIndex((item) => item.id === id && item.userId === userId);
      if (index < 0) return false;
      aliases.splice(index, 1);
      return true;
    },
  };

  return { storage, aliases, compras };
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

function createCompraAliasesRouteApp() {
  const fixture = createInMemoryStorageFixture();
  const service = new CompraAliasesService(fixture.storage as any);
  const controller = createCompraAliasesController(service);
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a" || authUser === "user_b";
    req.user = authUser ? { id: authUser, subscriptionTier: "premium" } : undefined;
    next();
  });
  app.get("/api/compra-aliases", requireAuth, controller.list);
  app.post("/api/compra-aliases", requireAuth, controller.create);
  app.delete("/api/compra-aliases/:id", requireAuth, controller.remove);
  return { app, fixture };
}

test("rota /api/compra-aliases em serverless exige requireAuth em GET/POST/DELETE", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const getPattern = /app\.get\(\s*"\/api\/compra-aliases"\s*,\s*requireAuth\s*,\s*compraAliasesController\.list\s*\)/m;
  const postPattern = /app\.post\(\s*"\/api\/compra-aliases"\s*,\s*requireAuth\s*,\s*compraAliasesController\.create\s*\)/m;
  const deletePattern = /app\.delete\(\s*"\/api\/compra-aliases\/:id"\s*,\s*requireAuth\s*,\s*compraAliasesController\.remove\s*\)/m;

  assert.ok(getPattern.test(routesSource));
  assert.ok(postPattern.test(routesSource));
  assert.ok(deletePattern.test(routesSource));
});

test("compra aliases: criar exige auth", async () => {
  const { app } = createCompraAliasesRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        compraCartaoId: "compra_a_1",
        nomeImportado: "MLP KaBuM KaBuM",
      }),
    });
    assert.equal(response.status, 401);
  });
});

test("compra aliases: criar/listar/excluir respeitam ownership por userId", async () => {
  const { app, fixture } = createCompraAliasesRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createOwn = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        compraCartaoId: "compra_a_1",
        cartaoId: "cartao_a_1",
        nomeOriginal: "PS Portal",
        nomeImportado: "MLP KaBuM KaBuM",
        issuer: "mercado_pago",
        parserUsed: "mercado_pago_textual_pdf",
        cardLast4: "9064",
        valorParcela: 157.58,
        totalParcelas: 10,
      }),
    });
    assert.equal(createOwn.status, 201);
    const createOwnBody = await createOwn.json();
    assert.equal(createOwnBody.alias.userId, "user_a");
    const ownAliasId = createOwnBody.alias.id as string;

    const createOther = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        compraCartaoId: "compra_b_1",
        nomeImportado: "NETFLIX.COM",
        issuer: "nubank",
      }),
    });
    assert.equal(createOther.status, 404);

    const listA = await fetch(`${baseUrl}/api/compra-aliases`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(listA.status, 200);
    const listABody = await listA.json();
    assert.equal(Array.isArray(listABody), true);
    assert.equal(listABody.length, 1);
    assert.equal(listABody[0].userId, "user_a");

    const listB = await fetch(`${baseUrl}/api/compra-aliases`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(listB.status, 200);
    const listBBody = await listB.json();
    assert.equal(Array.isArray(listBBody), true);
    assert.equal(listBBody.length, 0);

    const deleteByOther = await fetch(`${baseUrl}/api/compra-aliases/${ownAliasId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(deleteByOther.status, 404);
    assert.equal(fixture.aliases.length, 1);

    const deleteOwn = await fetch(`${baseUrl}/api/compra-aliases/${ownAliasId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(deleteOwn.status, 200);
    assert.equal(fixture.aliases.length, 0);
  });
});

test("compra aliases: validações bloqueiam cardLast4 inválido e compra inexistente", async () => {
  const { app } = createCompraAliasesRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const invalidLast4 = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        compraCartaoId: "compra_a_1",
        nomeImportado: "MLP KaBuM KaBuM",
        cardLast4: "90A4",
      }),
    });
    assert.equal(invalidLast4.status, 400);

    const missingCompra = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        compraCartaoId: "compra_nao_existe",
        nomeImportado: "NETFLIX.COM",
      }),
    });
    assert.equal(missingCompra.status, 404);
  });
});

test("compra aliases: aceita cartaoId ausente e números opcionais em string sem erro 500", async () => {
  const { app } = createCompraAliasesRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        compraCartaoId: "compra_a_1",
        nomeImportado: "MLP KaBuM KaBuM",
        valorParcela: "157.58",
        totalParcelas: "10",
      }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.alias.compraCartaoId, "compra_a_1");
  });
});

test("compra aliases: aceita issuer mercado_pago, nubank, itau e também issuer ausente/generic", async () => {
  const { app } = createCompraAliasesRouteApp();
  const payloadBase = {
    compraCartaoId: "compra_a_1",
    cartaoId: "cartao_a_1",
    nomeOriginal: "Compra original",
    nomeImportado: "Compra importada",
  };

  await withTestServer(app, async (baseUrl) => {
    for (const issuer of ["mercado_pago", "nubank", "itau"] as const) {
      const response = await fetch(`${baseUrl}/api/compra-aliases`, {
        method: "POST",
        headers: {
          "x-test-auth": "user_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...payloadBase, issuer, nomeImportado: `${payloadBase.nomeImportado}-${issuer}` }),
      });
      assert.equal(response.status, 201);
    }

    const genericIssuer = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...payloadBase, issuer: "generic", nomeImportado: "Compra importada generic" }),
    });
    assert.equal(genericIssuer.status, 201);

    const withoutIssuer = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...payloadBase, nomeImportado: "Compra importada sem issuer" }),
    });
    assert.equal(withoutIssuer.status, 201);
  });
});

test("compra aliases: salvar alias não altera compra existente", async () => {
  const { app, fixture } = createCompraAliasesRouteApp();
  const beforeCompra = structuredClone(fixture.compras.find((item) => item.id === "compra_a_1"));
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/compra-aliases`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        compraCartaoId: "compra_a_1",
        nomeImportado: "MLP KaBuM KaBuM",
      }),
    });
    assert.equal(response.status, 201);
  });

  const afterCompra = fixture.compras.find((item) => item.id === "compra_a_1");
  assert.deepEqual(afterCompra, beforeCompra);
  assert.equal(fixture.aliases.length, 1);
});
