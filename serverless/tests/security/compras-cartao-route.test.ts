import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth.js";
import { createComprasCartaoController } from "../../controllers/compras-cartao.controller.js";

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

function createComprasCartaoRouteApp(options?: {
  updateResult?: Record<string, unknown>;
}) {
  let capturedUserId: string | null = null;
  let capturedCompraId: string | null = null;
  let capturedPayload: Record<string, unknown> | null = null;

  const service = {
    async update(compraId: string, userId: string, payload: Record<string, unknown>) {
      capturedCompraId = compraId;
      capturedUserId = userId;
      capturedPayload = payload;

      if (options?.updateResult) {
        return options.updateResult;
      }

      return {
        updated: {
          id: compraId,
          userId,
          cartaoId: "cartao_a_1",
          descricao: typeof payload.descricao === "string" ? payload.descricao : "Compra teste",
          valorTotal: "120.00",
          parcelas: 2,
          parcelaAtual: 1,
          valorParcela: "60.00",
          dataCompra: "2026-06-20",
          pessoaId: null,
          statusPessoa: null,
          dataPagamentoPessoa: null,
          iconeId: payload.iconeId ?? null,
        },
      };
    },
  };

  const controller = createComprasCartaoController(service as any);
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use((req: any, _res, next) => {
    const authUser = req.get("x-test-auth");
    req.isAuthenticated = () => authUser === "user_a";
    req.user = authUser ? { id: authUser, subscriptionTier: "premium" } : undefined;
    next();
  });
  app.patch("/api/compras-cartao/:id", requireAuth, controller.update);

  return {
    app,
    getCaptured() {
      return { capturedUserId, capturedCompraId, capturedPayload };
    },
  };
}

test("rota /api/compras-cartao/:id em serverless exige requireAuth no PATCH", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes", "financial-domain.routes.ts");
  const routesSource = await readFile(routesPath, "utf8");
  const patchPattern = /app\.patch\(\s*"\/api\/compras-cartao\/:id"\s*,\s*requireAuth\s*,\s*comprasCartaoController\.update\s*\)/m;
  assert.ok(patchPattern.test(routesSource));
});

test("compras-cartao PATCH: aceita iconeId e usa userId autenticado da sessão", async () => {
  const { app, getCaptured } = createComprasCartaoRouteApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/compras-cartao/compra_a_1`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        descricao: "Teclado musical",
        iconeId: "mercadolivre",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, "compra_a_1");
    assert.equal(body.iconeId, "mercadolivre");

    const captured = getCaptured();
    assert.equal(captured.capturedUserId, "user_a");
    assert.equal(captured.capturedCompraId, "compra_a_1");
    assert.deepEqual(captured.capturedPayload, {
      descricao: "Teclado musical",
      iconeId: "mercadolivre",
    });
  });
});

test("compras-cartao PATCH: falha de persistência de ícone retorna 500 controlado", async () => {
  const { app } = createComprasCartaoRouteApp({
    updateResult: {
      error: "ICONE_UPDATE_ERROR",
      reason: "ICON_COLUMN_MISSING",
      message: "Não foi possível salvar o ícone manual porque a coluna compras_cartao.icone_id não está disponível.",
    },
  });

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/compras-cartao/compra_a_1`, {
      method: "PATCH",
      headers: {
        "x-test-auth": "user_a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        descricao: "Teclado musical",
        iconeId: "mercadolivre",
      }),
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.errorCode, "ICON_COLUMN_MISSING");
    assert.equal(
      body.message,
      "Não foi possível salvar o ícone manual porque a coluna compras_cartao.icone_id não está disponível.",
    );
  });
});
