import {
  differenceInCalendarMonths,
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import type { ReportsOverviewResponse } from "../../shared/reports";
import { parseMoney } from "../../utils/money";
import type { FinancialRepository } from "../repositories/financial.repository";
import { FinancialService } from "./financial.service";
import { MAX_REPORT_MONTHS, type ReportsOverviewQueryInput } from "../validators/reports.validators";

type IsoPeriod = {
  startDate: string;
  endDate: string;
};

function toMoneyNumber(value: string | number | null | undefined): number {
  return parseMoney(value) ?? 0;
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

    const [rendas, patrimonios, comprasCartao, cartoes, servicos, dividas, pessoas, cardSummaries] =
      await Promise.all([
        this.repository.getRendas(userId),
        this.repository.getPatrimonios(userId),
        this.repository.getComprasCartao(userId),
        this.repository.getCartoes(userId),
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

    const incomeTotal = activeRendas.reduce((sum, item) => sum + toMoneyNumber(item.valor), 0) * monthsInPeriod;
    const totalCartoesNoPeriodo = periodComprasCartao.reduce((sum, item) => sum + toMoneyNumber(item.valorParcela), 0);
    const dividasAPagar = periodDividas
      .filter((item) => item.tipo === "pagar" && item.status === "pendente")
      .reduce((sum, item) => sum + toMoneyNumber(item.valor), 0);
    const valoresAReceber = periodDividas
      .filter((item) => item.tipo === "receber" && item.status === "pendente")
      .reduce((sum, item) => sum + toMoneyNumber(item.valor), 0);

    const servicosAtivosTotal = activeServicos.reduce((sum, item) => sum + toMoneyNumber(item.valorMensal), 0);
    const gastosFixos = servicosAtivosTotal * monthsInPeriod;
    const patrimonioTotal = patrimonios.reduce((sum, item) => sum + toMoneyNumber(item.valorAtual), 0);

    const cartoesFaturaAtualTotal = cardSummaries.reduce((sum, item) => sum + item.faturaAtual, 0);
    const cartoesLimiteComprometidoTotal = cardSummaries.reduce((sum, item) => sum + item.limiteComprometido, 0);

    const expenseTotal = totalCartoesNoPeriodo + dividasAPagar + gastosFixos;
    const balance = incomeTotal - expenseTotal;

    return {
      period,
      summary: {
        incomeTotal,
        expenseTotal,
        balance,
        patrimonioTotal,
        dividasAPagar,
        valoresAReceber,
        gastosFixos,
        servicosAtivosTotal,
        cartoesFaturaAtualTotal,
        cartoesLimiteComprometidoTotal,
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
