import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createParcelasController } from "../../controllers/parcelas.controller";

type CompetenciaCall = {
  parcelaCompraId: string;
  userId: string;
  competencia: string;
};

function createParcelasCompetenciaRouteApp() {
  const calls: CompetenciaCall[] = [];
  const service = {
    updateParcelaCompraCompetencia: async (parcelaCompraId: string, userId: string, data: { competencia: string }) => {
      calls.push({ parcelaCompraId, userId, competencia: data.competencia });
      if (parcelaCompraId === "missing") return undefined;
      return {
        id: parcelaCompraId,
        userId,
        compraCartaoId: "compra-1",
        numero: 1,
        valor: "100.00",
        dataVencimento: `${data.competencia}-20`,
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      };
    },
  };

  const controller = createParcelasController(service as any);
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a";
    req.user = authUser ? { id: authUser } : undefined;
    next();
  });
  app.patch("/api/parcelas-compra/:id/competencia", requireAuth, controller.updateCompraCompetencia);
  return { app, calls };
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

test("rota /api/parcelas-compra/:id/competencia em serverless exige requireAuth", async () => {
  const routePath = path.resolve(process.cwd(), "serverless", "routes", "financial-domain.routes.ts");
  const routeSource = await readFile(routePath, "utf8");
  const pattern = /app\.patch\(\s*"\/api\/parcelas-compra\/:id\/competencia"\s*,\s*requireAuth\s*,\s*parcelasController\.updateCompraCompetencia\s*\)/m;
  assert.ok(pattern.test(routeSource));
});

test("parcela competencia: exige auth", async () => {
  const { app } = createParcelasCompetenciaRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/parcelas-compra/parcela-1/competencia`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ competencia: "2026-03" }),
    });
    assert.equal(response.status, 401);
  });
});

test("parcela competencia: payload invalido retorna 400 sem 500", async () => {
  const { app } = createParcelasCompetenciaRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/parcelas-compra/parcela-1/competencia`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ competencia: "2026-13" }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(typeof body.message, "string");
  });
});

test("parcela competencia: usa userId da sessao e ignora userId externo", async () => {
  const { app, calls } = createParcelasCompetenciaRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/parcelas-compra/parcela-1/competencia?userId=user_b`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ competencia: "2026-03" }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.userId, "user_a");
    assert.equal(calls[0]?.parcelaCompraId, "parcela-1");
    assert.equal(calls[0]?.competencia, "2026-03");
  });
});

test("parcela competencia: retorna 404 quando parcela nao existe", async () => {
  const { app } = createParcelasCompetenciaRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/parcelas-compra/missing/competencia`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ competencia: "2026-03" }),
    });
    assert.equal(response.status, 404);
  });
});
