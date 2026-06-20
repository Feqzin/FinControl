import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testDividasIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testDividasIntegration("createParcelado persiste divida e parcelas com soma consistente", async () => {
  const { db } = await import("../db");
  const { DividasService } = await import("../services/dividas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, parcelas, dividas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new DividasService(financialRepository);
  const username = `it_dividas_create_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Dividas Create Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Divida IT",
    tipo: "eu_devo",
    telefone: null,
    observacao: null,
  }).returning();

  try {
    const result = await service.createParcelado({
      pessoaId: pessoa.id,
      tipo: "pagar",
      valorTotal: 100,
      totalParcelas: 3,
      primeiroVencimento: "2026-06-10",
      descricao: "Divida parcelada IT",
      formaPagamento: "pix",
    }, user.id);

    assert.equal(result.divida.totalParcelas, 3);
    assert.equal(result.divida.valorTotal, "100.00");
    assert.equal(result.divida.valor, "33.33");
    assert.equal(result.parcelas.length, 3);

    const [persistedDivida] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, result.divida.id),
    ));
    assert.ok(persistedDivida);
    assert.equal(persistedDivida.valorTotal, "100.00");
    assert.equal(persistedDivida.totalParcelas, 3);

    const persistedParcelas = await db.select().from(parcelas).where(and(
      eq(parcelas.userId, user.id),
      eq(parcelas.dividaId, result.divida.id),
    ));

    assert.equal(persistedParcelas.length, 3);
    const ordered = [...persistedParcelas].sort((a, b) => a.numero - b.numero);
    assert.deepEqual(ordered.map((row) => row.valor), ["33.33", "33.33", "33.34"]);

    const soma = ordered.reduce((sum, row) => sum + Number(row.valor), 0);
    assert.equal(Number(soma.toFixed(2)), 100);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testDividasIntegration("recalcular preserva parcelas pagas e recria apenas pendentes", async () => {
  const { db } = await import("../db");
  const { DividasService } = await import("../services/dividas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new DividasService(financialRepository);
  const username = `it_dividas_recalc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Dividas Recalc Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Recalculo IT",
    tipo: "eu_devo",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-06-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida para recalcular",
    totalParcelas: 3,
    valorTotal: "300.00",
  }).returning();

  await db.insert(parcelas).values([
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-06-10",
      status: "pago",
      dataPagamento: "2026-06-10",
      formaPagamento: "pix",
    },
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-07-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 3,
      valor: "100.00",
      dataVencimento: "2026-08-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ]);

  try {
    const result = await service.recalcular(divida.id, user.id, {
      novoTotal: 4,
      primeiroVencimento: "2026-09-10",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      assert.fail("Recalculo deveria concluir com sucesso");
    }
    assert.deepEqual(result.data, {
      pagas: 1,
      novas: 3,
      valorRestante: "200.00",
    });

    const rows = await db.select().from(parcelas).where(and(
      eq(parcelas.userId, user.id),
      eq(parcelas.dividaId, divida.id),
    ));
    assert.equal(rows.length, 4);

    const ordered = [...rows].sort((a, b) => a.numero - b.numero);
    assert.equal(ordered[0]?.status, "pago");
    assert.deepEqual(ordered.map((row) => row.numero), [1, 2, 3, 4]);

    const pendentes = ordered.filter((row) => row.status === "pendente");
    const somaPendentes = pendentes.reduce((sum, row) => sum + Number(row.valor), 0);
    assert.equal(pendentes.length, 3);
    assert.equal(Number(somaPendentes.toFixed(2)), 200);
    assert.deepEqual(pendentes.map((row) => row.dataVencimento), ["2026-09-10", "2026-10-10", "2026-11-10"]);

    const [dividaAtualizada] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(dividaAtualizada);
    assert.equal(dividaAtualizada.totalParcelas, 4);
    assert.equal(dividaAtualizada.valorTotal, "300.00");
    assert.equal(dividaAtualizada.valor, "66.66");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testDividasIntegration("edicao direta de divida parcelada e reconciliada pelos filhos", async () => {
  const { db } = await import("../db");
  const { DividasService } = await import("../services/dividas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new DividasService(financialRepository);
  const username = `it_dividas_edit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Dividas Edit Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Edit IT",
    tipo: "eu_devo",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-06-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida editada",
    totalParcelas: 2,
    valorTotal: "200.00",
  }).returning();

  await db.insert(parcelas).values([
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-06-10",
      status: "pago",
      dataPagamento: "2026-06-10",
      formaPagamento: "pix",
    },
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-07-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ]);

  try {
    const updated = await service.update(divida.id, user.id, {
      status: "pago",
      dataPagamento: "2026-06-10",
      formaPagamento: "pix",
    });

    assert.ok(updated);
    assert.equal(updated.status, "pendente");
    assert.equal(updated.dataPagamento, null);

    const [persisted] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(persisted);
    assert.equal(persisted.status, "pendente");
    assert.equal(persisted.totalParcelas, 2);
    assert.equal(persisted.valorTotal, "200.00");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testDividasIntegration("abatimento parcial com saldo positivo reduz pendencia sem erro 500", async () => {
  const { db } = await import("../db");
  const { PessoasService } = await import("../services/pessoas.service");
  const { storage } = await import("../storage");
  const { users, pessoas, dividas, pessoaSaldoMovimentacoes } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new PessoasService(storage);
  const username = `it_pessoas_abate_parcial_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Pessoas Abate Parcial IT",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Saldo Parcial",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "receber",
    valor: "1000.00",
    dataVencimento: "2026-06-19",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Monitor Pichau",
    totalParcelas: null,
    valorTotal: null,
  }).returning();

  await db.insert(pessoaSaldoMovimentacoes).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "credito",
    valor: "1000.00",
    data: "2026-06-18",
    origem: "manual",
    categoria: "ajuste",
    observacao: "Credito inicial",
    comprovanteReferencia: null,
    dividaId: null,
    compraCartaoId: null,
    parcelaCompraId: null,
    servicoPessoaId: null,
  });

  try {
    const result = await service.abaterSaldoEmDivida(pessoa.id, divida.id, user.id, {
      valor: "250.00",
      data: "2026-06-19",
      observacao: "Abatimento parcial IT",
    });

    if ("error" in result) {
      assert.fail(`Nao deveria retornar erro: ${result.error}`);
    }

    assert.equal(result.aplicado.quitada, false);
    assert.equal(result.aplicado.valorAbatido, 250);
    assert.equal(result.aplicado.valorPendenteAtual, 750);
    assert.equal(result.aplicado.saldoAtual, 750);
    assert.equal(result.aplicado.divida.status, "pendente");
    assert.equal(result.aplicado.divida.formaPagamento, null);

    const [persistedDivida] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(persistedDivida);
    assert.equal(persistedDivida.valor, "750.00");
    assert.equal(persistedDivida.status, "pendente");
    assert.equal(persistedDivida.formaPagamento, null);

    const saldoRows = await db.select().from(pessoaSaldoMovimentacoes).where(and(
      eq(pessoaSaldoMovimentacoes.userId, user.id),
      eq(pessoaSaldoMovimentacoes.pessoaId, pessoa.id),
    ));
    assert.equal(saldoRows.length, 2);
    const abatimento = saldoRows.find((row) => row.origem === "abatimento_divida");
    assert.ok(abatimento);
    assert.equal(abatimento?.tipo, "debito");
    assert.equal(abatimento?.valor, "250.00");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testDividasIntegration("abatimento total com saldo positivo quita divida sem gravar forma_pagamento invalida", async () => {
  const { db } = await import("../db");
  const { PessoasService } = await import("../services/pessoas.service");
  const { storage } = await import("../storage");
  const { users, pessoas, dividas, pessoaSaldoMovimentacoes } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new PessoasService(storage);
  const username = `it_pessoas_abate_total_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Pessoas Abate Total IT",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Saldo Total",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "receber",
    valor: "1000.00",
    dataVencimento: "2026-06-19",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Monitor Pichau",
    totalParcelas: null,
    valorTotal: null,
  }).returning();

  await db.insert(pessoaSaldoMovimentacoes).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "credito",
    valor: "1000.00",
    data: "2026-06-18",
    origem: "manual",
    categoria: "ajuste",
    observacao: "Credito inicial",
    comprovanteReferencia: null,
    dividaId: null,
    compraCartaoId: null,
    parcelaCompraId: null,
    servicoPessoaId: null,
  });

  try {
    const result = await service.abaterSaldoEmDivida(pessoa.id, divida.id, user.id, {
      valor: "1000.00",
      data: "2026-06-19",
      observacao: "Abatimento total IT",
    });

    if ("error" in result) {
      assert.fail(`Nao deveria retornar erro: ${result.error}`);
    }

    assert.equal(result.aplicado.quitada, true);
    assert.equal(result.aplicado.valorPendenteAtual, 0);
    assert.equal(result.aplicado.saldoAtual, 0);
    assert.equal(result.aplicado.divida.status, "pago");
    assert.equal(result.aplicado.divida.dataPagamento, "2026-06-19");
    assert.equal(result.aplicado.divida.formaPagamento, null);

    const [persistedDivida] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(persistedDivida);
    assert.equal(persistedDivida.status, "pago");
    assert.equal(persistedDivida.dataPagamento, "2026-06-19");
    assert.equal(persistedDivida.formaPagamento, null);

    const saldoRows = await db.select().from(pessoaSaldoMovimentacoes).where(and(
      eq(pessoaSaldoMovimentacoes.userId, user.id),
      eq(pessoaSaldoMovimentacoes.pessoaId, pessoa.id),
    ));
    assert.equal(saldoRows.length, 2);
    const abatimento = saldoRows.find((row) => row.origem === "abatimento_divida");
    assert.ok(abatimento);
    assert.equal(abatimento?.valor, "1000.00");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testDividasIntegration("abatimento acima do saldo retorna validacao clara", async () => {
  const { db } = await import("../db");
  const { PessoasService } = await import("../services/pessoas.service");
  const { storage } = await import("../storage");
  const { users, pessoas, dividas, pessoaSaldoMovimentacoes } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new PessoasService(storage);
  const username = `it_pessoas_abate_invalido_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Pessoas Abate Invalido IT",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Saldo Insuficiente",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "receber",
    valor: "1000.00",
    dataVencimento: "2026-06-19",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Monitor Pichau",
    totalParcelas: null,
    valorTotal: null,
  }).returning();

  await db.insert(pessoaSaldoMovimentacoes).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "credito",
    valor: "100.00",
    data: "2026-06-18",
    origem: "manual",
    categoria: "ajuste",
    observacao: "Credito inicial",
    comprovanteReferencia: null,
    dividaId: null,
    compraCartaoId: null,
    parcelaCompraId: null,
    servicoPessoaId: null,
  });

  try {
    const result = await service.abaterSaldoEmDivida(pessoa.id, divida.id, user.id, {
      valor: "150.00",
      data: "2026-06-19",
    });

    assert.deepEqual(result, { error: "VALOR_MAIOR_QUE_SALDO" });
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
