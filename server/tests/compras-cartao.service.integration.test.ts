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

testComprasIntegration("create calcula competencia da primeira parcela pelo ciclo do cartao", async () => {
  const { db } = await import("../db");
  const { ComprasCartaoService } = await import("../services/compras-cartao.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, parcelasCompra } = await import("@shared/schema");
  const { and, asc, eq } = await import("drizzle-orm");

  const service = new ComprasCartaoService(financialRepository);
  const username = `it_compras_competencia_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Compras Competencia Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Itau Ciclo",
    limite: "4000.00",
    melhorDiaCompra: 14,
    diaVencimento: 23,
    iconeId: null,
  }).returning();

  try {
    const result = await service.create(user.id, {
      cartaoId: cartao.id,
      descricao: "Compra ciclo abril",
      valorTotal: "422.79",
      parcelas: 2,
      parcelaAtual: 1,
      valorParcela: "211.40",
      dataCompra: "2026-04-17",
      pessoaId: null,
    });

    if ("error" in result) {
      assert.fail("Nao deveria retornar erro para compra manual com cartao valido");
    }

    const parcelasRows = await db.select({
      numero: parcelasCompra.numero,
      dataVencimento: parcelasCompra.dataVencimento,
      statusCartao: parcelasCompra.statusCartao,
    }).from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, user.id),
      eq(parcelasCompra.compraCartaoId, result.created.id),
    )).orderBy(asc(parcelasCompra.numero));

    assert.equal(parcelasRows.length, 2);
    assert.equal(parcelasRows[0]?.dataVencimento, "2026-05-23");
    assert.equal(parcelasRows[1]?.dataVencimento, "2026-06-23");
    assert.equal(parcelasRows[0]?.statusCartao, "pendente");
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

testComprasIntegration("create/update de compra com reembolso parcial preserva compatibilidade e validacoes", async () => {
  const { db } = await import("../db");
  const { ComprasCartaoService } = await import("../services/compras-cartao.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, cartoes, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ComprasCartaoService(financialRepository);
  const username = `it_compras_reembolso_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Compras Reembolso Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Elza",
    tipo: "pessoa_fisica",
    telefone: null,
    observacao: null,
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Reembolso IT",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 25,
    iconeId: null,
  }).returning();

  try {
    const createdResult = await service.create(user.id, {
      cartaoId: cartao.id,
      descricao: "Compra parcial",
      valorTotal: "422.79",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "422.79",
      dataCompra: "2026-05-11",
      pessoaId: pessoa.id,
      reembolsoModo: "metade",
    });

    if ("error" in createdResult) {
      assert.fail(`Nao deveria falhar no create com metade: ${createdResult.error}`);
    }

    assert.equal(createdResult.created.reembolsoModo, "metade");
    assert.equal(createdResult.created.reembolsoValorTotal, null);
    assert.equal(createdResult.created.reembolsoPercentual, null);
    assert.equal(createdResult.created.statusPessoa, "pendente");

    const updatedCustomValue = await service.update(createdResult.created.id, user.id, {
      reembolsoModo: "valor_custom",
      reembolsoValorTotal: 211.4,
      statusPessoa: "pendente",
    });
    if ("error" in updatedCustomValue) {
      assert.fail(`Nao deveria falhar no update valor_custom: ${updatedCustomValue.error}`);
    }
    assert.equal(updatedCustomValue.updated.reembolsoModo, "valor_custom");
    assert.equal(updatedCustomValue.updated.reembolsoValorTotal, "211.40");
    assert.equal(updatedCustomValue.updated.reembolsoPercentual, null);

    const updatedCustomPercent = await service.update(createdResult.created.id, user.id, {
      reembolsoModo: "percentual_custom",
      reembolsoPercentual: 50,
    });
    if ("error" in updatedCustomPercent) {
      assert.fail(`Nao deveria falhar no update percentual_custom: ${updatedCustomPercent.error}`);
    }
    assert.equal(updatedCustomPercent.updated.reembolsoModo, "percentual_custom");
    assert.equal(updatedCustomPercent.updated.reembolsoPercentual, "50.0000");
    assert.equal(updatedCustomPercent.updated.reembolsoValorTotal, null);

    const invalidTooHigh = await service.update(createdResult.created.id, user.id, {
      reembolsoModo: "valor_custom",
      reembolsoValorTotal: 9999,
    });
    assert.deepEqual(invalidTooHigh, {
      error: "REEMBOLSO_INVALIDO",
      message: "Valor personalizado de reembolso nao pode ser maior que o valor total da compra",
    });

    const removedPessoa = await service.update(createdResult.created.id, user.id, {
      pessoaId: null,
    });
    if ("error" in removedPessoa) {
      assert.fail(`Nao deveria falhar ao remover pessoa: ${removedPessoa.error}`);
    }
    assert.equal(removedPessoa.updated.pessoaId, null);
    assert.equal(removedPessoa.updated.statusPessoa, null);
    assert.equal(removedPessoa.updated.dataPagamentoPessoa, null);
    assert.equal(removedPessoa.updated.reembolsoModo, null);
    assert.equal(removedPessoa.updated.reembolsoValorTotal, null);
    assert.equal(removedPessoa.updated.reembolsoPercentual, null);

    const [legacyCompra] = await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Legacy compra",
      valorTotal: "300.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "300.00",
      dataCompra: "2026-05-12",
      pessoaId: pessoa.id,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
      reembolsoModo: null,
      reembolsoValorTotal: null,
      reembolsoPercentual: null,
    }).returning();

    const updatedLegacy = await service.update(legacyCompra.id, user.id, {
      descricao: "Legacy compra atualizada",
    });
    if ("error" in updatedLegacy) {
      assert.fail(`Nao deveria falhar no update legado: ${updatedLegacy.error}`);
    }
    assert.equal(updatedLegacy.updated.reembolsoModo, "total");
  } finally {
    await db.delete(users).where(and(eq(users.id, user.id)));
  }
});
