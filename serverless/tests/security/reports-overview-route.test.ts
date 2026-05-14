import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createReportsController } from "../../controllers/reports.controller";

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

function createReportsRouteApp() {
  const serviceCalls: Array<{ userId: string; query: unknown }> = [];
  const service = {
    async getOverview(userId: string, query: unknown) {
      serviceCalls.push({ userId, query });
      return {
        period: { startDate: "2026-05-01", endDate: "2026-05-31" },
        summary: {
          incomeTotal: 0,
          expenseTotal: 0,
          balance: 0,
          patrimonioTotal: 0,
          dividasAPagar: 0,
          valoresAReceber: 0,
          gastosFixos: 0,
          servicosAtivosTotal: 0,
          cartoesFaturaAtualTotal: 0,
          cartoesLimiteComprometidoTotal: 0,
        },
        sections: {
          rendas: [],
          patrimonios: [],
          dividas: [],
          pessoas: [],
          cartoes: [],
          comprasCartao: [],
          servicos: [],
        },
        generatedAt: new Date().toISOString(),
      };
    },
  };

  const app = express();
  app.use((req: any, _res, next) => {
    const authMode = req.get("x-test-auth");
    req.isAuthenticated = () => authMode === "ok";
    req.user = authMode === "ok" ? { id: "user_a", subscriptionTier: "premium" } : undefined;
    next();
  });
  const controller = createReportsController(service as any);
  app.get("/api/reports/overview", requireAuth, controller.overview);

  return { app, serviceCalls };
}

test("rota /api/reports/overview em serverless exige requireAuth", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const routeDeclarationPattern = /app\.get\(\s*"\/api\/reports\/overview"\s*,\s*requireAuth\s*,\s*reportsController\.overview\s*\)/m;
  assert.ok(
    routeDeclarationPattern.test(routesSource),
    "A rota /api/reports/overview deve ser protegida por requireAuth.",
  );
});

test("/api/reports/overview bloqueia sem auth e usa userId da sessão quando autenticado", async () => {
  const { app, serviceCalls } = createReportsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const unauth = await fetch(`${baseUrl}/api/reports/overview`);
    assert.equal(unauth.status, 401);

    const auth = await fetch(`${baseUrl}/api/reports/overview`, {
      headers: { "x-test-auth": "ok" },
    });
    assert.equal(auth.status, 200);
    assert.equal(serviceCalls.length, 1);
    assert.equal(serviceCalls[0]?.userId, "user_a");
  });
});

test("/api/reports/overview retorna 400 para parâmetros inválidos e período muito grande", async () => {
  const { app } = createReportsRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const invalidDate = await fetch(`${baseUrl}/api/reports/overview?startDate=2026-99-01`, {
      headers: { "x-test-auth": "ok" },
    });
    assert.equal(invalidDate.status, 400);

    const hugePeriod = await fetch(`${baseUrl}/api/reports/overview?startDate=2024-01-01&endDate=2026-12-31`, {
      headers: { "x-test-auth": "ok" },
    });
    assert.equal(hugePeriod.status, 400);
  });
});
