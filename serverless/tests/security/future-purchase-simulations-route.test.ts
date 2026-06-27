import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createFuturePurchaseSimulationsController } from "../../controllers/future-purchase-simulations.controller.js";
import { FuturePurchaseSimulationsService } from "../../services/future-purchase-simulations.service.js";

type InMemoryCartao = {
  id: string;
  userId: string;
};

type InMemoryCompra = {
  id: string;
  userId: string;
  descricao: string;
};

type InMemorySimulation = {
  id: string;
  userId: string;
  nome: string;
  purchaseName: string | null;
  totalAmount: string;
  installmentCount: number;
  cardId: string | null;
  firstInstallmentMonth: string;
  minimumReserve: string;
  extraIncomes: Array<{
    id: string;
    descricao: string;
    valor: number;
    data: string;
    recorrente: boolean;
  }>;
  resultStatus: "Pode comprar" | "Atenção" | "Não recomendado" | null;
  worstMonth: string | null;
  lowestBalance: string | null;
  safePurchaseAmount: string | null;
  recommendedInstallments: number | null;
  monthlyTimelineSnapshot: Array<{
    monthReference: string;
    label: string;
    startingBalance: number;
    actualIncome: number;
    simulatedExtraIncome: number;
    actualExpenses: number;
    actualNonCardExpenses: number;
    actualCardExpenses: number;
    simulatedInstallment: number;
    endingBalance: number;
    belowZero: boolean;
    belowReserve: boolean;
    actualIncomeBreakdown: unknown[];
    actualExpenseBreakdown: unknown[];
    extraIncomeEntries: unknown[];
    heaviestItems: unknown[];
  }>;
  createdAt: Date;
  updatedAt: Date;
};

