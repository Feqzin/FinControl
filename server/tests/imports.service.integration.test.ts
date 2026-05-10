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

testImports("confirmacao cria servico novo vinculado a compra importada quando serviceAction=create_new", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_create_service_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Create Service",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Service Link",
    limite: "5000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-create-service",
      items: [
        {
          id: "srv-1",
          descricao: "Spotify Premium",
          valor: "21.90",
          valorParcela: "21.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-11",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "create_new",
            name: "Spotify",
            category: "streaming",
            monthlyValue: 21.9,
            billingDay: 11,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
      items: preview.items.map((item) => ({
        ...item,
        action: "import",
        serviceAction: {
          type: "create_new",
          name: "Spotify",
          category: "streaming",
          monthlyValue: 21.9,
          billingDay: 11,
        },
      })),
    });

    assert.equal(confirmed.createdCount, 1);
    assert.equal(confirmed.summary.servicesCreatedCount, 1);

    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const servicosRows = await db.select().from(servicos).where(and(
      eq(servicos.userId, user.id),
      eq(servicos.compraCartaoId, createdCompraId!),
    ));
    assert.equal(servicosRows.length, 1);
    assert.equal(servicosRows[0]?.nome, "Spotify");
    assert.equal(servicosRows[0]?.formaPagamento, "cartao");
    assert.equal(servicosRows[0]?.categoria, "streaming");
    assert.equal(servicosRows[0]?.status, "ativo");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao bloqueia create_new em item ignorado", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_create_service_skip_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Create Service Skip",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Skip Service",
    limite: "5000.00",
    melhorDiaCompra: 6,
    diaVencimento: 21,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-service-skip",
      items: [
        {
          id: "srv-skip-1",
          descricao: "Netflix",
          valor: "39.90",
          valorParcela: "39.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-12",
          vencimentoFatura: null,
          tipo: "compra",
          action: "skip",
          serviceAction: {
            type: "create_new",
            name: "Netflix",
            category: "streaming",
            monthlyValue: 39.9,
            billingDay: 12,
          },
        },
      ],
    });

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("criar serviço"), true);
        return true;
      },
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao bloqueia create_new quando ja existe servico parecido", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_create_service_dup_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Create Service Dup",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Dup Service",
    limite: "5000.00",
    melhorDiaCompra: 7,
    diaVencimento: 22,
    iconeId: null,
  }).returning();

  try {
    await db.insert(servicos).values({
      userId: user.id,
      nome: "Spotify Premium",
      categoria: "streaming",
      valorMensal: "21.90",
      dataCobranca: 10,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    });

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-service-dup",
      items: [
        {
          id: "srv-dup-1",
          descricao: "Spotify",
          valor: "21.90",
          valorParcela: "21.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-20",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "create_new",
            name: "Spotify",
            category: "streaming",
            monthlyValue: 21.9,
            billingDay: 20,
          },
        },
      ],
    });

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("serviço parecido"), true);
        return true;
      },
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao vincula servico existente do mesmo usuario quando serviceAction=link_existing", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_link_service_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Link Service",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Link Service",
    limite: "5000.00",
    melhorDiaCompra: 8,
    diaVencimento: 23,
    iconeId: null,
  }).returning();

  try {
    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Spotify Premium",
      categoria: "streaming",
      valorMensal: "21.90",
      dataCobranca: 12,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-link-service",
      items: [
        {
          id: "srv-link-1",
          descricao: "Spotify",
          valor: "21.90",
          valorParcela: "21.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-18",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    assert.equal(confirmed.createdCount, 1);
    assert.equal(confirmed.summary.servicesCreatedCount, 0);
    assert.equal(confirmed.summary.servicesLinkedCount, 1);

    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const [servicoAtualizado] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.ok(servicoAtualizado);
    assert.equal(servicoAtualizado?.compraCartaoId, createdCompraId);
    assert.equal(servicoAtualizado?.nome, "Spotify Premium");
    assert.equal(servicoAtualizado?.valorMensal, "21.90");
    assert.equal(servicoAtualizado?.categoria, "streaming");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao bloqueia link_existing para servico de outro usuario", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const ownerUsername = `it_imports_link_owner_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const attackerUsername = `it_imports_link_attacker_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [owner] = await db.insert(users).values({
    username: ownerUsername,
    password: "hash_fake",
    nomeCompleto: "Owner",
  }).returning();

  const [attacker] = await db.insert(users).values({
    username: attackerUsername,
    password: "hash_fake",
    nomeCompleto: "Attacker",
  }).returning();

  const [cartaoAttacker] = await db.insert(cartoes).values({
    userId: attacker.id,
    nome: "Cartao Attacker",
    limite: "5000.00",
    melhorDiaCompra: 9,
    diaVencimento: 24,
    iconeId: null,
  }).returning();

  try {
    const [servicoOwner] = await db.insert(servicos).values({
      userId: owner.id,
      nome: "Netflix",
      categoria: "streaming",
      valorMensal: "44.90",
      dataCobranca: 10,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(attacker.id, {
      cartaoId: cartaoAttacker.id,
      sourceType: "manual",
      sourceName: "teste-link-other-user",
      items: [
        {
          id: "srv-link-other-1",
          descricao: "Netflix",
          valor: "44.90",
          valorParcela: "44.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-19",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servicoOwner.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    await assert.rejects(
      service.confirm(attacker.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("Serviço não encontrado"), true);
        return true;
      },
    );
  } finally {
    await db.delete(users).where(eq(users.id, attacker.id));
    await db.delete(users).where(eq(users.id, owner.id));
  }
});

testImports("confirmacao bloqueia link_existing quando servico ja possui vinculo e replaceExistingLink=false", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_link_replace_block_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Link Replace Block",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Replace Block",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 25,
    iconeId: null,
  }).returning();

  try {
    const [compraAnterior] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra antiga vinculada",
      valorTotal: "99.90",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "99.90",
      dataCompra: "2026-03-10",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "iCloud Apple",
      categoria: "software",
      valorMensal: "9.90",
      dataCobranca: 10,
      formaPagamento: "cartao",
      compraCartaoId: compraAnterior.id,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-link-replace-block",
      items: [
        {
          id: "srv-link-replace-block-1",
          descricao: "iCloud",
          valor: "9.90",
          valorParcela: "9.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-20",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("já está vinculado"), true);
        return true;
      },
    );

    const [servicoSemMudanca] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.ok(servicoSemMudanca);
    assert.equal(servicoSemMudanca?.compraCartaoId, compraAnterior.id);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao permite link_existing com replaceExistingLink=true sem alterar dados do servico", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_link_replace_ok_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Link Replace Ok",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Replace OK",
    limite: "5000.00",
    melhorDiaCompra: 11,
    diaVencimento: 26,
    iconeId: null,
  }).returning();

  try {
    const [compraAnterior] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra antiga link",
      valorTotal: "10.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "10.00",
      dataCompra: "2026-03-11",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Nu Seguro Vida",
      categoria: "utilidades",
      valorMensal: "7.27",
      dataCobranca: 20,
      formaPagamento: "cartao",
      compraCartaoId: compraAnterior.id,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-link-replace-ok",
      items: [
        {
          id: "srv-link-replace-ok-1",
          descricao: "Nu Seguro Vida",
          valor: "7.27",
          valorParcela: "7.27",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-21",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: true,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    assert.equal(confirmed.createdCount, 1);
    assert.equal(confirmed.summary.servicesCreatedCount, 0);
    assert.equal(confirmed.summary.servicesLinkedCount, 1);

    const novoCompraId = confirmed.createdCompraIds[0];
    assert.ok(novoCompraId);

    const [servicoAtualizado] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.ok(servicoAtualizado);
    assert.equal(servicoAtualizado?.compraCartaoId, novoCompraId);
    assert.equal(servicoAtualizado?.nome, "Nu Seguro Vida");
    assert.equal(servicoAtualizado?.categoria, "utilidades");
    assert.equal(servicoAtualizado?.valorMensal, "7.27");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao bloqueia link_existing em item ignorado", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_link_skip_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Link Skip",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Link Skip",
    limite: "5000.00",
    melhorDiaCompra: 12,
    diaVencimento: 27,
    iconeId: null,
  }).returning();

  try {
    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Disney+",
      categoria: "streaming",
      valorMensal: "33.90",
      dataCobranca: 12,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-link-skip",
      items: [
        {
          id: "srv-link-skip-1",
          descricao: "Disney+",
          valor: "33.90",
          valorParcela: "33.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-22",
          vencimentoFatura: null,
          tipo: "compra",
          action: "skip",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("vincular serviço"), true);
        return true;
      },
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao bloqueia link_existing em item invalido", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_link_invalid_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Link Invalid",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Link Invalid",
    limite: "5000.00",
    melhorDiaCompra: 13,
    diaVencimento: 28,
    iconeId: null,
  }).returning();

  try {
    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Max",
      categoria: "streaming",
      valorMensal: "19.90",
      dataCobranca: 13,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-link-invalid",
      items: [
        {
          id: "srv-link-invalid-1",
          descricao: "Max",
          valor: "0.00",
          valorParcela: "0.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-23",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("erro de validacao"), true);
        return true;
      },
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("confirmacao bloqueia link_existing em duplicata_exata sem forceImport", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao, servicos } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_link_exact_dup_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Link Exact Duplicate",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Link Exact Duplicate",
    limite: "5000.00",
    melhorDiaCompra: 14,
    diaVencimento: 29,
    iconeId: null,
  }).returning();

  try {
    await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "OpenAI ChatGPT",
      valorTotal: "20.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "20.00",
      dataCompra: "2026-04-24",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    });

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "ChatGPT Plus",
      categoria: "software",
      valorMensal: "20.00",
      dataCobranca: 24,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-link-exact-dup",
      items: [
        {
          id: "srv-link-exact-dup-1",
          descricao: "OpenAI ChatGPT",
          valor: "20.00",
          valorParcela: "20.00",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-24",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    const [item] = preview.items;
    assert.ok(item);
    assert.equal(item.status, "duplicata_exata");
    assert.equal(item.forceImport, false);

    await assert.rejects(
      service.confirm(user.id, {
        importLogId: preview.importLogId,
        userConfirmed: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("Duplicatas exatas exigem"), true);
        return true;
      },
    );

    const [servicoSemVinculo] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.ok(servicoSemVinculo);
    assert.equal(servicoSemVinculo?.compraCartaoId, null);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("importacao de servico compartilhado nao cria servico_pagamentos nem baixa pendencias automaticamente", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const {
    users,
    cartoes,
    pessoas,
    servicos,
    servicoPessoas,
    servicoPagamentos,
    pessoaSaldoMovimentacoes,
  } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_shared_service_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Shared Service",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Shared Service",
    limite: "5000.00",
    melhorDiaCompra: 15,
    diaVencimento: 5,
    iconeId: null,
  }).returning();

  try {
    const [pessoa] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Pessoa Compartilhada",
      tipo: "me_deve",
      telefone: null,
      observacao: null,
    }).returning();

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Spotify Family",
      categoria: "streaming",
      valorMensal: "39.90",
      dataCobranca: 20,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const [vinculoServicoPessoa] = await db.insert(servicoPessoas).values({
      userId: user.id,
      servicoId: servico.id,
      pessoaId: pessoa.id,
      valorDevido: "19.95",
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-shared-service-no-auto-payment",
      items: [
        {
          id: "srv-shared-link-1",
          descricao: "Spotify Family",
          valor: "39.90",
          valorParcela: "39.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-25",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    assert.equal(confirmed.createdCount, 1);
    assert.equal(confirmed.summary.servicesLinkedCount, 1);
    assert.equal(confirmed.summary.servicesCreatedCount, 0);

    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const [servicoAtualizado] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.ok(servicoAtualizado);
    assert.equal(servicoAtualizado?.compraCartaoId, createdCompraId);

    // Regra de negócio: cobrança na fatura não significa que a pessoa compartilhou o pagamento.
    // Portanto, não deve existir baixa automática em servico_pagamentos.
    const pagamentosDoServico = await db.select().from(servicoPagamentos).where(eq(servicoPagamentos.userId, user.id));
    assert.equal(pagamentosDoServico.length, 0);

    // E também não deve existir abatimento automático de saldo da pessoa.
    const abatimentosSaldo = await db.select().from(pessoaSaldoMovimentacoes).where(and(
      eq(pessoaSaldoMovimentacoes.userId, user.id),
      eq(pessoaSaldoMovimentacoes.servicoPessoaId, vinculoServicoPessoa.id),
    ));
    assert.equal(abatimentosSaldo.length, 0);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("marcar mes pago de servico compartilhado continua sendo acao manual apos importacao", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { ServicosService } = await import("../services/servicos.service");
  const { storage } = await import("../storage");
  const {
    users,
    cartoes,
    pessoas,
    servicos,
    servicoPessoas,
    servicoPagamentos,
  } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const importService = new ImportsService();
  const servicosService = new ServicosService(storage);
  const username = `it_imports_shared_service_manual_pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Shared Service Manual Pay",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Shared Manual",
    limite: "5000.00",
    melhorDiaCompra: 16,
    diaVencimento: 6,
    iconeId: null,
  }).returning();

  try {
    const [pessoa] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Pessoa Compartilhada 2",
      tipo: "me_deve",
      telefone: null,
      observacao: null,
    }).returning();

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Netflix",
      categoria: "streaming",
      valorMensal: "44.90",
      dataCobranca: 21,
      formaPagamento: "cartao",
      compraCartaoId: null,
      status: "ativo",
      iconeId: null,
    }).returning();

    const [vinculoServicoPessoa] = await db.insert(servicoPessoas).values({
      userId: user.id,
      servicoId: servico.id,
      pessoaId: pessoa.id,
      valorDevido: "22.45",
    }).returning();

    const preview = await importService.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-shared-service-manual-payment",
      items: [
        {
          id: "srv-shared-manual-1",
          descricao: "Netflix",
          valor: "44.90",
          valorParcela: "44.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-04-26",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: false,
          },
        },
      ],
    });

    await importService.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    const pagamentosAntes = await db.select().from(servicoPagamentos).where(eq(servicoPagamentos.userId, user.id));
    assert.equal(pagamentosAntes.length, 0);

    const manualResult = await servicosService.createServicoPagamento(user.id, {
      servicoPessoaId: vinculoServicoPessoa.id,
      mes: "2026-04",
      status: "pago",
      dataPagamento: "2026-04-26",
    });
    assert.ok("created" in manualResult);

    const pagamentosDepois = await db.select().from(servicoPagamentos).where(and(
      eq(servicoPagamentos.userId, user.id),
      eq(servicoPagamentos.servicoPessoaId, vinculoServicoPessoa.id),
      eq(servicoPagamentos.mes, "2026-04"),
    ));
    assert.equal(pagamentosDepois.length, 1);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("rollback remove servico criado pela importacao quando for seguro", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, servicos, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_rb_service_remove_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Service Remove",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao RB Remove",
    limite: "5000.00",
    melhorDiaCompra: 18,
    diaVencimento: 8,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-rb-remove-service",
      items: [
        {
          id: "rb-create-1",
          descricao: "Spotify Premium",
          valor: "21.90",
          valorParcela: "21.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-05-02",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "create_new",
            name: "Spotify Premium",
            category: "streaming",
            monthlyValue: 21.9,
            billingDay: 2,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });

    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const [servicoCriado] = await db.select().from(servicos).where(and(
      eq(servicos.userId, user.id),
      eq(servicos.compraCartaoId, createdCompraId),
    ));
    assert.ok(servicoCriado);

    const rollback = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 1);
    assert.equal(rollback.servicesRemovedCount, 1);
    assert.equal(rollback.servicesUnlinkedCount, 0);
    assert.equal(rollback.servicesRestoredCount, 0);
    assert.equal(rollback.serviceRollbackWarnings.length, 0);

    const servicoAposRollback = await db.select().from(servicos).where(eq(servicos.userId, user.id));
    assert.equal(servicoAposRollback.length, 0);

    const comprasAposRollback = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(comprasAposRollback.length, 0);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("rollback nao remove servico criado pela importacao quando houver compartilhamento/pagamento, apenas desvincula", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const {
    users,
    cartoes,
    pessoas,
    servicos,
    servicoPessoas,
    servicoPagamentos,
  } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_rb_service_unlink_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Service Unlink",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao RB Unlink",
    limite: "5000.00",
    melhorDiaCompra: 19,
    diaVencimento: 9,
    iconeId: null,
  }).returning();

  try {
    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-rb-unlink-service",
      items: [
        {
          id: "rb-create-2",
          descricao: "Netflix",
          valor: "44.90",
          valorParcela: "44.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-05-03",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "create_new",
            name: "Netflix",
            category: "streaming",
            monthlyValue: 44.9,
            billingDay: 3,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });
    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const [servicoCriado] = await db.select().from(servicos).where(and(
      eq(servicos.userId, user.id),
      eq(servicos.compraCartaoId, createdCompraId),
    ));
    assert.ok(servicoCriado);

    const [pessoa] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Pessoa Compartilhada RB",
      tipo: "me_deve",
      telefone: null,
      observacao: null,
    }).returning();

    const [vinculo] = await db.insert(servicoPessoas).values({
      userId: user.id,
      servicoId: servicoCriado!.id,
      pessoaId: pessoa.id,
      valorDevido: "22.45",
    }).returning();

    await db.insert(servicoPagamentos).values({
      userId: user.id,
      servicoPessoaId: vinculo.id,
      mes: "2026-05",
      status: "pago",
      dataPagamento: "2026-05-03",
    });

    const rollback = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 1);
    assert.equal(rollback.servicesRemovedCount, 0);
    assert.equal(rollback.servicesUnlinkedCount, 1);
    assert.equal(rollback.servicesRestoredCount, 0);
    assert.equal(rollback.serviceRollbackWarnings.length > 0, true);

    const [servicoAposRollback] = await db.select().from(servicos).where(and(
      eq(servicos.id, servicoCriado!.id),
      eq(servicos.userId, user.id),
    ));
    assert.ok(servicoAposRollback);
    assert.equal(servicoAposRollback?.compraCartaoId, null);

    const pagamentos = await db.select().from(servicoPagamentos).where(eq(servicoPagamentos.userId, user.id));
    assert.equal(pagamentos.length, 1);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("rollback restaura previousCompraCartaoId em link_existing quando seguro", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao, servicos } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_rb_link_restore_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Link Restore",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao RB Link Restore",
    limite: "5000.00",
    melhorDiaCompra: 20,
    diaVencimento: 10,
    iconeId: null,
  }).returning();

  try {
    const [compraAnterior] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra anterior do servico",
      valorTotal: "10.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "10.00",
      dataCompra: "2026-04-10",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "iCloud",
      categoria: "software",
      valorMensal: "9.90",
      dataCobranca: 10,
      formaPagamento: "cartao",
      compraCartaoId: compraAnterior.id,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-rb-link-restore",
      items: [
        {
          id: "rb-link-restore-1",
          descricao: "iCloud",
          valor: "9.90",
          valorParcela: "9.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-05-04",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: true,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });
    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const [servicoAposConfirm] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.equal(servicoAposConfirm?.compraCartaoId, createdCompraId);

    const rollback = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 1);
    assert.equal(rollback.servicesRemovedCount, 0);
    assert.equal(rollback.servicesUnlinkedCount, 0);
    assert.equal(rollback.servicesRestoredCount, 1);
    assert.equal(rollback.serviceRollbackWarnings.length, 0);

    const [servicoAposRollback] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.equal(servicoAposRollback?.compraCartaoId, compraAnterior.id);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testImports("rollback nao sobrescreve vinculo de servico se foi alterado depois da importacao", async () => {
  const { db } = await import("../db");
  const { ImportsService } = await import("../services/imports.service");
  const { users, cartoes, comprasCartao, servicos } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ImportsService();
  const username = `it_imports_rb_link_changed_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Import Rollback Link Changed",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao RB Link Changed",
    limite: "5000.00",
    melhorDiaCompra: 21,
    diaVencimento: 11,
    iconeId: null,
  }).returning();

  try {
    const [compraAnterior] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra anterior serviço",
      valorTotal: "15.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "15.00",
      dataCompra: "2026-04-11",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    const [servico] = await db.insert(servicos).values({
      userId: user.id,
      nome: "Apple One",
      categoria: "software",
      valorMensal: "34.90",
      dataCobranca: 11,
      formaPagamento: "cartao",
      compraCartaoId: compraAnterior.id,
      status: "ativo",
      iconeId: null,
    }).returning();

    const preview = await service.preview(user.id, {
      cartaoId: cartao.id,
      sourceType: "manual",
      sourceName: "teste-rb-link-changed",
      items: [
        {
          id: "rb-link-changed-1",
          descricao: "Apple One",
          valor: "34.90",
          valorParcela: "34.90",
          parcelas: 1,
          parcelaAtual: 1,
          dataCompra: "2026-05-05",
          vencimentoFatura: null,
          tipo: "compra",
          action: "import",
          serviceAction: {
            type: "link_existing",
            serviceId: servico.id,
            replaceExistingLink: true,
          },
        },
      ],
    });

    const confirmed = await service.confirm(user.id, {
      importLogId: preview.importLogId,
      userConfirmed: true,
    });
    const createdCompraId = confirmed.createdCompraIds[0];
    assert.ok(createdCompraId);

    const [compraNovaManual] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra manual posterior",
      valorTotal: "50.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "50.00",
      dataCompra: "2026-05-06",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }).returning();

    await db.update(servicos).set({
      compraCartaoId: compraNovaManual.id,
    }).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));

    const rollback = await service.rollback(user.id, preview.importLogId);
    assert.equal(rollback.deletedCount, 1);
    assert.equal(rollback.servicesRemovedCount, 0);
    assert.equal(rollback.servicesRestoredCount, 0);
    assert.equal(rollback.serviceRollbackWarnings.length > 0, true);

    const [servicoAposRollback] = await db.select().from(servicos).where(and(
      eq(servicos.id, servico.id),
      eq(servicos.userId, user.id),
    ));
    assert.equal(servicoAposRollback?.compraCartaoId, compraNovaManual.id);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
