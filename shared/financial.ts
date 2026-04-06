export interface FinancialScoreFactor {
  label: string;
  impacto: number;
  tipo: "positivo" | "negativo" | "neutro";
}

export interface FinancialScore {
  valor: number;
  classificacao: "Otima" | "Boa" | "Atencao" | "Risco";
  tendencia: "melhorando" | "estavel" | "piorando";
  fatores: FinancialScoreFactor[];
}

export interface FinancialInsight {
  tipo: "positivo" | "negativo" | "neutro";
  texto: string;
  icone: string;
}

export interface FinancialSummary {
  mesReferencia: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalRenda: number;
  totalReceberMes: number;
  totalPagarMes: number;
  totalServicos: number;
  totalCartoesMes: number;
  dividaTotal: number;
  dividaTotalPendente: number;
  dividaTotalPaga: number;
  parcelas: {
    total: number;
    pagas: number;
    pendentes: number;
    valorPago: number;
    valorPendente: number;
  };
}
