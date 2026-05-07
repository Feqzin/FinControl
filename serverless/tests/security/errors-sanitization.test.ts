import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { sendDebugUnavailable } from "../../routes/debug-route-guard";
import { createBillingController } from "../../controllers/billing.controller";

const SENSITIVE_TERMS = [
  "stack",
  "sql",
  "database_url",
  "postgres",
  "table",
  "column",
  "schema",
  "secret",
];

function assertNoSensitiveTerms(payload: unknown): void {
  const text = JSON.stringify(payload).toLowerCase();
  for (const term of SENSITIVE_TERMS) {
    assert.equal(text.includes(term), false, `Resposta nao deve vazar termo sensivel: ${term}`);
  }
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

test("sendDebugUnavailable retorna payload generico e sanitizado", async () => {
  const app = express();
  app.get("/api/debug/unavailable", (_req, res) => {
    sendDebugUnavailable(res);
  });

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/debug/unavailable`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { error: "Endpoint unavailable" });
    assertNoSensitiveTerms(body);
  });
});

test("webhook invalido responde erro generico sem detalhes internos", async () => {
  const controller = createBillingController({
    validateMercadoPagoWebhookRequest: () => ({
      isValid: false as const,
      providerEventId: "evt_security",
      reason: "invalid_signature" as const,
      statusCode: 401 as const,
      responseError: "Unauthorized" as const,
    }),
    processMercadoPagoWebhook: async () => ({
      outcome: "processed" as const,
      reason: "should_not_execute",
      providerEventId: "evt_security",
    }),
  } as any);

  const app = express();
  app.use(express.json());
  app.post("/api/billing/mercadopago/webhook", controller.processMercadoPagoWebhook);

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/billing/mercadopago/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt_security" }),
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.deepEqual(body, { error: "Unauthorized" });
    assertNoSensitiveTerms(body);
  });
});
