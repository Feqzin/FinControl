import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testComprasIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testComprasIntegration("create persiste compra parcelada de cartao sem alterar contrato atual", async () => {
  const { db } = await import("../db");
  const { ComprasCartaoService } = await import("../services/compras-cartao.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, comprasCartao, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ComprasCartaoService(financialRepository);
  const username = `it_compras_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Compras Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao IT",
    limite: "4000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  try {
    const result = await service.create(user.id, {
      cartaoId: cartao.id,
      descricao: "Compra parcelada IT",
      valorTotal: "100.00",
      parcelas: 2,
      parcelaAtual: 1,
      valorParcela: "50.00",
      dataCompra: "2026-04-20",
      pessoaId: null,
    });

    if ("error" in result) {
      assert.fail("Nao deveria retornar erro para cartao existente");
    }

    assert.equal(result.created.cartaoId, cartao.id);
    assert.equal(result.created.valorTotal, "100.00");
    assert.equal(result.created.parcelas, 2);
    assert.equal(result.created.valorParcela, "50.00");

    const rows = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.id, result.created.id),
    ));

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.descricao, "Compra parcelada IT");
    assert.equal(rows[0]?.parcelaAtual, 1);
    assert.equal(rows[0]?.parcelas, 2);

    const parcelasRows = await db.select().from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, result.created.id),
    ));

    assert.equal(parcelasRows.length, 2);
    assert.deepEqual(parcelasRows.map((row) => row.numero), [1, 2]);
    assert.deepEqual(parcelasRows.map((row) => row.valor), ["50.00", "50.00"]);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testComprasIntegration("create retorna erro quando cartao informado nao existe", async () => {
  const { db } = await import("../db");
  const { ComprasCartaoService } = await import("../services/compras-cartao.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new ComprasCartaoService(financialRepository);
  const username = `it_compras_nf_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Compras Integration NF",
  }).returning();

  try {
    const result = await service.create(user.id, {
      cartaoId: "cartao-inexistente",
      descricao: "Nao deve criar",
      valorTotal: "100.00",
      parcelas: 2,
      parcelaAtual: 1,
      valorParcela: "50.00",
      dataCompra: "2026-04-20",
      pessoaId: null,
    });

    assert.deepEqual(result, { error: "CARTAO_NOT_FOUND" });
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testComprasIntegration("update de compra com parcelas_compra recalcula agregado do pai", async () => {
  const { db } = await import("../db");
  const { ComprasCartaoService } = await import("../services/compras-cartao.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, comprasCartao, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ComprasCartaoService(financialRepository);
  const username = `it_compras_update_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Compras Update Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Update IT",
    limite: "4000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [compra] = await db.insert(comprasCartao).values({
    userId: user.id,
    cartaoId: cartao.id,
    descricao: "Compra update IT",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }).returning();

  await db.insert(parcelasCompra).values([
    {
      userId: user.id,
      compraCartaoId: compra.id,
      numero: 1,
      valor: "60.00",
      dataVencimento: "2026-04-20",
      statusCartao: "pago",
      dataPagamentoCartao: "2026-04-20",
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      userId: user.id,
      compraCartaoId: compra.id,
      numero: 2,
      valor: "40.00",
      dataVencimento: "2026-05-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ]);

  try {
    const result = await service.update(compra.id, user.id, {
      valorTotal: "999.99",
      valorParcela: "999.99",
      parcelaAtual: 1,
    });

    if ("error" in result) {
      assert.fail("Nao deveria retornar erro no update");
    }

    assert.equal(result.updated.valorTotal, "100.00");
    assert.equal(result.updated.valorParcela, "40.00");
    assert.equal(result.updated.parcelas, 2);
    assert.equal(result.updated.parcelaAtual, 2);

    const [persisted] = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.id, compra.id),
    ));
    assert.ok(persisted);
    assert.equal(persisted.valorTotal, "100.00");
    assert.equal(persisted.valorParcela, "40.00");
    assert.equal(persisted.parcelaAtual, 2);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
