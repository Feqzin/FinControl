import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth.js";
import { registerFinancialDomainRoutes } from "../../routes/financial-domain.routes.js";

async function withTestServer(
  app: ReturnType<typeof express>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Não foi possível obter a porta do servidor de teste.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createNoopController() {
  return async (_req: express.Request, res: express.Response) => {
    res.status(200).json({ ok: true });
  };
}

function createCartoesFaturaPagamentosRouteApp() {
  const invoicePaymentsCalls: Array<{ userId: string }> = [];
  const registerCalls: Array<{ userId: string; cartaoId: string; mes: string; body: unknown }> = [];

  const cartoesController = {
    list: createNoopController(),
    create: createNoopController(),
    update: createNoopController(),
    delete: createNoopController(),
    deleteFaturaByCartaoMonth: createNoopController(),
    deleteFaturasByMonth: createNoopController(),
    listInvoicePayments: async (req: express.Request & { user?: { id?: string } }, res: express.Response) => {
      invoicePaymentsCalls.push({ userId: String(req.user?.id ?? "") });
      return res.status(200).json([]);
    },
    registerInvoicePayment: async (
      req: express.Request<{ cartaoId: string; mes: string }> & { user?: { id?: string } },
      res: express.Response,
    ) => {
      registerCalls.push({
        userId: String(req.user?.id ?? ""),
        cartaoId: req.params.cartaoId,
        mes: req.params.mes,
        body: req.body,
      });
      return res.status(200).json({ ok: true });
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const authMode = req.get("x-test-auth");
    req.isAuthenticated = () => authMode === "ok";
    req.user = authMode === "ok" ? { id: "user_a" } : undefined;
    next();
  });

  registerFinancialDomainRoutes(app, {
    dividasController: {
      list: createNoopController(),
      listByPessoa: createNoopController(),
      create: createNoopController(),
      createParcelado: createNoopController(),
      update: createNoopController(),
      delete: createNoopController(),
      restore: createNoopController(),
      deletePermanent: createNoopController(),
      recalcular: createNoopController(),
    },
    parcelasController: {
      list: createNoopController(),
      listByDivida: createNoopController(),
      update: createNoopController(),
      antecipar: createNoopController(),
      delete: createNoopController(),
      listCompraByUser: createNoopController(),
      listCompra: createNoopController(),
      updateCompra: createNoopController(),
      updateCompraCompetencia: createNoopController(),
      replaceCompraBulk: createNoopController(),
    },
    cartoesController,
    comprasCartaoController: {
      list: createNoopController(),
      listByCartao: createNoopController(),
      listByPessoa: createNoopController(),
      create: createNoopController(),
      update: createNoopController(),
      delete: createNoopController(),
      deleteByCardRoute: createNoopController(),
    },
    financialController: {
      cardSummary: createNoopController(),
      overview: createNoopController(),
      summary: createNoopController(),
      score: createNoopController(),
      insights: createNoopController(),
    },
  });

  return { app, invoicePaymentsCalls, registerCalls };
}

test("rotas de pagamento de fatura em serverless exigem requireAuth", async () => {
  const routesPath = path.resolve(process.cwd(), "serverless", "routes", "financial-domain.routes.ts");
  const routesSource = await readFile(routesPath, "utf8");

  const getPattern = /app\.get\(\s*"\/api\/cartoes\/fatura-pagamentos"\s*,\s*requireAuth\s*,\s*cartoesController\.listInvoicePayments\s*\)/m;
  const postPattern = /app\.post\(\s*"\/api\/cartoes\/:cartaoId\/faturas\/:mes\/pagamentos"\s*,\s*requireAuth\s*,\s*cartoesController\.registerInvoicePayment\s*\)/m;

  assert.ok(getPattern.test(routesSource), "A rota GET /api/cartoes/fatura-pagamentos deve exigir requireAuth.");
  assert.ok(postPattern.test(routesSource), "A rota POST /api/cartoes/:cartaoId/faturas/:mes/pagamentos deve exigir requireAuth.");
});

test("rotas de pagamento de fatura em serverless bloqueiam sem auth e usam userId autenticado", async () => {
  const { app, invoicePaymentsCalls, registerCalls } = createCartoesFaturaPagamentosRouteApp();

  await withTestServer(app, async (baseUrl) => {
    const unauthGet = await fetch(`${baseUrl}/api/cartoes/fatura-pagamentos`);
    assert.equal(unauthGet.status, 401);

    const authGet = await fetch(`${baseUrl}/api/cartoes/fatura-pagamentos`, {
      headers: { "x-test-auth": "ok" },
    });
    assert.equal(authGet.status, 200);
    assert.equal(invoicePaymentsCalls.length, 1);
    assert.equal(invoicePaymentsCalls[0]?.userId, "user_a");

    const unauthPost = await fetch(`${baseUrl}/api/cartoes/cartao_1/faturas/2026-06/pagamentos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ valorPago: "100.00", dataPagamento: "2026-06-17" }),
    });
    assert.equal(unauthPost.status, 401);

    const authPost = await fetch(`${baseUrl}/api/cartoes/cartao_1/faturas/2026-06/pagamentos`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-auth": "ok",
      },
      body: JSON.stringify({ valorPago: "100.00", dataPagamento: "2026-06-17" }),
    });
    assert.equal(authPost.status, 200);
    assert.equal(registerCalls.length, 1);
    assert.equal(registerCalls[0]?.userId, "user_a");
    assert.equal(registerCalls[0]?.cartaoId, "cartao_1");
    assert.equal(registerCalls[0]?.mes, "2026-06");
  });
});
