import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testParcelasCompraRoute = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testParcelasCompraRoute("GET /api/parcelas-compra/:compraId nao materializa parcelas ausentes", async () => {
  const expressModule = await import("express");
  const express = expressModule.default;
  const { db } = await import("../db");
  const { createParcelasController } = await import("../controllers/parcelas.controller");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, comprasCartao, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const username = `it_materialize_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Materialization Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Materializacao",
    limite: "8000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [compra] = await db.insert(comprasCartao).values({
    userId: user.id,
    cartaoId: cartao.id,
    descricao: "Compra sem parcelas materializadas",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-16",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }).returning();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: user.id };
    next();
  });

  const parcelasController = createParcelasController(new ParcelasService(financialRepository));
  app.get("/api/parcelas-compra/:compraId", parcelasController.listCompra);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const beforeRows = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compra.id),
    ));
    assert.equal(beforeRows.length, 0);

    const response = await fetch(`${baseUrl}/api/parcelas-compra/${compra.id}`);
    assert.equal(response.status, 200);

    const body = await response.json() as Array<{ numero: number; valor: string; statusCartao: string }>;
    assert.equal(body.length, 0);

    const afterRows = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compra.id),
    ));
    assert.equal(afterRows.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testParcelasCompraRoute("sincronizacao explicita cria parcelas ausentes e GET apenas le", async () => {
  const expressModule = await import("express");
  const express = expressModule.default;
  const { db } = await import("../db");
  const { createParcelasController } = await import("../controllers/parcelas.controller");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { syncParcelasCompraForCompraId } = await import("../services/parcelas-compra-materialization");
  const { users, cartoes, comprasCartao, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const username = `it_sync_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Sync Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Sync",
    limite: "8000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [compra] = await db.insert(comprasCartao).values({
    userId: user.id,
    cartaoId: cartao.id,
    descricao: "Compra para sync",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-16",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }).returning();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: user.id };
    next();
  });

  const parcelasController = createParcelasController(new ParcelasService(financialRepository));
  app.get("/api/parcelas-compra/:compraId", parcelasController.listCompra);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const firstSync = await syncParcelasCompraForCompraId(financialRepository, compra.id, user.id);
    if ("error" in firstSync) {
      assert.fail("A sincronizacao nao deveria falhar para compra existente");
    }

    assert.equal(firstSync.materialized, true);
    assert.equal(firstSync.createdCount, 2);

    const rowsAfterSync = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compra.id),
    ));
    assert.equal(rowsAfterSync.length, 2);

    const response = await fetch(`${baseUrl}/api/parcelas-compra/${compra.id}`);
    assert.equal(response.status, 200);
    const body = await response.json() as Array<{ numero: number; valor: string }>;
    assert.equal(body.length, 2);
    assert.deepEqual(body.map((row) => row.numero), [1, 2]);
    assert.deepEqual(body.map((row) => row.valor), ["50.00", "50.00"]);

    await db.update(parcelasCompra).set({
      valor: "70.00",
      statusCartao: "pago",
      dataPagamentoCartao: "2026-04-16",
    }).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compra.id),
      eq(parcelasCompra.numero, 1),
    ));

    await db.update(parcelasCompra).set({
      valor: "30.00",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
    }).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compra.id),
      eq(parcelasCompra.numero, 2),
    ));

    const secondSync = await syncParcelasCompraForCompraId(financialRepository, compra.id, user.id);
    if ("error" in secondSync) {
      assert.fail("A segunda sincronizacao nao deveria falhar para compra existente");
    }

    assert.equal(secondSync.materialized, false);
    assert.equal(secondSync.createdCount, 0);

    const rowsAfterSecondSync = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compra.id),
    ));
    assert.equal(rowsAfterSecondSync.length, 2);

    const [compraRecomputada] = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.id, compra.id),
    ));
    assert.ok(compraRecomputada);
    assert.equal(compraRecomputada.valorTotal, "100.00");
    assert.equal(compraRecomputada.valorParcela, "30.00");
    assert.equal(compraRecomputada.parcelaAtual, 2);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testParcelasCompraRoute("fluxo atual de criacao de compra materializa parcelas e GET permanece idempotente", async () => {
  const expressModule = await import("express");
  const express = expressModule.default;
  const { db } = await import("../db");
  const { createParcelasController } = await import("../controllers/parcelas.controller");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { ComprasCartaoService } = await import("../services/compras-cartao.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const username = `it_get_idempotente_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "GET Idempotente Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao GET Idempotente",
    limite: "9000.00",
    melhorDiaCompra: 7,
    diaVencimento: 18,
    iconeId: null,
  }).returning();

  const comprasService = new ComprasCartaoService(financialRepository);
  const createResult = await comprasService.create(user.id, {
    cartaoId: cartao.id,
    descricao: "Compra criada no fluxo atual",
    valorTotal: "120.00",
    parcelas: 3,
    parcelaAtual: 1,
    valorParcela: "40.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
  });

  if ("error" in createResult) {
    assert.fail("A criacao de compra no fluxo atual nao deveria falhar");
  }

  const compraId = createResult.created.id;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: user.id };
    next();
  });

  const parcelasController = createParcelasController(new ParcelasService(financialRepository));
  app.get("/api/parcelas-compra/:compraId", parcelasController.listCompra);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const beforeRows = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compraId),
    ));
    assert.equal(beforeRows.length, 3);

    const response = await fetch(`${baseUrl}/api/parcelas-compra/${compraId}`);
    assert.equal(response.status, 200);
    const body = await response.json() as Array<{ numero: number; valor: string; statusCartao: string }>;
    assert.equal(body.length, 3);
    assert.deepEqual(body.map((row) => row.numero), [1, 2, 3]);
    assert.deepEqual(body.map((row) => row.valor), ["40.00", "40.00", "40.00"]);

    const afterRows = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, compraId),
    ));
    assert.equal(afterRows.length, 3);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await db.delete(users).where(eq(users.id, user.id));
  }
});
