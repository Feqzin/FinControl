import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createImportsController } from "../../controllers/imports.controller";
import { ImportPipelineError } from "../../services/imports.service";

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

type ReconcileCall = {
  userId: string;
  payload: Record<string, unknown>;
};

function createImportsReconcileRouteApp(options?: {
  throwError?: ImportPipelineError;
}) {
  const calls: ReconcileCall[] = [];
  const service = {
    async reconcilePurchase(userId: string, payload: Record<string, unknown>) {
      calls.push({ userId, payload });
      if (options?.throwError) {
        throw options.throwError;
      }
      return {
        existingCompraCartaoId: String(payload.existingCompraCartaoId ?? ""),
        updatedCompraCartaoId: String(payload.existingCompraCartaoId ?? ""),
        updated: true,
        valueChanged: true,
        parcelasChanged: true,
        descriptionChanged: true,
        blockedByProtection: false,
        protectedParcelasCount: 0,
      };
    },
    preview: async () => { throw new Error("not implemented"); },
    confirm: async () => { throw new Error("not implemented"); },
    rollback: async () => { throw new Error("not implemented"); },
    list: async () => [],
  };

  const controller = createImportsController(service as any);
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a" || authUser === "user_b";
    req.user = authUser ? { id: authUser, subscriptionTier: "premium" } : undefined;
    next();
  });
  app.post("/api/imports/reconcile-purchase", requireAuth, controller.reconcile);

  return { app, calls };
}

function buildValidPayload() {
  return {
    existingCompraCartaoId: "compra_a_1",
    importItem: {
      id: "item-1",
      descricao: "MLP KaBuM KaBuM",
      valor: 1575.8,
      valorParcela: 157.58,
      parcelas: 10,
      parcelaAtual: 5,
      dataCompra: "2025-12-24",
      tipo: "compra",
      action: "skip",
      status: "possivel_duplicata",
    },
    confirmValueChange: true,
    updateDescription: true,
  };
}

test("rota /api/imports/reconcile-purchase em serverless exige importRateLimit + requireAuth + requirePremiumFeature", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const pattern = /app\.post\(\s*"\/api\/imports\/reconcile-purchase"\s*,\s*importRateLimit\s*,\s*requireAuth\s*,\s*requirePremiumFeature\("smartImport"\)\s*,\s*importsController\.reconcile\s*\)/m;
  assert.ok(pattern.test(routesSource));
});

test("imports reconcile: exige auth", async () => {
  const { app } = createImportsReconcileRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/imports/reconcile-purchase`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildValidPayload()),
    });
    assert.equal(response.status, 401);
  });
});

test("imports reconcile: usa userId da sessão e não payload externo", async () => {
  const { app, calls } = createImportsReconcileRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/imports/reconcile-purchase`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...buildValidPayload(),
        userId: "user_b",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.userId, "user_a");
  });
});

test("imports reconcile: payload inválido retorna 400 sem 500", async () => {
  const { app } = createImportsReconcileRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/imports/reconcile-purchase`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        existingCompraCartaoId: "",
        importItem: {
          descricao: "",
        },
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(typeof body.message, "string");
  });
});

test("imports reconcile: erro de domínio controlado retorna status do ImportPipelineError", async () => {
  const { app } = createImportsReconcileRouteApp({
    throwError: new ImportPipelineError(409, "Compra protegida para reconciliação"),
  });

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/imports/reconcile-purchase`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify(buildValidPayload()),
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.message, "Compra protegida para reconciliação");
  });
});
