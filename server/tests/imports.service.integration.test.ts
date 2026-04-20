import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testImports = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testImports("pipeline de importacao: preview, confirmacao e rollback", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao, importLogs, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Test",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Integracao",
    limite: "5000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-integracao",
      items: [
        {
          id: "ok-1",
          descricao: "Compra valida",
          valor: "120.00",
          valorParcela: "60.00",
          parcelas: 2,
          parcelaAtual: 1,
          dataCompra: "2026-04-01",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
        {
          id: "dup-1",
          descricao: "Possivel duplicata",
          valor: "40.00",
          valorParcela: "40.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-01",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          duplicateId: "compra-existente",
        },
        {
          id: "bad-1",
          descricao: "Item invalido",
          valor: "0.00",
          valorParcela: "0.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-01",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    assert.ok(preview.importLogId);
    assert.equal(preview.summary.totalItems, 3);
    assert.equal(preview.summary.importItems, 2);
    assert.equal(preview.summary.skipItems, 1);
    assert.ok(preview.summary.averageConfidence > 0);

    const duplicate = preview.items.find((item) => item.id === "dup-1");
    assert.ok(duplicate);
    assert.equal(duplicate.duplicateId, "compra-existente");
    assert.equal(duplicate.reviewRequired, true);
    assert.ok(duplicate.confidenceScore < 100);

    const invalid = preview.items.find((item) => item.id === "bad-1");
    assert.ok(invalid);
    assert.equal(invalid.action, "skip");
    assert.equal(invalid.canImport, false);

    const confirmed = await service.confirm(user.id, { importLogId: preview.importLogId });
    assert.equal(confirmed.createdCount, 2);
    assert.equal(confirmed.skippedCount, 1);
    assert.equal(confirmed.createdCompraIds.length, 2);

    const createdRows = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(createdRows.length, 2);

    const parcelasRows = await db.select().from(parcelasCompra).where(eq(parcelasCompra.userId, user.id));
    assert.equal(parcelasRows.length, 3);
    const countsByCompra = createdRows
      .map((row) => parcelasRows.filter((parcela) => parcela.compraCartaoId === row.id).length)
      .sort((a, b) => a - b);
    assert.deepEqual(countsByCompra, [1, 2]);

    const confirmAgain = await service.confirm(user.id, { importLogId: preview.importLogId });
    assert.equal(confirmAgain.alreadyConfirmed, true);
    assert.equal(confirmAgain.createdCount, 2);

    const rollback = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 2);
    assert.equal(rollback.deletedCompraIds.length, 2);

    const rowsAfterRollback = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(rowsAfterRollback.length, 0);

    const parcelasAfterRollback = await db.select().from(parcelasCompra).where(eq(parcelasCompra.userId, user.id));
    assert.equal(parcelasAfterRollback.length, 0);

    const [logAfterRollback] = await db.select().from(importLogs).where(eq(importLogs.id, preview.importLogId));
    assert.ok(logAfterRollback);
    assert.equal(logAfterRollback.status, "rolled_back");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao ignora item invalido sem criar compras inconsistentes", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_block_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Block Test",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Integracao 2",
    limite: "5000.00",
    melhorDiaCompra: 7,
    diaVencimento: 22,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-block",
      items: [
        {
          id: "ok-1",
          descricao: "Compra valida",
          valor: "10.00",
          valorParcela: "10.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-01",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      items: [
        {
          id: "forced-invalid",
          descricao: "forcado",
          valor: "0",
          valorParcela: "0",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-01",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    assert.equal(confirmed.createdCount, 0);
    assert.equal(confirmed.skippedCount, 1);
    const compras = await db.select().from(comprasCartao).where(eq(comprasCartao.userId, user.id));
    assert.equal(compras.length, 0);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao faz rollback se falhar apos criar compras e antes de persistir parcelas", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao, parcelasCompra, importLogs } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService({
    buildParcelasCompraRows: () => {
      throw new Error("FORCED_IMPORT_MATERIALIZATION_FAILURE");
    },
  });
  const username = `it_imports_tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Tx Rollback Test",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Tx Rollback",
    limite: "5000.00",
    melhorDiaCompra: 8,
    diaVencimento: 18,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-tx-rollback",
      items: [
        {
          id: "tx-1",
          descricao: "Compra que vai falhar no meio",
          valor: "120.00",
          valorParcela: "60.00",
          parcelas: 2,
          parcelaAtual: 1,
          dataCompra: "2026-04-10",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    await assert.rejects(async () => service.confirm(user.id, { importLogId: preview.importLogId }));

    const comprasRows = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(comprasRows.length, 0);

    const parcelasRows = await db.select().from(parcelasCompra).where(eq(parcelasCompra.userId, user.id));
    assert.equal(parcelasRows.length, 0);

    const [log] = await db.select().from(importLogs).where(eq(importLogs.id, preview.importLogId));
    assert.ok(log);
    assert.equal(log.status, "previewed");
    assert.equal(log.confirmedAt, null);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
