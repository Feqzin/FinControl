import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createVacationPlansController } from "../../controllers/vacation-plans.controller.js";
import { VacationPlansService } from "../../services/vacation-plans.service.js";

function createFixture() {
  const incomes = [
    { id: "income-a", userId: "user_a", tipo: "fixo", ativo: true, valor: "3000.00", descricao: "Salário A" },
    { id: "income-variable", userId: "user_a", tipo: "variavel", ativo: true, valor: "500.00", descricao: "Freela" },
    { id: "income-b", userId: "user_b", tipo: "fixo", ativo: true, valor: "2500.00", descricao: "Salário B" },
  ];
  const plans: any[] = [];
  let sequence = 1;
  const storage = {
    async getRendas(userId: string) {
      return incomes.filter((income) => income.userId === userId);
    },
    async getVacationPlans(userId: string) {
      return plans.filter((plan) => plan.userId === userId);
    },
    async createVacationPlan(payload: any) {
      const now = new Date();
      const row = { ...payload, id: `plan-${sequence++}`, createdAt: now, updatedAt: now };
      plans.push(row);
      return row;
    },
    async deleteVacationPlan(id: string, userId: string) {
      const index = plans.findIndex((plan) => plan.id === id && plan.userId === userId);
      if (index < 0) return false;
      plans.splice(index, 1);
      return true;
    },
  };
  return { storage, plans };
}

async function withTestServer(app: ReturnType<typeof express>, run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createApp() {
  const fixture = createFixture();
  const controller = createVacationPlansController(new VacationPlansService(fixture.storage as any));
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const userId = req.get("x-test-auth");
    req.isAuthenticated = () => userId === "user_a" || userId === "user_b";
    req.user = userId ? { id: userId } : undefined;
    next();
  });
  app.get("/api/vacation-plans", requireAuth, controller.list);
  app.post("/api/vacation-plans", requireAuth, controller.create);
  app.delete("/api/vacation-plans/:id", requireAuth, controller.remove);
  return { app, fixture };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    rendaId: "income-a",
    startDate: "2026-09-01",
    durationDays: 30,
    vacationPayReceived: false,
    vacationPayDate: "2026-08-30",
    vacationPayAmount: null,
    includedInPatrimony: false,
    ...overrides,
  };
}

test("rotas de Modo férias no serverless exigem autenticação", async () => {
  const routesSource = await readFile(path.resolve(process.cwd(), "serverless", "routes.ts"), "utf8");
  assert.match(routesSource, /app\.get\(\s*"\/api\/vacation-plans"\s*,\s*requireAuth\s*,\s*vacationPlansController\.list\s*\)/m);
  assert.match(routesSource, /app\.post\(\s*"\/api\/vacation-plans"\s*,\s*requireAuth\s*,\s*vacationPlansController\.create\s*\)/m);
  assert.match(routesSource, /app\.delete\(\s*"\/api\/vacation-plans\/:id"\s*,\s*requireAuth\s*,\s*vacationPlansController\.remove\s*\)/m);
});

test("Modo férias exige autenticação para criar", async () => {
  const { app } = createApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/vacation-plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 401);
  });
});

test("Modo férias respeita renda fixa, ownership e sobreposição", async () => {
  const { app } = createApp();
  await withTestServer(app, async (baseUrl) => {
    const headers = { "x-test-auth": "user_a", "content-type": "application/json" };
    const foreignIncome = await fetch(`${baseUrl}/api/vacation-plans`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload({ rendaId: "income-b" })),
    });
    assert.equal(foreignIncome.status, 400);

    const variableIncome = await fetch(`${baseUrl}/api/vacation-plans`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload({ rendaId: "income-variable" })),
    });
    assert.equal(variableIncome.status, 400);

    const createdResponse = await fetch(`${baseUrl}/api/vacation-plans`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload()),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();

    const overlapResponse = await fetch(`${baseUrl}/api/vacation-plans`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload({ startDate: "2026-09-15", durationDays: 10 })),
    });
    assert.equal(overlapResponse.status, 400);

    const otherUserList = await fetch(`${baseUrl}/api/vacation-plans`, {
      headers: { "x-test-auth": "user_b" },
    });
    assert.deepEqual(await otherUserList.json(), []);

    const otherUserDelete = await fetch(`${baseUrl}/api/vacation-plans/${created.id}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(otherUserDelete.status, 404);
  });
});
