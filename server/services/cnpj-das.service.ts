import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  calculateDasMei,
  getDasMeiDueDate,
  listCompetencies,
  normalizeCnpj,
  requiredSelicMonths,
  type DasMeiCalculation,
  type MeiActivity,
} from "@shared/das-mei";
import { cnpjDasCalculos, cnpjDasObrigacoes, cnpjs, dividas, pessoas } from "@shared/schema";
import type { Cnpj, CnpjDasCalculo, CnpjDasObrigacao, Divida } from "@shared/schema";
import type { CnpjDasPreviewInput, CnpjDasSaveInput } from "../validators/cnpj-das.validators";

const OFFICIAL_SELIC_FALLBACK: Record<string, number> = {
  "2024-06": 0.79, "2024-07": 0.91, "2024-08": 0.87, "2024-09": 0.84,
  "2024-10": 0.93, "2024-11": 0.79, "2024-12": 0.93,
  "2025-01": 1.01, "2025-02": 0.99, "2025-03": 0.96, "2025-04": 1.06,
  "2025-05": 1.14, "2025-06": 1.10, "2025-07": 1.28, "2025-08": 1.16,
  "2025-09": 1.22, "2025-10": 1.28, "2025-11": 1.05, "2025-12": 1.22,
  "2026-01": 1.16, "2026-02": 1.00, "2026-03": 1.21, "2026-04": 1.09,
  "2026-05": 1.07, "2026-06": 1.12, "2026-07": 1.22,
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetency(value: string): string {
  const [year, month] = value.slice(0, 7).split("-");
  return `${month}/${year}`;
}

function parseMonthKey(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

async function loadSelicRates(months: string[]): Promise<Record<string, number>> {
  const uniqueMonths = Array.from(new Set(months)).sort();
  const rates: Record<string, number> = {};
  for (const month of uniqueMonths) {
    if (OFFICIAL_SELIC_FALLBACK[month] != null) rates[month] = OFFICIAL_SELIC_FALLBACK[month];
  }

  const missing = uniqueMonths.filter((month) => rates[month] == null);
  if (missing.length === 0) return rates;

  const first = parseMonthKey(missing[0]);
  const last = parseMonthKey(missing[missing.length - 1]);
  const lastDay = new Date(Date.UTC(last.year, last.month, 0)).getUTCDate();
  const url = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados");
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", `01/${String(first.month).padStart(2, "0")}/${first.year}`);
  url.searchParams.set("dataFinal", `${lastDay}/${String(last.month).padStart(2, "0")}/${last.year}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("O Banco Central não respondeu ao cálculo da Selic.");
    const payload = await response.json() as Array<{ data: string; valor: string }>;
    for (const item of payload) {
      const [day, month, year] = item.data.split("/");
      if (day !== "01") continue;
      rates[`${year}-${month}`] = Number(item.valor.replace(",", "."));
    }
  } finally {
    clearTimeout(timeout);
  }

  const stillMissing = uniqueMonths.filter((month) => rates[month] == null);
  if (stillMissing.length > 0) {
    throw new Error(`Taxa Selic oficial indisponível para ${stillMissing.join(", ")}. Tente novamente mais tarde.`);
  }
  return rates;
}

async function calculatePreview(payload: CnpjDasPreviewInput): Promise<DasMeiCalculation[]> {
  const competencies = listCompetencies(payload.competenciaInicial, payload.competenciaFinal);
  const preliminary = competencies.map((competencia) => ({
    competencia,
    dueDate: payload.overrides[competencia.slice(0, 7)]?.dueDate || getDasMeiDueDate(competencia),
  }));
  const requiredMonths = preliminary.flatMap((item) => requiredSelicMonths(
    item.dueDate,
    payload.dataCalculo,
  ));
  const selicRates = await loadSelicRates(requiredMonths);

  return competencies.map((competencia) => calculateDasMei({
    competencia,
    activity: payload.atividade,
    requestedCalculationDate: payload.dataCalculo,
    selicRates,
    override: payload.overrides[competencia.slice(0, 7)],
  }));
}

function debtDescription(calculation: DasMeiCalculation): string {
  return [
    `DAS MEI ${formatCompetency(calculation.competencia)}`,
    `principal ${formatMoney(calculation.principal)}`,
    `multa ${formatMoney(calculation.fineAmount)}`,
    `juros ${formatMoney(calculation.interestAmount)}`,
    `calculado em ${calculation.calculationDate.split("-").reverse().join("/")}`,
  ].join(" · ");
}

export class CnpjDasService {
  constructor(private readonly database: any) {}

  async preview(payload: CnpjDasPreviewInput) {
    return calculatePreview(payload);
  }

  async list(userId: string) {
    const companyRows = await this.database.select().from(cnpjs).where(eq(cnpjs.userId, userId)).orderBy(asc(cnpjs.nome)) as Cnpj[];
    if (companyRows.length === 0) return [];

    const obligationRows = await this.database
      .select({ obligation: cnpjDasObrigacoes, debt: dividas })
      .from(cnpjDasObrigacoes)
      .innerJoin(dividas, eq(dividas.id, cnpjDasObrigacoes.dividaId))
      .where(eq(cnpjDasObrigacoes.userId, userId))
      .orderBy(desc(cnpjDasObrigacoes.competencia)) as Array<{ obligation: CnpjDasObrigacao; debt: Divida }>;
    const obligationIds = obligationRows.map((row) => row.obligation.id);
    const historyRows = obligationIds.length === 0 ? [] : await this.database
      .select()
      .from(cnpjDasCalculos)
      .where(and(eq(cnpjDasCalculos.userId, userId), inArray(cnpjDasCalculos.obrigacaoId, obligationIds)))
      .orderBy(asc(cnpjDasCalculos.createdAt)) as CnpjDasCalculo[];

    return companyRows.map((company) => ({
      ...company,
      obligations: obligationRows
        .filter((row) => row.obligation.cnpjId === company.id)
        .map((row) => ({
          ...row.obligation,
          debtStatus: row.debt.status,
          debtDeletedAt: row.debt.deletedAt,
          history: historyRows.filter((history) => history.obrigacaoId === row.obligation.id),
        })),
    }));
  }

  async save(userId: string, payload: CnpjDasSaveInput) {
    const allCalculations = await calculatePreview(payload);
    const selected = new Set(payload.competenciasSelecionadas);
    const calculations = allCalculations.filter((item) => selected.has(item.competencia.slice(0, 7)));
    if (calculations.length === 0) throw new Error("Nenhuma competência válida foi selecionada.");
    const normalizedCnpj = normalizeCnpj(payload.cnpj);

    return this.database.transaction(async (transaction: any) => {
      let [company] = await transaction
        .select()
        .from(cnpjs)
        .where(and(eq(cnpjs.userId, userId), eq(cnpjs.cnpj, normalizedCnpj)));

      if (!company) {
        const [person] = await transaction.insert(pessoas).values({
          userId,
          nome: `Receita Federal · DAS MEI · ${payload.nome}`,
          tipo: "eu_devo",
          observacao: `Credor fiscal vinculado ao CNPJ ${normalizedCnpj}.`,
        }).returning();
        [company] = await transaction.insert(cnpjs).values({
          userId,
          pessoaId: person.id,
          cnpj: normalizedCnpj,
          nome: payload.nome,
          regime: "mei",
          atividadeMei: payload.atividade,
        }).returning();
      } else {
        [company] = await transaction.update(cnpjs).set({
          nome: payload.nome,
          atividadeMei: payload.atividade,
          updatedAt: new Date(),
        }).where(and(eq(cnpjs.id, company.id), eq(cnpjs.userId, userId))).returning();
        await transaction.update(pessoas).set({
          nome: `Receita Federal · DAS MEI · ${payload.nome}`,
          observacao: `Credor fiscal vinculado ao CNPJ ${normalizedCnpj}.`,
        }).where(and(eq(pessoas.id, company.pessoaId), eq(pessoas.userId, userId)));
      }

      let skippedPaid = 0;
      const saved = [];
      for (const calculation of calculations) {
        const [existing] = await transaction
          .select({ obligation: cnpjDasObrigacoes, debt: dividas })
          .from(cnpjDasObrigacoes)
          .innerJoin(dividas, eq(dividas.id, cnpjDasObrigacoes.dividaId))
          .where(and(
            eq(cnpjDasObrigacoes.cnpjId, company.id),
            eq(cnpjDasObrigacoes.competencia, calculation.competencia),
          ));

        if (existing?.debt.status === "pago") {
          skippedPaid += 1;
          continue;
        }

        let debtId = existing?.debt.id;
        if (debtId) {
          await transaction.update(dividas).set({
            valor: calculation.total.toFixed(2),
            valorTotal: calculation.total.toFixed(2),
            dataVencimento: calculation.dueDate,
            descricao: debtDescription(calculation),
            origem: "cnpj_das",
            deletedAt: null,
          }).where(and(eq(dividas.id, debtId), eq(dividas.userId, userId)));
        } else {
          const [debt] = await transaction.insert(dividas).values({
            userId,
            pessoaId: company.pessoaId,
            tipo: "pagar",
            valor: calculation.total.toFixed(2),
            valorTotal: calculation.total.toFixed(2),
            dataVencimento: calculation.dueDate,
            status: "pendente",
            descricao: debtDescription(calculation),
            origem: "cnpj_das",
          }).returning();
          debtId = debt.id;
        }

        const obligationValues = {
          userId,
          cnpjId: company.id,
          dividaId: debtId,
          competencia: calculation.competencia,
          dataVencimento: calculation.dueDate,
          dataCalculo: calculation.calculationDate,
          principal: calculation.principal.toFixed(2),
          multaPercentual: calculation.finePercentage.toFixed(4),
          multaValor: calculation.fineAmount.toFixed(2),
          jurosPercentual: calculation.interestPercentage.toFixed(4),
          jurosValor: calculation.interestAmount.toFixed(2),
          total: calculation.total.toFixed(2),
          beneficioInss: calculation.beneficioInss,
          principalManual: calculation.principalManual,
          vencimentoManual: calculation.dueDateManual,
          selicSnapshot: calculation.selicSnapshot,
        };

        let obligation;
        if (existing) {
          [obligation] = await transaction.update(cnpjDasObrigacoes).set({
            ...obligationValues,
            updatedAt: new Date(),
          }).where(eq(cnpjDasObrigacoes.id, existing.obligation.id)).returning();
        } else {
          [obligation] = await transaction.insert(cnpjDasObrigacoes).values(obligationValues).returning();
        }

        await transaction.insert(cnpjDasCalculos).values({
          userId,
          obrigacaoId: obligation.id,
          dataCalculo: calculation.calculationDate,
          principal: calculation.principal.toFixed(2),
          multaPercentual: calculation.finePercentage.toFixed(4),
          multaValor: calculation.fineAmount.toFixed(2),
          jurosPercentual: calculation.interestPercentage.toFixed(4),
          jurosValor: calculation.interestAmount.toFixed(2),
          total: calculation.total.toFixed(2),
          selicSnapshot: calculation.selicSnapshot,
        });
        saved.push(obligation);
      }

      return { company, obligations: saved, skippedPaid };
    });
  }

  async recalculate(userId: string, companyId: string, calculationDate: string) {
    const [company] = await this.database.select().from(cnpjs).where(and(eq(cnpjs.id, companyId), eq(cnpjs.userId, userId))) as Cnpj[];
    if (!company) return null;

    const currentRows = await this.database
      .select({ obligation: cnpjDasObrigacoes, debt: dividas })
      .from(cnpjDasObrigacoes)
      .innerJoin(dividas, eq(dividas.id, cnpjDasObrigacoes.dividaId))
      .where(and(eq(cnpjDasObrigacoes.cnpjId, companyId), eq(cnpjDasObrigacoes.userId, userId))) as Array<{
        obligation: CnpjDasObrigacao;
        debt: Divida;
      }>;
    const openRows = currentRows.filter((row) => row.debt.status !== "pago");
    const requiredMonths = openRows.flatMap((row) => requiredSelicMonths(row.obligation.dataVencimento, calculationDate));
    const selicRates = await loadSelicRates(requiredMonths);
    const calculations = openRows.map((row) => ({
      row,
      calculation: calculateDasMei({
        competencia: row.obligation.competencia,
        activity: company.atividadeMei as MeiActivity,
        requestedCalculationDate: calculationDate,
        selicRates,
        override: {
          principal: row.obligation.principalManual ? Number(row.obligation.principal) : null,
          dueDate: row.obligation.vencimentoManual ? row.obligation.dataVencimento : null,
          beneficioInss: row.obligation.beneficioInss,
        },
      }),
    }));

    await this.database.transaction(async (transaction: any) => {
      for (const { row, calculation } of calculations) {
        await transaction.update(dividas).set({
          valor: calculation.total.toFixed(2),
          valorTotal: calculation.total.toFixed(2),
          descricao: debtDescription(calculation),
        }).where(and(eq(dividas.id, row.debt.id), eq(dividas.userId, userId)));
        await transaction.update(cnpjDasObrigacoes).set({
          dataCalculo: calculation.calculationDate,
          multaPercentual: calculation.finePercentage.toFixed(4),
          multaValor: calculation.fineAmount.toFixed(2),
          jurosPercentual: calculation.interestPercentage.toFixed(4),
          jurosValor: calculation.interestAmount.toFixed(2),
          total: calculation.total.toFixed(2),
          selicSnapshot: calculation.selicSnapshot,
          updatedAt: new Date(),
        }).where(eq(cnpjDasObrigacoes.id, row.obligation.id));
        await transaction.insert(cnpjDasCalculos).values({
          userId,
          obrigacaoId: row.obligation.id,
          dataCalculo: calculation.calculationDate,
          principal: calculation.principal.toFixed(2),
          multaPercentual: calculation.finePercentage.toFixed(4),
          multaValor: calculation.fineAmount.toFixed(2),
          jurosPercentual: calculation.interestPercentage.toFixed(4),
          jurosValor: calculation.interestAmount.toFixed(2),
          total: calculation.total.toFixed(2),
          selicSnapshot: calculation.selicSnapshot,
        });
      }
    });

    return { updated: calculations.length, skippedPaid: currentRows.length - openRows.length };
  }
}
