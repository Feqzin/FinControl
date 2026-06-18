import {
  addMonths,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  isAfter,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import type { ReportsOverviewResponse } from "../../shared/reports.js";
import {
  calculateServicoEquivalentMonthlyAmount,
  calculateServicoRealChargeForCompetency,
  isServicoLinkedToCardCharge,
} from "../../shared/servico-periodicidade.js";
import { buildCardInvoiceSnapshots } from "../../shared/card-invoice-payments.js";
import { parseMoney } from "../../utils/money.js";
import type { FinancialRepository } from "../repositories/financial.repository.js";
import { FinancialService } from "./financial.service.js";
import { getCardObligations } from "./financial-card-analytics.js";
import { MAX_REPORT_MONTHS, type ReportsOverviewQueryInput } from "../validators/reports.validators.js";

type IsoPeriod = {
  startDate: string;
  endDate: string;
};

function toMoneyNumber(value: string | number | null | undefined): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return parseMoney(String(Math.round(value * 100) / 100)) ?? 0;
}

function listCompetenciesInPeriod(startDateIso: string, endDateIso: string): string[] {
  try {
    const start = startOfMonth(parseISO(startDateIso));
    const end = startOfMonth(parseISO(endDateIso));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || isAfter(start, end)) return [];

    const competencies: string[] = [];
    let cursor = start;
    while (!isAfter(cursor, end)) {
      competencies.push(format(cursor, "yyyy-MM"));
      cursor = addMonths(cursor, 1);
    }
    return competencies;
  } catch {
    return [];
  }
}

