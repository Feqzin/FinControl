import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createIconMatchRulesController } from "../../controllers/icon-match-rules.controller";

type InMemoryRule = {
  id: string;
  userId: string;
  iconId: string;
  normalizedTerm: string;
  originalTerm: string;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createInMemoryServiceFixture() {
  const rules: InMemoryRule[] = [];
  let seq = 1;

  const service = {
    async list(userId: string) {
      return rules.filter((rule) => rule.userId === userId);
    },
    async createOrUpdate(userId: string, payload: { iconId: string; terms: string[] }) {
      const created: InMemoryRule[] = [];
      for (const term of payload.terms) {
        const normalizedTerm = normalizeTerm(term);
        const existing = rules.find((rule) => rule.userId === userId && rule.normalizedTerm === normalizedTerm);
        if (existing) {
          existing.iconId = payload.iconId;
          existing.originalTerm = term;
          existing.updatedAt = new Date();
          created.push(existing);
          continue;
        }
        const row: InMemoryRule = {
          id: `rule_${seq++}`,
          userId,
          iconId: payload.iconId,
          normalizedTerm,
          originalTerm: term,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rules.push(row);
        created.push(row);
      }
      return created;
    },
    async remove(userId: string, id: string) {
      const index = rules.findIndex((rule) => rule.id === id && rule.userId === userId);
      if (index < 0) return false;
      rules.splice(index, 1);
      return true;
    },
  };

  return { service, rules };
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

function createIconMatchRulesRouteApp() {
  const fixture = createInMemoryServiceFixture();
  const controller = createIconMatchRulesController(fixture.service as any);
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a" || authUser === "user_b";
    req.user = authUser ? { id: authUser, subscriptionTier: "premium" } : undefined;
    next();
  });
  app.get("/api/icon-match-rules", requireAuth, controller.list);
  app.post("/api/icon-match-rules", requireAuth, controller.create);
  app.delete("/api/icon-match-rules/:id", requireAuth, controller.remove);
  return { app, fixture };
}

test("rota /api/icon-match-rules em serverless exige requireAuth em GET/POST/DELETE", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const getPattern = /app\.get\(\s*"\/api\/icon-match-rules"\s*,\s*requireAuth\s*,\s*iconMatchRulesController\.list\s*\)/m;
  const postPattern = /app\.post\(\s*"\/api\/icon-match-rules"\s*,\s*requireAuth\s*,\s*iconMatchRulesController\.create\s*\)/m;
  const deletePattern = /app\.delete\(\s*"\/api\/icon-match-rules\/:id"\s*,\s*requireAuth\s*,\s*iconMatchRulesController\.remove\s*\)/m;

  assert.ok(getPattern.test(routesSource));
  assert.ok(postPattern.test(routesSource));
  assert.ok(deletePattern.test(routesSource));
});

test("icon match rules: criar exige auth", async () => {
  const { app } = createIconMatchRulesRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/icon-match-rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iconId: "netflix",
        terms: ["netflix.com"],
      }),
    });
    assert.equal(response.status, 401);
  });
});

test("icon match rules: ownership por userId em listar/criar/excluir", async () => {
  const { app, fixture } = createIconMatchRulesRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const createA = await fetch(`${baseUrl}/api/icon-match-rules`, {
      method: "POST",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        iconId: "netflix",
        terms: ["Netflix.comsaopaulobr"],
      }),
    });
    assert.equal(createA.status, 201);
    const createABody = await createA.json();
    assert.equal(createABody.rules.length, 1);
    assert.equal(createABody.rules[0].userId, "user_a");
    const ruleId = createABody.rules[0].id as string;

    const listA = await fetch(`${baseUrl}/api/icon-match-rules`, {
      headers: { "x-test-auth": "user_a" },
    });
    const listABody = await listA.json();
    assert.equal(listA.status, 200);
    assert.equal(listABody.length, 1);

    const listB = await fetch(`${baseUrl}/api/icon-match-rules`, {
      headers: { "x-test-auth": "user_b" },
    });
    const listBBody = await listB.json();
    assert.equal(listB.status, 200);
    assert.equal(listBBody.length, 0);

    const deleteByOther = await fetch(`${baseUrl}/api/icon-match-rules/${ruleId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(deleteByOther.status, 404);
    assert.equal(fixture.rules.length, 1);

    const deleteOwn = await fetch(`${baseUrl}/api/icon-match-rules/${ruleId}`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(deleteOwn.status, 200);
    assert.equal(fixture.rules.length, 0);
  });
});
