import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testFinancialIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testFinancialIntegration("calculo financeiro integrado mantem consistencia entre entradas e saidas", async () => {
  const { db } = await import("../db");
  const { FinancialService } = await import("../services/financial.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas, rendas, servicos, cartoes, comprasCartao } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new FinancialService(financialRepository);
  const username = `it_financial_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Financial Integration",
  }).returning();

  try {
    const [pessoaReceber] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Cliente X",
      tipo: "me_deve",
      telefone: null,
      observacao: null,
    }).returning();

    const [pessoaPagar] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Fornecedor Y",
      tipo: "eu_devo",
      telefone: null,
      observacao: null,
    }).returning();

    await db.insert(dividas).values([
      {
        userId: user.id,
        pessoaId: pessoaReceber.id,
        tipo: "receber",
        valor: "700.00",
        dataVencimento: "2026-04-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Recebimento contrato",
        totalParcelas: null,
        valorTotal: null,
      },
      {
        userId: user.id,
        pessoaId: pessoaPagar.id,
        tipo: "pagar",
        valor: "300.00",
        dataVencimento: "2026-04-12",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Conta fornecedor",
        totalParcelas: null,
        valorTotal: null,
      },
    ]);

    const [dividaComParcelas] = await db.insert(dividas).values({
      userId: user.id,
      pessoaId: pessoaPagar.id,
      tipo: "pagar",
      valor: "200.00",
      dataVencimento: "2026-04-20",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida parcelada",
      totalParcelas: 2,
      valorTotal: "200.00",
    }).returning();

    await db.insert(parcelas).values([
      {
        userId: user.id,
        dividaId: dividaComParcelas.id,
        numero: 1,
        valor: "100.00",
        dataVencimento: "2026-04-20",
        status: "pago",
        dataPagamento: "2026-04-20",
        formaPagamento: "pix",
      },
      {
        userId: user.id,
        dividaId: dividaComParcelas.id,
        numero: 2,
        valor: "100.00",
        dataVencimento: "2026-05-20",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ]);

    await db.insert(rendas).values({
      userId: user.id,
      tipo: "fixo",
      descricao: "Salario",
      valor: "1500.00",
      diaRecebimento: 5,
      ativo: true,
    });

    await db.insert(servicos).values({
      userId: user.id,
      nome: "Internet",
      categoria: "utilidades",
      valorMensal: "120.00",
      dataCobranca: 10,
      formaPagamento: "debito",
      status: "ativo",
      iconeId: null,
    });

    const [cartao] = await db.insert(cartoes).values({
      userId: user.id,
      nome: "Cartao X",
      limite: "2000.00",
      melhorDiaCompra: 5,
      diaVencimento: 25,
      iconeId: null,
    }).returning();

    await db.insert(comprasCartao).values({
      userId: user.id,
      cartaoId: cartao.id,
      descricao: "Compra teste",
      valorTotal: "300.00",
      parcelas: 3,
      parcelaAtual: 1,
      valorParcela: "100.00",
      dataCompra: "2026-04-02",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    });

    const summary = await service.getSummary(user.id, "2026-04");

    assert.equal(summary.totalRenda, 1500);
    assert.equal(summary.totalReceberMes, 700);
    assert.equal(summary.totalPagarMes, 300);
    assert.equal(summary.totalServicos, 120);
    assert.equal(summary.servicosEquivalenteMensalTotal, 120);
    assert.equal(summary.servicosCobrancaRealCompetenciaTotal, 120);
    assert.equal(summary.servicosVinculadosCartaoEquivalenteMensalTotal, 0);
    assert.equal(summary.servicosVinculadosCartaoCobrancaRealTotal, 0);
    assert.equal(summary.servicosNaoVinculadosCartaoEquivalenteMensalTotal, 120);
    assert.equal(summary.servicosNaoVinculadosCartaoCobrancaRealTotal, 120);
    assert.equal(summary.totalCartoesMes, 100);
    assert.equal(summary.totalEntradas, 2200);
    assert.equal(summary.totalSaidas, 520);
    assert.equal(summary.saldo, 1680);
    assert.equal(summary.dividaTotal, 1200);
    assert.equal(summary.dividaTotalPendente, 1100);
    assert.equal(summary.dividaTotalPaga, 100);
    assert.equal(summary.parcelas.total, 2);
    assert.equal(summary.parcelas.pagas, 1);
    assert.equal(summary.parcelas.pendentes, 1);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testFinancialIntegration("score e resumo integrados com dividas parceladas e compras parceladas", async () => {
  const { db } = await import("../db");
  const { FinancialService } = await import("../services/financial.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas, rendas, cartoes, comprasCartao } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new FinancialService(financialRepository);
  const username = `it_financial_score_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Financial Score Integration",
  }).returning();

  try {
    const [pessoa] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Pessoa Score IT",
      tipo: "eu_devo",
      telefone: null,
      observacao: null,
    }).returning();

    const [dividaParcelada] = await db.insert(dividas).values({
      userId: user.id,
      pessoaId: pessoa.id,
      tipo: "pagar",
      valor: "150.00",
      dataVencimento: "2026-04-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida parcelada score",
      totalParcelas: 4,
      valorTotal: "600.00",
    }).returning();

    await db.insert(parcelas).values([
      {
        userId: user.id,
        dividaId: dividaParcelada.id,
        numero: 1,
        valor: "150.00",
        dataVencimento: "2026-02-10",
        status: "pago",
        dataPagamento: "2026-02-10",
        formaPagamento: "pix",
      },
      {
        userId: user.id,
        dividaId: dividaParcelada.id,
        numero: 2,
        valor: "150.00",
        dataVencimento: "2026-03-10",
        status: "pago",
        dataPagamento: "2026-03-10",
        formaPagamento: "pix",
      },
      {
        userId: user.id,
        dividaId: dividaParcelada.id,
        numero: 3,
        valor: "150.00",
        dataVencimento: "2026-04-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        userId: user.id,
        dividaId: dividaParcelada.id,
        numero: 4,
        valor: "150.00",
        dataVencimento: "2026-05-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ]);

    await db.insert(rendas).values({
      userId: user.id,
      tipo: "fixo",
      descricao: "Salario",
      valor: "2000.00",
      diaRecebimento: 5,
      ativo: true,
    });

    const [cartao] = await db.insert(cartoes).values({
      userId: user.id,
      nome: "Cartao Score IT",
      limite: "1000.00",
      melhorDiaCompra: 5,
      diaVencimento: 25,
      iconeId: null,
    }).returning();

    await db.insert(comprasCartao).values([
      {
        userId: user.id,
        cartaoId: cartao.id,
        descricao: "Compra 4x",
        valorTotal: "400.00",
        parcelas: 4,
        parcelaAtual: 3,
        valorParcela: "100.00",
        dataCompra: "2026-02-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        userId: user.id,
        cartaoId: cartao.id,
        descricao: "Compra 2x",
        valorTotal: "160.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "80.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ]);

    const summary = await service.getSummary(user.id, "2026-04");
    const score = await service.getScore(user.id);
    const insights = await service.getInsights(user.id);

    assert.equal(summary.totalRenda, 2000);
    assert.equal(summary.totalPagarMes, 150);
    assert.equal(summary.totalCartoesMes, 180);
    assert.equal(summary.dividaTotal, 600);
    assert.equal(summary.dividaTotalPendente, 300);
    assert.equal(summary.dividaTotalPaga, 300);
    assert.equal(summary.parcelas.total, 4);
    assert.equal(summary.parcelas.pagas, 2);
    assert.equal(summary.parcelas.pendentes, 2);

    assert.ok(score.valor >= 0 && score.valor <= 100);
    assert.ok(score.fatores.length > 0);
    assert.ok(Array.isArray(insights));

    const comprasPersistidas = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(comprasPersistidas.length, 2);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testFinancialIntegration("resumo mensal prioriza parcelas quando cronograma difere da data da divida pai", async () => {
  const { db } = await import("../db");
  const { FinancialService } = await import("../services/financial.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new FinancialService(financialRepository);
  const username = `it_financial_monthly_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Financial Monthly Integration",
  }).returning();

  try {
    const [pessoa] = await db.insert(pessoas).values({
      userId: user.id,
      nome: "Pessoa Monthly IT",
      tipo: "eu_devo",
      telefone: null,
      observacao: null,
    }).returning();

    const [divida] = await db.insert(dividas).values({
      userId: user.id,
      pessoaId: pessoa.id,
      tipo: "pagar",
      valor: "100.00",
      dataVencimento: "2026-04-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida com cronograma deslocado",
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
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
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

    const summaryApril = await service.getSummary(user.id, "2026-04");
    const summaryJune = await service.getSummary(user.id, "2026-06");

    assert.equal(summaryApril.totalPagarMes, 0);
    assert.equal(summaryJune.totalPagarMes, 100);
    assert.equal(summaryApril.dividaTotal, 300);
    assert.equal(summaryApril.dividaTotalPendente, 300);
    assert.equal(summaryApril.dividaTotalPaga, 0);

    const parcelasRows = await db.select().from(parcelas).where(and(
      eq(parcelas.userId, user.id),
      eq(parcelas.dividaId, divida.id),
    ));
    assert.equal(parcelasRows.length, 3);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testFinancialIntegration("resumo de cartao prioriza parcelas_compra reais e evita distorcao por compra agregada", async () => {
  const { db } = await import("../db");
  const { FinancialService } = await import("../services/financial.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, comprasCartao, parcelasCompra, rendas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new FinancialService(financialRepository);
  const username = `it_financial_card_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Financial Card Integration",
  }).returning();

  try {
    await db.insert(rendas).values({
      userId: user.id,
      tipo: "fixo",
      descricao: "Salario",
      valor: "2500.00",
      diaRecebimento: 5,
      ativo: true,
    });

    const [cartao] = await db.insert(cartoes).values({
      userId: user.id,
      nome: "Cartao Real Parcelas",
      limite: "500.00",
      melhorDiaCompra: 5,
      diaVencimento: 20,
      iconeId: null,
    }).returning();

    await db.insert(comprasCartao).values([
      {
        id: "it-card-avista",
        userId: user.id,
        cartaoId: cartao.id,
        descricao: "Avista",
        valorTotal: "120.00",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "999.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "it-card-parcelada",
        userId: user.id,
        cartaoId: cartao.id,
        descricao: "Parcelada 3x",
        valorTotal: "300.00",
        parcelas: 3,
        parcelaAtual: 2,
        valorParcela: "999.00",
        dataCompra: "2026-03-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "it-card-multi",
        userId: user.id,
        cartaoId: cartao.id,
        descricao: "Parcelada 2x",
        valorTotal: "160.00",
        parcelas: 2,
        parcelaAtual: 1,
        valorParcela: "777.00",
        dataCompra: "2026-04-01",
        pessoaId: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ]);

    await db.insert(parcelasCompra).values([
      {
        userId: user.id,
        compraCartaoId: "it-card-avista",
        numero: 1,
        valor: "120.00",
        dataVencimento: "2026-04-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        userId: user.id,
        compraCartaoId: "it-card-parcelada",
        numero: 1,
        valor: "100.00",
        dataVencimento: "2026-03-10",
        statusCartao: "pago",
        dataPagamentoCartao: "2026-03-10",
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        userId: user.id,
        compraCartaoId: "it-card-parcelada",
        numero: 2,
        valor: "100.00",
        dataVencimento: "2026-04-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        userId: user.id,
        compraCartaoId: "it-card-parcelada",
        numero: 3,
        valor: "100.00",
        dataVencimento: "2026-05-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        userId: user.id,
        compraCartaoId: "it-card-multi",
        numero: 1,
        valor: "80.00",
        dataVencimento: "2026-04-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        userId: user.id,
        compraCartaoId: "it-card-multi",
        numero: 2,
        valor: "80.00",
        dataVencimento: "2026-05-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ]);

    const summaryApril = await service.getSummary(user.id, "2026-04");
    const summaryMay = await service.getSummary(user.id, "2026-05");
    const score = await service.getScore(user.id);

    assert.equal(summaryApril.totalCartoesMes, 300);
    assert.equal(summaryMay.totalCartoesMes, 180);
    assert.ok(summaryApril.totalCartoesMes < 500);
    assert.ok(score.fatores.some((factor) => factor.label.includes("Uso elevado")));

    const comprasRows = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.cartaoId, cartao.id),
    ));
    assert.equal(comprasRows.length, 3);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