function resolveReportPeriod(query: ReportsOverviewQueryInput): IsoPeriod {
  const now = new Date();

  if (!query.startDate && !query.endDate) {
    return {
      startDate: format(startOfMonth(now), "yyyy-MM-dd"),
      endDate: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }

  if (query.startDate && !query.endDate) {
    const start = parseISO(query.startDate);
    return {
      startDate: query.startDate,
      endDate: format(endOfMonth(start), "yyyy-MM-dd"),
    };
  }

  if (!query.startDate && query.endDate) {
    const end = parseISO(query.endDate);
    return {
      startDate: format(startOfMonth(end), "yyyy-MM-dd"),
      endDate: query.endDate,
    };
  }

  return {
    startDate: query.startDate!,
    endDate: query.endDate!,
  };
}

function assertPeriodRules(period: IsoPeriod): void {
  const start = parseISO(period.startDate);
  const end = parseISO(period.endDate);
  if (end < start) {
    throw new Error("endDate não pode ser menor que startDate");
  }

  const monthsSpan = differenceInCalendarMonths(end, start) + 1;
  if (monthsSpan > MAX_REPORT_MONTHS) {
    throw new Error(`Período máximo permitido é de ${MAX_REPORT_MONTHS} meses`);
  }
}

export class ReportsService {
  private readonly financialService: FinancialService;

  constructor(private readonly repository: FinancialRepository) {
    this.financialService = new FinancialService(repository);
  }

  async getOverview(userId: string, query: ReportsOverviewQueryInput): Promise<ReportsOverviewResponse> {
    const period = resolveReportPeriod(query);
    assertPeriodRules(period);

    const [rendas, patrimonios, comprasCartao, cartoes, parcelasCompra, cartaoFaturaPagamentos, servicos, dividas, pessoas, cardSummaries] =
      await Promise.all([
        this.repository.getRendas(userId),
        this.repository.getPatrimonios(userId),
        this.repository.getComprasCartao(userId),
        this.repository.getCartoes(userId),
        this.repository.getParcelasCompraByUser(userId),
        this.repository.getCartaoFaturaPagamentos(userId),
        this.repository.getServicos(userId),
        this.repository.getDividas(userId),
        this.repository.getPessoas(userId),
        this.financialService.getCardSummaries(userId),
      ]);

    const start = parseISO(period.startDate);
    const end = parseISO(period.endDate);
    const monthsInPeriod = Math.max(1, differenceInCalendarMonths(end, start) + 1);

    const isInPeriod = (isoDate: string | null | undefined) => {
      if (!isoDate) return false;
      try {
        const parsed = parseISO(isoDate);
        return isWithinInterval(parsed, { start, end });
      } catch {
        return false;
      }
    };

    const periodComprasCartao = comprasCartao.filter((item) => isInPeriod(item.dataCompra));
    const periodDividas = dividas.filter((item) => isInPeriod(item.dataVencimento));

    const activeRendas = rendas.filter((item) => item.ativo);
    const activeServicos = servicos.filter((item) => item.status === "ativo");
    const competencies = listCompetenciesInPeriod(period.startDate, period.endDate);

    const incomeTotal = activeRendas.reduce((sum, item) => sum + toMoneyNumber(item.valor), 0) * monthsInPeriod;
    const dueDayByCardId = new Map(cartoes.map((cartao) => [cartao.id, cartao.diaVencimento]));
    const cardSnapshots = buildCardInvoiceSnapshots({
      installments: getCardObligations({ compras: comprasCartao, parcelasCompra }).map((obligation) => ({
        cartaoId: obligation.cartaoId,
        valor: obligation.valor,
        statusCartao: obligation.statusCartao,
        dataVencimento: obligation.dataVencimento,
      })),
      payments: cartaoFaturaPagamentos,
      getDueDayForCard: (cartaoId) => dueDayByCardId.get(cartaoId) ?? null,
    });
    const totalCartoesNoPeriodo = cardSnapshots
      .filter((snapshot) => competencies.includes(snapshot.monthReference))
      .reduce((sum, snapshot) => sum + snapshot.remainingAmount, 0);
    const dividasAPagar = periodDividas
      .filter((item) => item.tipo === "pagar" && item.status === "pendente")
      .reduce((sum, item) => sum + toMoneyNumber(item.valor), 0);
    const valoresAReceber = periodDividas
      .filter((item) => item.tipo === "receber" && item.status === "pendente")
      .reduce((sum, item) => sum + toMoneyNumber(item.valor), 0);

    const servicosEquivalenteMensalTotal = activeServicos.reduce(
      (sum, item) => sum + calculateServicoEquivalentMonthlyAmount(item),
      0,
    );
    const servicosVinculadosCartaoEquivalenteMensalTotal = activeServicos
      .filter((item) => isServicoLinkedToCardCharge(item))
      .reduce((sum, item) => sum + calculateServicoEquivalentMonthlyAmount(item), 0);
    const servicosNaoVinculadosCartaoEquivalenteMensalTotal = activeServicos
      .filter((item) => !isServicoLinkedToCardCharge(item))
      .reduce((sum, item) => sum + calculateServicoEquivalentMonthlyAmount(item), 0);
    const servicosCobrancaRealPeriodoTotal = activeServicos.reduce((sum, item) => (
      sum + competencies.reduce((acc, competency) => acc + calculateServicoRealChargeForCompetency(item, competency), 0)
    ), 0);
    const servicosVinculadosCartaoCobrancaRealPeriodoTotal = activeServicos
      .filter((item) => isServicoLinkedToCardCharge(item))
      .reduce((sum, item) => (
        sum + competencies.reduce((acc, competency) => acc + calculateServicoRealChargeForCompetency(item, competency), 0)
      ), 0);
    const servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal = activeServicos
      .filter((item) => !isServicoLinkedToCardCharge(item))
      .reduce((sum, item) => (
        sum + competencies.reduce((acc, competency) => acc + calculateServicoRealChargeForCompetency(item, competency), 0)
      ), 0);
    const gastosFixos = servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal;
    const servicosAtivosTotal = servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal;
    const patrimonioTotal = patrimonios.reduce((sum, item) => sum + toMoneyNumber(item.valorAtual), 0);

    const cartoesFaturaAtualTotal = cardSummaries.reduce((sum, item) => sum + item.faturaAtual, 0);
    const cartoesLimiteComprometidoTotal = cardSummaries.reduce((sum, item) => sum + item.limiteComprometido, 0);

    const expenseTotal = totalCartoesNoPeriodo + dividasAPagar + gastosFixos;
    const balance = incomeTotal - expenseTotal;

    return {
      period,
      summary: {
        incomeTotal: round2(incomeTotal),
        expenseTotal: round2(expenseTotal),
        balance: round2(balance),
        patrimonioTotal: round2(patrimonioTotal),
        dividasAPagar: round2(dividasAPagar),
        valoresAReceber: round2(valoresAReceber),
        gastosFixos: round2(gastosFixos),
        servicosAtivosTotal: round2(servicosAtivosTotal),
        servicosEquivalenteMensalTotal: round2(servicosEquivalenteMensalTotal),
        servicosCobrancaRealPeriodoTotal: round2(servicosCobrancaRealPeriodoTotal),
        servicosVinculadosCartaoEquivalenteMensalTotal: round2(servicosVinculadosCartaoEquivalenteMensalTotal),
        servicosVinculadosCartaoCobrancaRealPeriodoTotal: round2(servicosVinculadosCartaoCobrancaRealPeriodoTotal),
        servicosNaoVinculadosCartaoEquivalenteMensalTotal: round2(servicosNaoVinculadosCartaoEquivalenteMensalTotal),
        servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal: round2(servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal),
        cartoesFaturaAtualTotal: round2(cartoesFaturaAtualTotal),
        cartoesLimiteComprometidoTotal: round2(cartoesLimiteComprometidoTotal),
      },
      sections: {
        // Rendas não possuem data de referência no schema atual.
        // Mantemos o comportamento incremental retornando todas as rendas do usuário.
        rendas,
        patrimonios,
        dividas: periodDividas,
        pessoas,
        cartoes,
        comprasCartao: periodComprasCartao,
        servicos,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
