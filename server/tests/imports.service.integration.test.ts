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
    assert.equal(duplicate.status, "possivel_duplicata");
    assert.equal(duplicate.duplicateId, "compra-existente");
    assert.equal(duplicate.reviewRequired, true);
    assert.ok(duplicate.confidenceScore < 100);

    const novo = preview.items.find((item) => item.id === "ok-1");
    assert.ok(novo);
    assert.equal(novo.status, "novo");
    assert.equal(novo.canImport, true);

    const invalid = preview.items.find((item) => item.id === "bad-1");
    assert.ok(invalid);
    assert.equal(invalid.status, "invalido");
    assert.equal(invalid.action, "skip");
    assert.equal(invalid.canImport, false);

    const confirmed = await service.confirm(user.id, { importLogId: preview.importLogId, userConfirmed: true });
    assert.equal(confirmed.createdCount, 2);
    assert.equal(confirmed.skippedCount, 1);
    assert.equal(confirmed.createdCompraIds.length, 2);
    assert.equal(confirmed.summary.totalProcessed, 3);
    assert.equal(confirmed.summary.createdCount, 2);
    assert.equal(confirmed.summary.ignoredCount, 1);
    assert.equal(confirmed.summary.blockedExactDuplicates, 0);
    assert.equal(confirmed.summary.forcedExactDuplicates, 0);
    assert.equal(confirmed.summary.invalidCount, 1);
    assert.equal(confirmed.summary.errorCount, 0);

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

    const confirmAgain = await service.confirm(user.id, { importLogId: preview.importLogId, userConfirmed: true });
    assert.equal(confirmAgain.alreadyConfirmed, true);
    assert.equal(confirmAgain.createdCount, 2);
    assert.equal(confirmAgain.summary.totalProcessed, 3);
    assert.equal(confirmAgain.summary.invalidCount, 1);

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

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
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
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("erro de validacao"), true);
        return true;
      },
    );

    const compras = await db.select().from(comprasCartao).where(eq(comprasCartao.userId, user.id));
    assert.equal(compras.length, 0);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("duplicata exata exige forceImport explicito para confirmar", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_exact_dup_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Exact Duplicate",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Exact Duplicate",
    limite: "5000.00",
    melhorDiaCompra: 9,
    diaVencimento: 15,
    iconeId: null,
  }).returning();

  try {
    const [existingCompra] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Supermercado Central",
      valorTotal: "90.00",
      valorParcela: "90.00",
      parcelas: 1,
      parcelaAtual: 1,
      dataCompra: "2026-04-11",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-duplicata-exata",
      items: [
        {
          id: "dup-exact-1",
          descricao: "Supermercado Central",
          valor: "90.00",
          valorParcela: "90.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-11",
          vencimentoFatura: null,
          tipo: "compra",
          action: "skip",
          duplicateId: existingCompra.id,
        },
      ],
    });

    const exactItem = preview.items[0];
    assert.equal(exactItem.status, "duplicata_exata");

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
        items: [
          {
            ...exactItem,
            action: "import",
            forceImport: false,
          },
        ],
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("Duplicatas exatas"), true);
        return true;
      },
    );

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
      items: [
        {
          ...exactItem,
          action: "import",
          forceImport: true,
        },
      ],
    });

    assert.equal(confirmed.createdCount, 1);
    assert.equal(confirmed.summary.totalProcessed, 1);
    assert.equal(confirmed.summary.createdCount, 1);
    assert.equal(confirmed.summary.ignoredCount, 0);
    assert.equal(confirmed.summary.blockedExactDuplicates, 0);
    assert.equal(confirmed.summary.forcedExactDuplicates, 1);
    assert.equal(confirmed.summary.invalidCount, 0);
    assert.equal(confirmed.summary.errorCount, 0);
    const compras = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(compras.length, 2);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao contabiliza duplicata exata bloqueada quando item fica ignorado", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_exact_dup_skip_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Exact Duplicate Skip",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Exact Duplicate Skip",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const [existingCompra] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Posto Central",
      valorTotal: "50.00",
      valorParcela: "50.00",
      parcelas: 1,
      parcelaAtual: 1,
      dataCompra: "2026-04-15",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-duplicata-exata-skip",
      items: [
        {
          id: "dup-exact-skip-1",
          descricao: "Posto Central",
          valor: "50.00",
          valorParcela: "50.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-15",
          vencimentoFatura: null,
          tipo: "compra",
          action: "skip",
          duplicateId: existingCompra.id,
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    assert.equal(confirmed.createdCount, 0);
    assert.equal(confirmed.summary.totalProcessed, 1);
    assert.equal(confirmed.summary.ignoredCount, 1);
    assert.equal(confirmed.summary.blockedExactDuplicates, 1);
    assert.equal(confirmed.summary.forcedExactDuplicates, 0);
    assert.equal(confirmed.summary.invalidCount, 0);

    const compras = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(compras.length, 1);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("preview detecta duplicata exata automaticamente sem duplicateId", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_auto_exact_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Auto Exact",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Auto Exact",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Loja Exata",
      valorTotal: "120.00",
      valorParcela: "40.00",
      parcelas: 3,
      parcelaAtual: 1,
      dataCompra: "2026-04-05",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    });

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-auto-exata",
      items: [
        {
          id: "auto-exata-1",
          descricao: "Loja Exata",
          valor: "120.00",
          valorParcela: "40.00",
          parcelas: 3,
          parcelaAtual: 1,
          dataCompra: "2026-04-05",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    assert.equal(preview.items.length, 1);
    assert.equal(preview.items[0]?.status, "duplicata_exata");
    assert.ok(preview.items[0]?.duplicateId);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("preview detecta possivel duplicata automaticamente em caso semelhante", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_auto_possible_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Auto Possible",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Auto Possible",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Mercado Bairro",
      valorTotal: "100.00",
      valorParcela: "100.00",
      parcelas: 1,
      parcelaAtual: 1,
      dataCompra: "2026-04-05",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    });

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-auto-possivel",
      items: [
        {
          id: "auto-possivel-1",
          descricao: "Mercado do Bairro",
          valor: "100.00",
          valorParcela: "100.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-06",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    assert.equal(preview.items.length, 1);
    assert.equal(preview.items[0]?.status, "possivel_duplicata");
    assert.equal(preview.items[0]?.reviewRequired, true);
    assert.ok(preview.items[0]?.duplicateId);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("listagem de logs retorna apenas importacoes do usuario autenticado", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const usernameA = `it_imports_logs_a_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const usernameB = `it_imports_logs_b_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [userA] = await db.insert(users).values({
    username: usernameA,
    password: "hash_fake",
    nomeCompleto: "Import Logs A",
  }).returning();
  const [userB] = await db.insert(users).values({
    username: usernameB,
    password: "hash_fake",
    nomeCompleto: "Import Logs B",
  }).returning();

  const [cartaoA] = await db.insert(cartoes).values({
    userId: userA.id,
    nome: "Cartao Logs A",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();
  const [cartaoB] = await db.insert(cartoes).values({
    userId: userB.id,
    nome: "Cartao Logs B",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const previewA = await service.preview(userA.id, {
      cartaoId: cartaoA.id,
      sourceType: "manual",
      sourceName: "teste-logs-a",
      items: [
        {
          id: "log-a-1",
          descricao: "Compra A",
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
    const previewB = await service.preview(userB.id, {
      cartaoId: cartaoB.id,
      sourceType: "manual",
      sourceName: "teste-logs-b",
      items: [
        {
          id: "log-b-1",
          descricao: "Compra B",
          valor: "20.00",
          valorParcela: "20.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-01",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    const logsA = await service.list(userA.id, 50);
    assert.ok(logsA.some((row) => row.id === previewA.importLogId));
    assert.equal(logsA.some((row) => row.id === previewB.importLogId), false);
  } finally {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
  }
});

testImports("rollback bloqueia lote de outro usuario e preserva compras do dono", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const usernameA = `it_imports_rb_owner_a_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const usernameB = `it_imports_rb_owner_b_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [userA] = await db.insert(users).values({
    username: usernameA,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Owner A",
  }).returning();
  const [userB] = await db.insert(users).values({
    username: usernameB,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Owner B",
  }).returning();

  const [cartaoA] = await db.insert(cartoes).values({
    userId: userA.id,
    nome: "Cartao Owner A",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();
  const [cartaoB] = await db.insert(cartoes).values({
    userId: userB.id,
    nome: "Cartao Owner B",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const previewB = await service.preview(userB.id, {
      cartaoId: cartaoB.id,
      sourceType: "manual",
      sourceName: "teste-owner-b",
      items: [
        {
          id: "owner-b-1",
          descricao: "Compra do B",
          valor: "30.00",
          valorParcela: "30.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-12",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    await service.confirm(userB.id, {
      importLogId: previewB.importLogId,
      userConfirmed: true,
    });

    await assert.rejects(
      service.rollback(userA.id, previewB.importLogId),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("not found"), true);
        return true;
      },
    );

    const comprasB = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, userB.id),
      eq(comprasCartao.cartaoId, cartaoB.id),
    ));
    assert.equal(comprasB.length, 1);

    const comprasA = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, userA.id),
      eq(comprasCartao.cartaoId, cartaoA.id),
    ));
    assert.equal(comprasA.length, 0);
  } finally {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
  }
});

testImports("rollback nao remove compras manuais fora do lote importado e bloqueia rollback duplicado", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_rb_manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Manual",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Manual + Import",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const [manualCompra] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra manual preservada",
      valorTotal: "70.00",
      valorParcela: "70.00",
      parcelas: 1,
      parcelaAtual: 1,
      dataCompra: "2026-04-05",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-rollback-manual",
      items: [
        {
          id: "imp-1",
          descricao: "Compra importada",
          valor: "15.00",
          valorParcela: "15.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-15",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
        },
      ],
    });

    await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    const rollback = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 1);

    const rollbackAgain = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollbackAgain.alreadyRolledBack, true);
    assert.equal(rollbackAgain.deletedCount, 0);

    const compras = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(compras.length, 1);
    assert.equal(compras[0]?.id, manualCompra.id);
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

    await assert.rejects(async () => service.confirm(user.id, { importLogId: preview.importLogId, userConfirmed: true }));

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
