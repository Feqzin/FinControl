import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";

type RateLimitModule = {
  importRateLimit: import("express").RequestHandler;
  uploadRateLimit: import("express").RequestHandler;
  backupRateLimit: import("express").RequestHandler;
  billingRateLimit: import("express").RequestHandler;
  webhookRateLimit: import("express").RequestHandler;
};

function setOrUnsetEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function importRateLimitModuleFresh(): Promise<RateLimitModule> {
  const absolutePath = path.resolve(process.cwd(), "serverless", "middleware", "rate-limit.ts");
  const specifier = `${pathToFileURL(absolutePath).href}?cacheBust=${Date.now()}_${Math.random()}`;
  return import(specifier) as Promise<RateLimitModule>;
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

async function hitRouteUntilLimited(baseUrl: string, route: string): Promise<void> {
  const first = await fetch(`${baseUrl}${route}`, { method: "POST" });
  assert.equal(first.status, 200);

  const second = await fetch(`${baseUrl}${route}`, { method: "POST" });
  assert.equal(second.status, 200);

  const third = await fetch(`${baseUrl}${route}`, { method: "POST" });
  assert.equal(third.status, 429);
  const body = await third.json();
  assert.deepEqual(body, { error: "Too many requests" });

  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes("stack"), false);
  assert.equal(serialized.includes("sql"), false);
  assert.equal(serialized.includes("trace"), false);
}

test("rate limit protege grupos import/upload/backup/billing/webhook com erro 429 generico", async () => {
  const envSnapshot = {
    RATE_LIMIT_IMPORT_MAX: process.env.RATE_LIMIT_IMPORT_MAX,
    RATE_LIMIT_UPLOAD_MAX: process.env.RATE_LIMIT_UPLOAD_MAX,
    RATE_LIMIT_BACKUP_MAX: process.env.RATE_LIMIT_BACKUP_MAX,
    RATE_LIMIT_BILLING_MAX: process.env.RATE_LIMIT_BILLING_MAX,
    RATE_LIMIT_WEBHOOK_MAX: process.env.RATE_LIMIT_WEBHOOK_MAX,
  };

  process.env.RATE_LIMIT_IMPORT_MAX = "2";
  process.env.RATE_LIMIT_UPLOAD_MAX = "2";
  process.env.RATE_LIMIT_BACKUP_MAX = "2";
  process.env.RATE_LIMIT_BILLING_MAX = "2";
  process.env.RATE_LIMIT_WEBHOOK_MAX = "2";

  try {
    const {
      importRateLimit,
      uploadRateLimit,
      backupRateLimit,
      billingRateLimit,
      webhookRateLimit,
    } = await importRateLimitModuleFresh();

    const app = express();
    app.use(express.json());

    app.post("/import", importRateLimit, (_req, res) => res.status(200).json({ ok: true }));
    app.post("/upload", uploadRateLimit, (_req, res) => res.status(200).json({ ok: true }));
    app.post("/backup", backupRateLimit, (_req, res) => res.status(200).json({ ok: true }));
    app.post("/billing", billingRateLimit, (_req, res) => res.status(200).json({ ok: true }));
    app.post("/webhook", webhookRateLimit, (_req, res) => res.status(200).json({ ok: true }));

    await withTestServer(app, async (baseUrl) => {
      await hitRouteUntilLimited(baseUrl, "/import");
      await hitRouteUntilLimited(baseUrl, "/upload");
      await hitRouteUntilLimited(baseUrl, "/backup");
      await hitRouteUntilLimited(baseUrl, "/billing");
      await hitRouteUntilLimited(baseUrl, "/webhook");
    });
  } finally {
    setOrUnsetEnv("RATE_LIMIT_IMPORT_MAX", envSnapshot.RATE_LIMIT_IMPORT_MAX);
    setOrUnsetEnv("RATE_LIMIT_UPLOAD_MAX", envSnapshot.RATE_LIMIT_UPLOAD_MAX);
    setOrUnsetEnv("RATE_LIMIT_BACKUP_MAX", envSnapshot.RATE_LIMIT_BACKUP_MAX);
    setOrUnsetEnv("RATE_LIMIT_BILLING_MAX", envSnapshot.RATE_LIMIT_BILLING_MAX);
    setOrUnsetEnv("RATE_LIMIT_WEBHOOK_MAX", envSnapshot.RATE_LIMIT_WEBHOOK_MAX);
  }
});
