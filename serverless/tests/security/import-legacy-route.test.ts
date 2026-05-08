import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { importRateLimit } from "../../middleware/rate-limit";
import { requireAuth } from "../../auth";
import { requirePremiumFeature } from "../../subscription-access";

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

function createLegacyImportRouteApp() {
  const app = express();
  app.use((req: any, _res, next) => {
    const authMode = req.get("x-test-auth");
    req.isAuthenticated = () => authMode === "free" || authMode === "premium";
    req.user = authMode === "premium"
      ? { id: 123, subscriptionTier: "premium" }
      : authMode === "free"
        ? { id: 123, subscriptionTier: "free" }
        : undefined;
    next();
  });

  app.post(
    "/api/importar-texto",
    importRateLimit,
    requireAuth,
    requirePremiumFeature("smartImport"),
    (_req, res) => {
      res.status(410).json({
        message: "Endpoint legado descontinuado. Use /api/imports/preview e /api/imports/confirm.",
      });
    },
  );

  return app;
}

test("rota legada /api/importar-texto em serverless exige auth + premium + rate-limit", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const routeDeclarationPattern = /app\.post\(\s*"\/api\/importar-texto"\s*,\s*importRateLimit\s*,\s*requireAuth\s*,\s*requirePremiumFeature\("smartImport"\)/m;
  assert.ok(
    routeDeclarationPattern.test(routesSource),
    "A rota legada deve ser protegida por importRateLimit + requireAuth + requirePremiumFeature(smartImport).",
  );
});

test("/api/importar-texto bloqueia sem auth, bloqueia free e permite premium (410 deprecated)", async () => {
  const app = createLegacyImportRouteApp();

  await withTestServer(app, async (baseUrl) => {
    const unauthResponse = await fetch(`${baseUrl}/api/importar-texto`, { method: "POST" });
    assert.equal(unauthResponse.status, 401);

    const freeResponse = await fetch(`${baseUrl}/api/importar-texto`, {
      method: "POST",
      headers: { "x-test-auth": "free" },
    });
    assert.equal(freeResponse.status, 403);
    const freeBody = await freeResponse.json();
    assert.equal(freeBody.feature, "smartImport");

    const premiumResponse = await fetch(`${baseUrl}/api/importar-texto`, {
      method: "POST",
      headers: { "x-test-auth": "premium" },
    });
    assert.equal(premiumResponse.status, 410);
    const premiumBody = await premiumResponse.json();
    assert.equal(
      premiumBody.message,
      "Endpoint legado descontinuado. Use /api/imports/preview e /api/imports/confirm.",
    );
  });
});
