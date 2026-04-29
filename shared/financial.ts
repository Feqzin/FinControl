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
  acao?: {
    tipo: "abrir_dividas" | "abrir_cartao" | "abrir_servicos" | "abrir_previsao" | "abrir_metas";
    label: string;
    path: string;
    entidadeTipo?: "divida" | "cartao" | "servico" | "meta" | "previsao";
    entidadeId?: string;
    filtros?: Record<string, string>;
  };
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
