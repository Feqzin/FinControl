import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testParcelasIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testParcelasIntegration("pagamento antecipado quita parcelas e atualiza status da divida", async () => {
  const { db } = await import("../db");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ParcelasService(financialRepository);
  const username = `it_parcelas_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Parcelas Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Fornecedor Teste",
    tipo: "eu_devo",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "pagar",
    valor: "200.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida de teste",
    totalParcelas: 2,
    valorTotal: "200.00",
  }).returning();

  await db.insert(parcelas).values([
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-05-01",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-06-01",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ]);

  try {
    const result = await service.antecipar(user.id, {
      dividaId: divida.id,
      quantidade: 2,
      formaPagamento: "pix",
    });

    assert.equal(result.quantidadeAtualizada, 2);
    assert.equal(result.todasPagas, true);

    const parcelasAtualizadas = await db.select().from(parcelas).where(and(
      eq(parcelas.userId, user.id),
      eq(parcelas.dividaId, divida.id),
    ));
    assert.equal(parcelasAtualizadas.length, 2);
    assert.ok(parcelasAtualizadas.every((row) => row.status === "pago"));
    assert.ok(parcelasAtualizadas.every((row) => row.formaPagamento === "pix"));
    assert.ok(parcelasAtualizadas.every((row) => row.dataPagamento != null));

    const [dividaAtualizada] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(dividaAtualizada);
    assert.equal(dividaAtualizada.status, "pago");
    assert.equal(dividaAtualizada.formaPagamento, "pix");
    assert.ok(dividaAtualizada.dataPagamento != null);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testParcelasIntegration("update de parcela pago sincroniza divida pai automaticamente", async () => {
  const { db } = await import("../db");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ParcelasService(financialRepository);
  const username = `it_parcelas_update_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Parcelas Update Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Fornecedor Update Teste",
    tipo: "eu_devo",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida update teste",
    totalParcelas: 1,
    valorTotal: "100.00",
  }).returning();

  const [parcela] = await db.insert(parcelas).values({
    userId: user.id,
    dividaId: divida.id,
    numero: 1,
    valor: "100.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
  }).returning();

  try {
    const updated = await service.update(parcela.id, user.id, {
      status: "pago",
      dataPagamento: "2026-04-20",
      formaPagamento: "pix",
    });

    assert.ok(updated);
    assert.equal(updated.status, "pago");
    assert.equal(updated.dataPagamento, "2026-04-20");

    const [dividaAtualizada] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(dividaAtualizada);
    assert.equal(dividaAtualizada.status, "pago");
    assert.equal(dividaAtualizada.dataPagamento, "2026-04-20");
    assert.equal(dividaAtualizada.formaPagamento, "pix");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testParcelasIntegration("delete de parcela recalcula total e status da divida pai", async () => {
  const { db } = await import("../db");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ParcelasService(financialRepository);
  const username = `it_parcelas_delete_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Parcelas Delete Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Fornecedor Delete Teste",
    tipo: "eu_devo",
    telefone: null,
    observacao: null,
  }).returning();

  const [divida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "pagar",
    valor: "100.00",
    dataVencimento: "2026-05-01",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Divida delete teste",
    totalParcelas: 2,
    valorTotal: "200.00",
  }).returning();

  const [parcela1] = await db.insert(parcelas).values([
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-05-01",
      status: "pago",
      dataPagamento: "2026-05-01",
      formaPagamento: "pix",
    },
    {
      userId: user.id,
      dividaId: divida.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-06-01",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    },
  ]).returning();

  try {
    const deleted = await service.delete(parcela1.id, user.id);
    assert.equal(deleted, true);

    const rows = await db.select().from(parcelas).where(and(
      eq(parcelas.userId, user.id),
      eq(parcelas.dividaId, divida.id),
    ));
    assert.equal(rows.length, 1);

    const [dividaAtualizada] = await db.select().from(dividas).where(and(
      eq(dividas.userId, user.id),
      eq(dividas.id, divida.id),
    ));
    assert.ok(dividaAtualizada);
    assert.equal(dividaAtualizada.totalParcelas, 1);
    assert.equal(dividaAtualizada.valorTotal, "100.00");
    assert.equal(dividaAtualizada.status, "pendente");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testParcelasIntegration("edicao bulk de parcelas_compra recalcula agregado da compra pai", async () => {
  const { db } = await import("../db");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, cartoes, comprasCartao, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ParcelasService(financialRepository);
  const username = `it_parcelas_compra_bulk_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Parcelas Compra Bulk Integration",
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Bulk Teste",
    limite: "5000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [compra] = await db.insert(comprasCartao).values({
    userId: user.id,
    cartaoId: cartao.id,
    descricao: "Compra bulk parcelas",
    valorTotal: "300.00",
    parcelas: 3,
    parcelaAtual: 1,
    valorParcela: "100.00",
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
      valor: "100.00",
      dataVencimento: "2026-04-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      userId: user.id,
      compraCartaoId: compra.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-05-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      userId: user.id,
      compraCartaoId: compra.id,
      numero: 3,
      valor: "100.00",
      dataVencimento: "2026-06-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ]);

  try {
    const result = await service.replaceParcelasCompraBulk(user.id, {
      compraCartaoId: compra.id,
      parcelas: [
        {
          numero: 1,
          valor: "60.00",
          dataVencimento: "2026-04-20",
          statusCartao: "pago",
          dataPagamentoCartao: "2026-04-20",
          statusPessoa: null,
          dataPagamentoPessoa: null,
        },
        {
          numero: 2,
          valor: "40.00",
          dataVencimento: "2026-05-20",
          statusCartao: "pendente",
          dataPagamentoCartao: null,
          statusPessoa: null,
          dataPagamentoPessoa: null,
        },
      ],
    });

    assert.equal(result.created.length, 2);

    const [compraAtualizada] = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.id, compra.id),
    ));
    assert.ok(compraAtualizada);
    assert.equal(compraAtualizada.parcelas, 2);
    assert.equal(compraAtualizada.parcelaAtual, 2);
    assert.equal(compraAtualizada.valorTotal, "100.00");
    assert.equal(compraAtualizada.valorParcela, "40.00");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testParcelasIntegration("quitacao total de parcelas_compra sincroniza agregado da compra pai", async () => {
  const { db } = await import("../db");
  const { ParcelasService } = await import("../services/parcelas.service");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { users, pessoas, cartoes, comprasCartao, parcelasCompra } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new ParcelasService(financialRepository);
  const username = `it_parcelas_compra_quitacao_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Parcelas Compra Quitacao Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Parcela Compra",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [cartao] = await db.insert(cartoes).values({
    userId: user.id,
    nome: "Cartao Quitacao Teste",
    limite: "3000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [compra] = await db.insert(comprasCartao).values({
    userId: user.id,
    cartaoId: cartao.id,
    descricao: "Compra para quitacao",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-20",
    pessoaId: pessoa.id,
    statusPessoa: "pendente",
    dataPagamentoPessoa: null,
  }).returning();

  const [parcela1, parcela2] = await db.insert(parcelasCompra).values([
    {
      userId: user.id,
      compraCartaoId: compra.id,
      numero: 1,
      valor: "50.00",
      dataVencimento: "2026-04-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
    {
      userId: user.id,
      compraCartaoId: compra.id,
      numero: 2,
      valor: "50.00",
      dataVencimento: "2026-05-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
  ]).returning();

  try {
    const first = await service.updateParcelaCompra(parcela1.id, user.id, {
      statusCartao: "pago",
      dataPagamentoCartao: "2026-04-20",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-04-20",
    });
    assert.ok(first);

    const second = await service.updateParcelaCompra(parcela2.id, user.id, {
      statusCartao: "pago",
      dataPagamentoCartao: "2026-05-20",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-05-20",
    });
    assert.ok(second);

    const [compraAtualizada] = await db.select().from(comprasCartao).where(and(
      eq(comprasCartao.userId, user.id),
      eq(comprasCartao.id, compra.id),
    ));
    assert.ok(compraAtualizada);
    assert.equal(compraAtualizada.parcelas, 2);
    assert.equal(compraAtualizada.parcelaAtual, 2);
    assert.equal(compraAtualizada.valorTotal, "100.00");
    assert.equal(compraAtualizada.statusPessoa, "pago");
    assert.equal(compraAtualizada.dataPagamentoPessoa, "2026-05-20");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
