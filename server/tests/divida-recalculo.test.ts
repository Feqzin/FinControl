import test from "node:test";
import assert from "node:assert/strict";
import { buildDividaRecalculoPlan } from "../divida-recalculo";

function sumValues(values: string[]): number {
  return values.reduce((sum, value) => sum + Number(value), 0);
}

test("nao multiplica valorTotal ao recalcular parcelas", () => {
  const plan = buildDividaRecalculoPlan({
    valorTotal: 1000,
    novoTotal: 10,
    parcelasPagas: [{ valor: 100 }, { valor: 100 }],
    primeiroVencimento: new Date("2026-05-10T12:00:00"),
  });

  assert.equal(plan.valorTotal, "1000.00");
  assert.equal(plan.valorRestante, "800.00");
  assert.equal(plan.parcelasPendentes.length, 8);

  const pendingSum = sumValues(plan.parcelasPendentes.map((p) => p.valor));
  assert.equal(Number((pendingSum + 200).toFixed(2)), 1000);
});

test("recalcula valor restante correto quando novo total diminui", () => {
  const plan = buildDividaRecalculoPlan({
    valorTotal: 1000,
    novoTotal: 8,
    parcelasPagas: [{ valor: 100 }, { valor: 100 }],
    primeiroVencimento: new Date("2026-05-10T12:00:00"),
  });

  assert.equal(plan.parcelasPendentes.length, 6);
  assert.equal(plan.parcelasPendentes[0]?.valor, "133.33");
  assert.equal(plan.parcelasPendentes[5]?.valor, "133.35");

  const pendingSum = sumValues(plan.parcelasPendentes.map((p) => p.valor));
  assert.equal(Number((pendingSum + 200).toFixed(2)), 1000);
});

test("falha quando novo total e menor que parcelas ja pagas", () => {
  assert.throws(
    () =>
      buildDividaRecalculoPlan({
        valorTotal: 1000,
        novoTotal: 1,
        parcelasPagas: [{ valor: 100 }, { valor: 100 }],
        primeiroVencimento: new Date("2026-05-10T12:00:00"),
      }),
    /novoTotal nao pode ser menor/,
  );
});

