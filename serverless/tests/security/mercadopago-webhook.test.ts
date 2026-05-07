import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { ENV } from "../../env";
import { BillingService } from "../../services/billing.service";
import { createBillingController } from "../../controllers/billing.controller";

function setOrUnsetEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function withProductionNodeEnv(): () => void {
  const previousNodeEnv = (ENV as { nodeEnv: string }).nodeEnv;
  (ENV as { nodeEnv: string }).nodeEnv = "production";
  return () => {
    (ENV as { nodeEnv: string }).nodeEnv = previousNodeEnv;
  };
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

test("webhook em producao sem MERCADO_PAGO_WEBHOOK_SECRET retorna Forbidden e nao valida", () => {
  const restoreNodeEnv = withProductionNodeEnv();
  const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  try {
    const service = new BillingService({} as any);
    const result = service.validateMercadoPagoWebhookRequest({
      query: { topic: "subscription_preapproval", id: "evt_1" },
      payload: { data: { id: "sub_1" } },
      xRequestId: "req_1",
      xSignature: null,
    });

    assert.equal(result.isValid, false);
    if (result.isValid) {
      assert.fail("Nao deveria validar webhook sem secret em producao.");
    }

    assert.equal(result.statusCode, 403);
    assert.equal(result.responseError, "Forbidden");
    assert.equal(result.reason, "missing_secret_in_production");
  } finally {
    restoreNodeEnv();
    setOrUnsetEnv("MERCADO_PAGO_WEBHOOK_SECRET", previousSecret);
  }
});

test("webhook com secret configurado e assinatura ausente retorna Unauthorized", () => {
  const restoreNodeEnv = withProductionNodeEnv();
  const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = "segredo_teste_webhook_123456";

  try {
    const service = new BillingService({} as any);
    const result = service.validateMercadoPagoWebhookRequest({
      query: { topic: "subscription_preapproval", id: "evt_2" },
      payload: { data: { id: "sub_2" } },
      xRequestId: "req_2",
      xSignature: null,
    });

    assert.equal(result.isValid, false);
    if (result.isValid) {
      assert.fail("Nao deveria validar webhook sem assinatura.");
    }

    assert.equal(result.statusCode, 401);
    assert.equal(result.responseError, "Unauthorized");
    assert.equal(result.reason, "invalid_signature");
  } finally {
    restoreNodeEnv();
    setOrUnsetEnv("MERCADO_PAGO_WEBHOOK_SECRET", previousSecret);
  }
});

test("webhook com assinatura invalida retorna Unauthorized", () => {
  const restoreNodeEnv = withProductionNodeEnv();
  const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = "segredo_teste_webhook_123456";

  try {
    const service = new BillingService({} as any);
    const result = service.validateMercadoPagoWebhookRequest({
      query: { topic: "subscription_preapproval", id: "evt_3" },
      payload: { data: { id: "sub_3" } },
      xRequestId: "req_3",
      xSignature: "ts=1715300000,v1=assinatura_invalida",
    });

    assert.equal(result.isValid, false);
    if (result.isValid) {
      assert.fail("Nao deveria validar webhook com assinatura invalida.");
    }

    assert.equal(result.statusCode, 401);
    assert.equal(result.responseError, "Unauthorized");
    assert.equal(result.reason, "invalid_signature");
  } finally {
    restoreNodeEnv();
    setOrUnsetEnv("MERCADO_PAGO_WEBHOOK_SECRET", previousSecret);
  }
});

test("controller bloqueia webhook invalido e nao chama processamento", async () => {
  let processCalls = 0;

  const controller = createBillingController({
    validateMercadoPagoWebhookRequest: () => ({
      isValid: false as const,
      providerEventId: "evt_mock_1",
      reason: "missing_secret_in_production" as const,
      statusCode: 403 as const,
      responseError: "Forbidden" as const,
    }),
    processMercadoPagoWebhook: async () => {
      processCalls += 1;
      return {
        outcome: "processed" as const,
        reason: "should_not_run",
        providerEventId: "evt_mock_1",
      };
    },
  } as any);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.post("/api/billing/mercadopago/webhook", controller.processMercadoPagoWebhook);

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/billing/mercadopago/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt_mock_1" }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.deepEqual(body, { error: "Forbidden" });

    const serialized = JSON.stringify(body).toLowerCase();
    assert.equal(serialized.includes("stack"), false);
    assert.equal(serialized.includes("sql"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(processCalls, 0);
  });
});
