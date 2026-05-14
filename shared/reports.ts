import type {
  Cartao,
  CompraCartao,
  Divida,
  Patrimonio,
  Pessoa,
  Renda,
  Servico,
} from "./schema";

export type ReportsOverviewPeriod = {
  startDate: string;
  endDate: string;
};

export type ReportsOverviewSummary = {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  patrimonioTotal: number;
  dividasAPagar: number;
  valoresAReceber: number;
  gastosFixos: number;
  servicosAtivosTotal: number;
  cartoesFaturaAtualTotal: number;
  cartoesLimiteComprometidoTotal: number;
};

export type ReportsOverviewSections = {
  rendas: Renda[];
  patrimonios: Patrimonio[];
  dividas: Divida[];
  pessoas: Pessoa[];
  cartoes: Cartao[];
  comprasCartao: CompraCartao[];
  servicos: Servico[];
};

export type ReportsOverviewResponse = {
  period: ReportsOverviewPeriod;
  summary: ReportsOverviewSummary;
  sections: ReportsOverviewSections;
  generatedAt: string;
};
