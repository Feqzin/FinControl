import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { createImportsController } from "../../controllers/imports.controller";
import { ImportPipelineError, ImportsService } from "../../services/imports.service";
import { shouldRunDbIntegrationTests } from "../../../server/tests/test-db-availability";
import { createSecurityTestUser } from "./test-user-seed";

const testReconcileIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

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

async function createReconcileFixture(label: string) {
  const [{ db }, schema] = await Promise.all([
    import("../../db"),
    import("../../../shared/schema"),
  ]);

  const user = await createSecurityTestUser(label);

  const [cartao] = await db.insert(schema.cartoes).values({
    userId: user.id,
    nome: `Cartao Reconciliacao ${label}`,
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [existingCompra] = await db.insert(schema.comprasCartao).values({
    userId: user.id,
    cartaoId: cartao.id,
    descricao: "PS Portal",
    valorTotal: "1575.00",
    parcelas: 10,
    parcelaAtual: 1,
    valorParcela: "157.50",
    dataCompra: "2025-12-24",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }).returning();

  const parcelasRows = Array.from({ length: 10 }, (_, idx) => ({
    userId: user.id,
    compraCartaoId: existingCompra.id,
    numero: idx + 1,
    valor: "157.50",
    dataVencimento: `2026-${String((idx % 12) + 1).padStart(2, "0")}-20`,
    statusCartao: "pendente" as const,
    dataPagamentoCartao: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }));
  await db.insert(schema.parcelasCompra).values(parcelasRows);

  return {
    db,
    schema,
    user,
    cartao,
    existingCompra,
    cleanup: async () => {
      await user.cleanup();
    },
  };
}

function buildReconcileImportItem(overrides?: Record<string, unknown>): any {
  return {
    id: "item-reconcile-1",
    descricao: "MLP KaBuM KaBuM",
    valor: 1575.8,
    valorParcela: 157.58,
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
    tipo: "compra",
    action: "skip",
    status: "possivel_duplicata",
    ...overrides,
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

testReconcileIntegration("reconcile preserva nome manual por padrão e não cria compra nova", async () => {
  const fixture = await createReconcileFixture("reconcile_keep_name_default");
  const service = new ImportsService();

  try {
    const preview = await service.preview(fixture.user.id, {
      cartaoId: fixture.cartao.id,
      sourceType: "manual",
      sourceName: "teste-reconcile",
      items: [buildReconcileImportItem()],
    });

    const reconcileResult = await service.reconcilePurchase(fixture.user.id, {
      importLogId: preview.importLogId,
      itemId: "item-reconcile-1",
      existingCompraCartaoId: fixture.existingCompra.id,
      importItem: buildReconcileImportItem(),
      confirmValueChange: true,
      updateNameFromImport: false,
    });

    assert.equal(reconcileResult.updated, true);
    assert.equal(reconcileResult.descriptionChanged, false);

    const [compraAfterReconcile] = await fixture.db.select({
      id: fixture.schema.comprasCartao.id,
      descricao: fixture.schema.comprasCartao.descricao,
      valorParcela: fixture.schema.comprasCartao.valorParcela,
      valorTotal: fixture.schema.comprasCartao.valorTotal,
      parcelas: fixture.schema.comprasCartao.parcelas,
      parcelaAtual: fixture.schema.comprasCartao.parcelaAtual,
    }).from(fixture.schema.comprasCartao).where(eq(
      fixture.schema.comprasCartao.id,
      fixture.existingCompra.id,
    ));

    assert.equal(compraAfterReconcile?.descricao, "PS Portal");
    assert.equal(compraAfterReconcile?.valorParcela, "157.58");
    assert.equal(compraAfterReconcile?.parcelaAtual, 5);

    const confirm = await service.confirm(fixture.user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
      items: [buildReconcileImportItem()],
    });
    assert.equal(confirm.createdCount, 0);
    assert.equal(confirm.createdCompraIds.length, 0);
    assert.equal(confirm.summary.reconciledExistingCount, 1);
  } finally {
    await fixture.cleanup();
  }
});

testReconcileIntegration("rollback restaura nome anterior após reconcile com updateNameFromImport=true", async () => {
  const fixture = await createReconcileFixture("reconcile_rollback_restore_name");
  const service = new ImportsService();

  try {
    const preview = await service.preview(fixture.user.id, {
      cartaoId: fixture.cartao.id,
      sourceType: "manual",
      sourceName: "teste-reconcile-rollback",
      items: [buildReconcileImportItem()],
    });

    await service.reconcilePurchase(fixture.user.id, {
      importLogId: preview.importLogId,
      itemId: "item-reconcile-1",
      existingCompraCartaoId: fixture.existingCompra.id,
      importItem: buildReconcileImportItem(),
      confirmValueChange: true,
      updateNameFromImport: true,
    });

    const confirm = await service.confirm(fixture.user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
      items: [buildReconcileImportItem()],
    });
    assert.equal(confirm.createdCount, 0);

    const rollback = await service.rollback(fixture.user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 0);
    assert.equal(rollback.serviceRollbackWarnings.length, 0);

    const [{ descricao, valorParcela, valorTotal, parcelaAtual }] = await fixture.db.select({
      descricao: fixture.schema.comprasCartao.descricao,
      valorParcela: fixture.schema.comprasCartao.valorParcela,
      valorTotal: fixture.schema.comprasCartao.valorTotal,
      parcelaAtual: fixture.schema.comprasCartao.parcelaAtual,
    }).from(fixture.schema.comprasCartao).where(eq(
      fixture.schema.comprasCartao.id,
      fixture.existingCompra.id,
    ));

    assert.equal(descricao, "PS Portal");
    assert.equal(valorParcela, "157.50");
    assert.equal(valorTotal, "1575.00");
    assert.equal(parcelaAtual, 1);
  } finally {
    await fixture.cleanup();
  }
});
