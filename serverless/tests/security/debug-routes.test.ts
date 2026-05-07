import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { ENV } from "../../env";
import { registerDebugDbPingRoute } from "../../routes/debug-db-ping.route";
import { guardDebugRouteAccess } from "../../routes/debug-route-guard";

const SENSITIVE_SNIPPETS = [
  "stack",
  "select",
  "from users",
  "database_url",
  "pooler",
  "postgres",
  "schema",
  "table",
  "column",
  "host",
];

function assertNoSensitiveDetails(payload: unknown): void {
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const snippet of SENSITIVE_SNIPPETS) {
    assert.equal(
      serialized.includes(snippet),
      false,
      `Resposta nao deve conter detalhe sensivel: ${snippet}`,
    );
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

function setOrUnsetEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function forceProductionDebugEnv(input: {
  debugEnabled?: string;
  debugToken?: string;
}): () => void {
  const previousNodeEnv = (ENV as { nodeEnv: string }).nodeEnv;
  const previousDebugEnabled = process.env.DEBUG_DB_CHECK_ENABLED;
  const previousDebugToken = process.env.DEBUG_DB_CHECK_TOKEN;

  (ENV as { nodeEnv: string }).nodeEnv = "production";
  setOrUnsetEnv("DEBUG_DB_CHECK_ENABLED", input.debugEnabled);
  setOrUnsetEnv("DEBUG_DB_CHECK_TOKEN", input.debugToken);

  return () => {
    (ENV as { nodeEnv: string }).nodeEnv = previousNodeEnv;
    setOrUnsetEnv("DEBUG_DB_CHECK_ENABLED", previousDebugEnabled);
    setOrUnsetEnv("DEBUG_DB_CHECK_TOKEN", previousDebugToken);
  };
}

test("debug db-ping fica bloqueado em producao quando DEBUG_DB_CHECK_ENABLED nao esta ativo", async () => {
  const restoreEnv = forceProductionDebugEnv({
    debugEnabled: undefined,
    debugToken: undefined,
  });

  try {
    const app = express();
    registerDebugDbPingRoute(app);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/debug/db-ping`);
      assert.equal(response.status, 404);

      const body = await response.json();
      assert.deepEqual(body, { error: "Not found" });
      assertNoSensitiveDetails(body);
    });
  } finally {
    restoreEnv();
  }
});

test("debug db-check retorna 404 em producao sem token", async () => {
  const restoreEnv = forceProductionDebugEnv({
    debugEnabled: "true",
    debugToken: "token-super-seguro-para-debug-123456",
  });

  try {
    const app = express();
    app.get("/api/debug/db-check", (req, res) => {
      const access = guardDebugRouteAccess(req, res, "db-check");
      if (!access.allowed) return;
      res.json({ ok: true });
    });

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/debug/db-check`);
      assert.equal(response.status, 404);

      const body = await response.json();
      assert.deepEqual(body, { error: "Not found" });
      assertNoSensitiveDetails(body);
    });
  } finally {
    restoreEnv();
  }
});

test("debug db-connectivity retorna 404 em producao sem token", async () => {
  const restoreEnv = forceProductionDebugEnv({
    debugEnabled: "true",
    debugToken: "token-super-seguro-para-debug-123456",
  });

  try {
    const app = express();
    app.get("/api/debug/db-connectivity", (req, res) => {
      const access = guardDebugRouteAccess(req, res, "db-connectivity");
      if (!access.allowed) return;
      res.json({ ok: true });
    });

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/debug/db-connectivity`);
      assert.equal(response.status, 404);

      const body = await response.json();
      assert.deepEqual(body, { error: "Not found" });
      assertNoSensitiveDetails(body);
    });
  } finally {
    restoreEnv();
  }
});

test("debug db-check e db-connectivity continuam 404 com token invalido em producao", async () => {
  const restoreEnv = forceProductionDebugEnv({
    debugEnabled: "true",
    debugToken: "token-super-seguro-para-debug-123456",
  });

  try {
    const app = express();
    app.get("/api/debug/db-check", (req, res) => {
      const access = guardDebugRouteAccess(req, res, "db-check");
      if (!access.allowed) return;
      res.json({ ok: true });
    });
    app.get("/api/debug/db-connectivity", (req, res) => {
      const access = guardDebugRouteAccess(req, res, "db-connectivity");
      if (!access.allowed) return;
      res.json({ ok: true });
    });

    await withTestServer(app, async (baseUrl) => {
      const invalidHeaders = { "x-debug-token": "token-invalido" };

      const dbCheckResponse = await fetch(`${baseUrl}/api/debug/db-check`, { headers: invalidHeaders });
      assert.equal(dbCheckResponse.status, 404);
      const dbCheckBody = await dbCheckResponse.json();
      assert.deepEqual(dbCheckBody, { error: "Not found" });
      assertNoSensitiveDetails(dbCheckBody);

      const dbConnectivityResponse = await fetch(`${baseUrl}/api/debug/db-connectivity`, { headers: invalidHeaders });
      assert.equal(dbConnectivityResponse.status, 404);
      const dbConnectivityBody = await dbConnectivityResponse.json();
      assert.deepEqual(dbConnectivityBody, { error: "Not found" });
      assertNoSensitiveDetails(dbConnectivityBody);
    });
  } finally {
    restoreEnv();
  }
});
