import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testCnpjDasIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testCnpjDasIntegration("cadastra CNPJ, cria dívida DAS, registra evolução e preserva pagamento", async () => {
  const { db } = await import("../db");
  const { CnpjDasService } = await import("../services/cnpj-das.service");
  const { cnpjDasCalculos, cnpjDasObrigacoes, cnpjs, dividas, pessoas, users } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const service = new CnpjDasService(db);
  const username = `it_cnpj_das_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "CNPJ DAS Integration",
  }).returning();

  try {
    const saved = await service.save(user.id, {
      cnpj: "11.222.333/0001-81",
      nome: "Empresa de Teste",
      atividade: "comercio",
      competenciaInicial: "2026-06",
      competenciaFinal: "2026-06",
      dataCalculo: "2026-08-10",
      competenciasSelecionadas: ["2026-06"],
      overrides: {},
    });

    assert.equal(saved.obligations.length, 1);
    assert.equal(saved.skippedPaid, 0);

    const [company] = await db.select().from(cnpjs).where(and(eq(cnpjs.userId, user.id), eq(cnpjs.cnpj, "11222333000181")));
    assert.ok(company);
    assert.equal(company.atividadeMei, "comercio");

    const [creditor] = await db.select().from(pessoas).where(and(eq(pessoas.userId, user.id), eq(pessoas.id, company.pessoaId)));
    assert.ok(creditor);
    assert.equal(creditor.tipo, "eu_devo");

    const [obligation] = await db.select().from(cnpjDasObrigacoes).where(and(
      eq(cnpjDasObrigacoes.userId, user.id),
      eq(cnpjDasObrigacoes.cnpjId, company.id),
    ));
    assert.ok(obligation);
    assert.equal(obligation.total, "88.56");

    const [debt] = await db.select().from(dividas).where(and(eq(dividas.userId, user.id), eq(dividas.id, obligation.dividaId)));
    assert.ok(debt);
    assert.equal(debt.tipo, "pagar");
    assert.equal(debt.origem, "cnpj_das");
    assert.equal(debt.valor, "88.56");

    const recalculated = await service.recalculate(user.id, company.id, "2026-08-15");
    assert.deepEqual(recalculated, { updated: 1, skippedPaid: 0 });

    const [updatedDebt] = await db.select().from(dividas).where(eq(dividas.id, debt.id));
    assert.equal(updatedDebt.valor, "89.91");
    const history = await db.select().from(cnpjDasCalculos).where(eq(cnpjDasCalculos.obrigacaoId, obligation.id));
    assert.equal(history.length, 2);
    assert.deepEqual(history.map((row) => row.total), ["88.56", "89.91"]);

    await db.update(dividas).set({ status: "pago", dataPagamento: "2026-08-15" }).where(eq(dividas.id, debt.id));
    const afterPayment = await service.recalculate(user.id, company.id, "2026-09-10");
    assert.deepEqual(afterPayment, { updated: 0, skippedPaid: 1 });

    const listed = await service.list(user.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].obligations[0].debtStatus, "pago");
    assert.equal(listed[0].obligations[0].history.length, 2);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
});