function createInMemoryStorageFixture() {
  const cartoes: InMemoryCartao[] = [
    { id: "cartao_a_1", userId: "user_a" },
    { id: "cartao_b_1", userId: "user_b" },
  ];
  const compras: InMemoryCompra[] = [
    { id: "compra_a_1", userId: "user_a", descricao: "PS Portal" },
  ];
  const simulations: InMemorySimulation[] = [];
  let seq = 1;

  const storage = {
    async getCartao(id: string, userId: string) {
      return cartoes.find((item) => item.id === id && item.userId === userId) ?? undefined;
    },
    async getFuturePurchaseSimulations(userId: string) {
      return simulations.filter((item) => item.userId === userId);
    },
    async getFuturePurchaseSimulation(id: string, userId: string) {
      return simulations.find((item) => item.id === id && item.userId === userId) ?? undefined;
    },
    async createFuturePurchaseSimulation(payload: Omit<InMemorySimulation, "id" | "createdAt" | "updatedAt">) {
      const row: InMemorySimulation = {
        ...payload,
        id: `simulation_${seq++}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      simulations.push(row);
      return row;
    },
    async updateFuturePurchaseSimulation(
      id: string,
      userId: string,
      payload: Partial<Omit<InMemorySimulation, "id" | "createdAt" | "updatedAt">>,
    ) {
      const index = simulations.findIndex((item) => item.id === id && item.userId === userId);
      if (index < 0) return undefined;
      simulations[index] = {
        ...simulations[index],
        ...payload,
        updatedAt: new Date(),
      };
      return simulations[index];
    },
    async deleteFuturePurchaseSimulation(id: string, userId: string) {
      const index = simulations.findIndex((item) => item.id === id && item.userId === userId);
      if (index < 0) return false;
      simulations.splice(index, 1);
      return true;
    },
  };

  return { storage, simulations, compras };
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

function createSimulationPayload() {
  return {
    nome: "GPU outubro 2026",
    purchaseName: "Placa de vídeo",
    totalAmount: 13700,
    installmentCount: 10,
    cardId: "cartao_a_1",
    firstInstallmentMonth: "2026-06",
    minimumReserve: 500,
    extraIncomes: [{
      id: "extra-1",
      descricao: "Freela",
      valor: 1500,
      data: "2026-10-20",
      recorrente: false,
    }],
    resultStatus: "Não recomendado" as const,
    worstMonth: "2026-09",
    lowestBalance: -408.46,
    safePurchaseAmount: 11428.84,
    recommendedInstallments: 12,
    monthlyTimelineSnapshot: [{
      monthReference: "2026-09",
      label: "set de 2026",
      startingBalance: 200,
      actualIncome: 1000,
      simulatedExtraIncome: 0,
      actualExpenses: 1238.46,
      actualNonCardExpenses: 738.46,
      actualCardExpenses: 500,
      simulatedInstallment: 370,
      endingBalance: -408.46,
      belowZero: true,
      belowReserve: true,
      actualIncomeBreakdown: [],
      actualExpenseBreakdown: [],
      extraIncomeEntries: [],
      heaviestItems: [],
    }],
  };
}

function createFuturePurchaseSimulationsRouteApp() {
  const fixture = createInMemoryStorageFixture();
  const service = new FuturePurchaseSimulationsService(fixture.storage as any);
  const controller = createFuturePurchaseSimulationsController(service);
  const app = express();
  app.use(express.json({ limit: "300kb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a" || authUser === "user_b";
    req.user = authUser ? { id: authUser, subscriptionTier: "premium" } : undefined;
    next();
  });
  app.get("/api/simulador/compra-futura/simulacoes", requireAuth, controller.list);
  app.post("/api/simulador/compra-futura/simulacoes", requireAuth, controller.create);
  app.get("/api/simulador/compra-futura/simulacoes/:id", requireAuth, controller.get);
  app.patch("/api/simulador/compra-futura/simulacoes/:id", requireAuth, controller.update);
  app.delete("/api/simulador/compra-futura/simulacoes/:id", requireAuth, controller.remove);
  return { app, fixture };
}

test("rota /api/simulador/compra-futura/simulacoes em serverless exige requireAuth em GET/POST/PATCH/DELETE", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  assert.match(routesSource, /app\.get\(\s*"\/api\/simulador\/compra-futura\/simulacoes"\s*,\s*requireAuth\s*,\s*futurePurchaseSimulationsController\.list\s*\)/m);
  assert.match(routesSource, /app\.post\(\s*"\/api\/simulador\/compra-futura\/simulacoes"\s*,\s*requireAuth\s*,\s*futurePurchaseSimulationsController\.create\s*\)/m);
  assert.match(routesSource, /app\.get\(\s*"\/api\/simulador\/compra-futura\/simulacoes\/:id"\s*,\s*requireAuth\s*,\s*futurePurchaseSimulationsController\.get\s*\)/m);
  assert.match(routesSource, /app\.patch\(\s*"\/api\/simulador\/compra-futura\/simulacoes\/:id"\s*,\s*requireAuth\s*,\s*futurePurchaseSimulationsController\.update\s*\)/m);
  assert.match(routesSource, /app\.delete\(\s*"\/api\/simulador\/compra-futura\/simulacoes\/:id"\s*,\s*requireAuth\s*,\s*futurePurchaseSimulationsController\.remove\s*\)/m);
});

test("simulações de compra futura: criar exige auth", async () => {
  const { app } = createFuturePurchaseSimulationsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createSimulationPayload()),
    });
    assert.equal(response.status, 401);
  });
});

test("simulações de compra futura: CRUD respeita ownership e preserva snapshot salvo sem criar compra real", async () => {
  const { app, fixture } = createFuturePurchaseSimulationsRouteApp();
  const comprasBefore = structuredClone(fixture.compras);

  await withTestServer(app, async (baseUrl) => {
    const createOwn = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify(createSimulationPayload()),
    });
    assert.equal(createOwn.status, 201);
    const created = await createOwn.json();
    assert.equal(created.userId, "user_a");
    assert.equal(created.extraIncomes.length, 1);
    assert.equal(created.monthlyTimelineSnapshot.length, 1);
    const createdId = created.id as string;

    const listA = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(listA.status, 200);
    const listABody = await listA.json();
    assert.equal(listABody.length, 1);
    assert.equal(listABody[0].id, createdId);

    const listB = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(listB.status, 200);
    const listBBody = await listB.json();
    assert.equal(listBBody.length, 0);

    const getOther = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes/${createdId}`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(getOther.status, 404);

    const getOwn = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes/${createdId}`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(getOwn.status, 200);
    const getOwnBody = await getOwn.json();
    assert.equal(getOwnBody.nome, "GPU outubro 2026");

    const updateOther = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes/${createdId}`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_b",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createSimulationPayload(),
        nome: "Tentativa indevida",
      }),
    });
    assert.equal(updateOther.status, 404);

    const updateOwn = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes/${createdId}`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createSimulationPayload(),
        nome: "GPU revisada",
        recommendedInstallments: 14,
      }),
    });
    assert.equal(updateOwn.status, 200);
    const updateOwnBody = await updateOwn.json();
    assert.equal(updateOwnBody.nome, "GPU revisada");
    assert.equal(updateOwnBody.recommendedInstallments, 14);

    const duplicateOwn = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createSimulationPayload(),
        nome: "GPU revisada (cópia)",
      }),
    });
    assert.equal(duplicateOwn.status, 201);

    const deleteOther = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes/${createdId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(deleteOther.status, 404);

    const deleteOwn = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes/${createdId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(deleteOwn.status, 200);

    const listAfterDelete = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(listAfterDelete.status, 200);
    const listAfterDeleteBody = await listAfterDelete.json();
    assert.equal(listAfterDeleteBody.length, 1);
    assert.equal(listAfterDeleteBody[0].nome, "GPU revisada (cópia)");
  });

  assert.deepEqual(fixture.compras, comprasBefore);
});

test("simulações de compra futura: valida cartão pelo user e bloqueia acesso cruzado", async () => {
  const { app } = createFuturePurchaseSimulationsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const invalidCard = await fetch(`${baseUrl}/api/simulador/compra-futura/simulacoes`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createSimulationPayload(),
        cardId: "cartao_b_1",
      }),
    });
    assert.equal(invalidCard.status, 400);
  });
});
