import assert from "node:assert/strict";
import test from "node:test";
import { calculateDasMei, getDasMeiDueDate, getMeiPrincipal } from "../../shared/das-mei";

const selic = {
  "2024-06": 0.79, "2024-07": 0.91, "2024-08": 0.87, "2024-09": 0.84,
  "2024-10": 0.93, "2024-11": 0.79, "2024-12": 0.93,
  "2025-01": 1.01, "2025-02": 0.99, "2025-03": 0.96, "2025-04": 1.06,
  "2025-05": 1.14, "2025-06": 1.10, "2025-07": 1.28, "2025-08": 1.16,
  "2025-09": 1.22, "2025-10": 1.28, "2025-11": 1.05, "2025-12": 1.22,
  "2026-01": 1.16, "2026-02": 1.00, "2026-03": 1.21, "2026-04": 1.09,
  "2026-05": 1.07, "2026-06": 1.12, "2026-07": 1.22,
};

test("usa os valores oficiais anuais do MEI por atividade", () => {
  assert.equal(getMeiPrincipal("2024-04-01", "comercio"), 71.6);
  assert.equal(getMeiPrincipal("2025-01-01", "comercio"), 76.9);
  assert.equal(getMeiPrincipal("2026-01-01", "comercio"), 82.05);
  assert.equal(getMeiPrincipal("2026-01-01", "servico"), 86.05);
  assert.equal(getMeiPrincipal("2026-01-01", "comercio_servico"), 87.05);
  assert.equal(getMeiPrincipal("2026-01-01", "comercio", true), 1);
});

test("move o vencimento para o próximo dia útil e respeita a prorrogação nacional", () => {
  assert.equal(getDasMeiDueDate("2025-03-01"), "2025-04-22");
  assert.equal(getDasMeiDueDate("2025-04-01"), "2025-05-28");
  assert.equal(getDasMeiDueDate("2025-06-01"), "2025-07-21");
  assert.equal(getDasMeiDueDate("2026-05-01"), "2026-06-22");
  assert.equal(getDasMeiDueDate("2026-08-01"), "2026-09-21");
});

test("reproduz os valores de janeiro, maio e junho de 2026 mostrados no PGMEI", () => {
  const january = calculateDasMei({
    competencia: "2026-01-01",
    activity: "comercio",
    requestedCalculationDate: "2026-08-10",
    selicRates: selic,
  });
  assert.deepEqual(
    { principal: january.principal, fine: january.fineAmount, interest: january.interestAmount, total: january.total },
    { principal: 82.05, fine: 16.41, interest: 5.51, total: 103.97 },
  );

  const may = calculateDasMei({
    competencia: "2026-05-01",
    activity: "comercio",
    requestedCalculationDate: "2026-08-10",
    selicRates: selic,
  });
  assert.deepEqual(
    { fine: may.fineAmount, interest: may.interestAmount, total: may.total },
    { fine: 13.27, interest: 1.82, total: 97.14 },
  );

  const june = calculateDasMei({
    competencia: "2026-06-01",
    activity: "comercio",
    requestedCalculationDate: "2026-08-10",
    selicRates: selic,
  });
  assert.deepEqual(
    { fine: june.fineAmount, interest: june.interestAmount, total: june.total },
    { fine: 5.69, interest: 0.82, total: 88.56 },
  );
});

test("reproduz exemplos antigos do PGMEI", () => {
  const april2024 = calculateDasMei({
    competencia: "2024-04-01",
    activity: "comercio",
    requestedCalculationDate: "2026-08-10",
    selicRates: selic,
  });
  assert.deepEqual(
    { fine: april2024.fineAmount, interest: april2024.interestAmount, total: april2024.total },
    { fine: 14.32, interest: 20.33, total: 106.25 },
  );

  const january2025 = calculateDasMei({
    competencia: "2025-01-01",
    activity: "comercio",
    requestedCalculationDate: "2026-08-10",
    selicRates: selic,
  });
  assert.deepEqual(
    { fine: january2025.fineAmount, interest: january2025.interestAmount, total: january2025.total },
    { fine: 15.38, interest: 15.64, total: 107.92 },
  );
});

test("reproduz o consolidado de 2026 e não cobra encargos antes do vencimento", () => {
  const calculations = Array.from({ length: 8 }, (_, index) => calculateDasMei({
    competencia: `2026-${String(index + 1).padStart(2, "0")}-01`,
    activity: "comercio",
    requestedCalculationDate: "2026-08-10",
    selicRates: selic,
  }));
  const totals = calculations.reduce((result, calculation) => ({
    principal: Math.round((result.principal + calculation.principal) * 100) / 100,
    fine: Math.round((result.fine + calculation.fineAmount) * 100) / 100,
    interest: Math.round((result.interest + calculation.interestAmount) * 100) / 100,
    total: Math.round((result.total + calculation.total) * 100) / 100,
  }), { principal: 0, fine: 0, interest: 0, total: 0 });

  assert.deepEqual(totals, { principal: 656.4, fine: 84.6, interest: 19.02, total: 760.02 });
  assert.equal(calculations[6].calculationDate, "2026-08-20");
  assert.equal(calculations[6].fineAmount, 0);
  assert.equal(calculations[7].calculationDate, "2026-09-21");
  assert.equal(calculations[7].interestAmount, 0);
});

test("permite principal manual quando o ano automático ainda não existe", () => {
  const calculation = calculateDasMei({
    competencia: "2027-01-01",
    activity: "comercio",
    requestedCalculationDate: "2027-02-22",
    selicRates: {},
    override: { principal: 90, dueDate: "2027-02-22" },
  });
  assert.equal(calculation.principal, 90);
  assert.equal(calculation.total, 90);
  assert.equal(calculation.principalManual, true);
});
