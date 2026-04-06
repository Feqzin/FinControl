import { format } from "date-fns";
import type { Cartao, CompraCartao, Divida, Parcela, Renda, Servico } from "@shared/schema";
import type { FinancialInsight, FinancialScore, FinancialSummary } from "@shared/financial";
import type { FinancialRepository } from "../repositories/financial.repository";

type FinancialContext = {
  dividas: Divida[];
  parcelas: Parcela[];
  servicos: Servico[];
  cartoes: Cartao[];
  compras: CompraCartao[];
  rendas: Renda[];
};

export type ScoreSimulationInput = {
  quitarDivida?: number;
  reducaoDespesas?: number;
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveMonthReference(input?: string): string {
  if (input && /^\d{4}-\d{2}$/.test(input)) return input;
  return format(new Date(), "yyyy-MM");
}

function calculateCartoesForMonth(compras: CompraCartao[], monthRef: string): number {
  const [selYearN, selMonthN] = monthRef.split("-").map(Number);

  return compras.reduce((sum, compra) => {
    const [compraYear, compraMonth] = String(compra.dataCompra || "")
      .split("-")
      .slice(0, 2)
      .map(Number);

    if (!Number.isFinite(compraYear) || !Number.isFinite(compraMonth)) return sum;

    const monthOffset = (selYearN - compraYear) * 12 + (selMonthN - compraMonth);
    if (monthOffset >= 0 && monthOffset < toNumber(compra.parcelas)) {
      return sum + toNumber(compra.valorParcela);
    }

    return sum;
  }, 0);
}

function calculateScoreFromContext({
  dividas,
  servicos,
  cartoes,
  compras,
  rendas,
}: Pick<FinancialContext, "dividas" | "servicos" | "cartoes" | "compras" | "rendas">): FinancialScore {
  const today = format(new Date(), "yyyy-MM-dd");
  const fatores: FinancialScore["fatores"] = [];

  let score = 60;

  const vencidas = dividas.filter((d) => d.status === "pendente" && d.dataVencimento && d.dataVencimento < today);
  if (vencidas.length === 0) {
    score += 15;
    fatores.push({ label: "Sem dividas vencidas", impacto: +15, tipo: "positivo" });
  } else {
    const penalidade = Math.min(vencidas.length * 8, 30);
    score -= penalidade;
    fatores.push({ label: `${vencidas.length} divida(s) vencida(s)`, impacto: -penalidade, tipo: "negativo" });
  }

  const totalRenda = rendas.filter((r) => r.ativo).reduce((s, r) => s + toNumber(r.valor), 0);
  const totalReceber = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente")
    .reduce((s, d) => s + toNumber(d.valor), 0);
  const totalPagar = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente")
    .reduce((s, d) => s + toNumber(d.valor), 0);
  const totalServicos = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + toNumber(sv.valorMensal), 0);
  const totalCartoes = compras.reduce((s, c) => s + toNumber(c.valorParcela), 0);

  const entradas = totalRenda + totalReceber;
  const saidas = totalPagar + totalServicos + totalCartoes;
  const saldo = entradas - saidas;

  if (totalRenda > 0) {
    const bonus = Math.min(Math.round(totalRenda / 1000) * 2, 10);
    score += bonus;
    fatores.push({
      label: `Renda mensal cadastrada (${rendas.filter((r) => r.ativo).length} fonte(s))`,
      impacto: +bonus,
      tipo: "positivo",
    });
  }

  if (saldo > 0) {
    const bonus = Math.min(Math.round(saldo / 500), 10);
    score += bonus;
    fatores.push({ label: "Saldo mensal positivo", impacto: +bonus, tipo: "positivo" });
  } else if (saldo < 0) {
    score -= 20;
    fatores.push({ label: "Saldo mensal negativo", impacto: -20, tipo: "negativo" });
  }

  if (totalRenda > 0 && saidas > 0) {
    const comprometimento = (saidas / entradas) * 100;
    if (comprometimento < 50) {
      score += 5;
      fatores.push({ label: `${Math.round(comprometimento)}% da renda comprometida`, impacto: +5, tipo: "positivo" });
    } else if (comprometimento > 90) {
      score -= 10;
      fatores.push({ label: `${Math.round(comprometimento)}% da renda comprometida`, impacto: -10, tipo: "negativo" });
    }
  }

  const cardPenalidades: string[] = [];
  let totalCardPenalty = 0;
  for (const cartao of cartoes) {
    const usado = compras.filter((c) => c.cartaoId === cartao.id).reduce((s, c) => s + toNumber(c.valorParcela), 0);
    const limite = toNumber(cartao.limite);
    const pct = limite > 0 ? (usado / limite) * 100 : 0;
    if (pct >= 80) {
      totalCardPenalty += 10;
      cardPenalidades.push(`${cartao.nome} ${Math.round(pct)}%`);
    } else if (pct >= 60) {
      totalCardPenalty += 5;
    } else if (pct < 30 && pct > 0) {
      score += 3;
    }
  }
  if (totalCardPenalty > 0) {
    const pen = Math.min(totalCardPenalty, 20);
    score -= pen;
    fatores.push({ label: `Uso elevado: ${cardPenalidades.join(", ")}`, impacto: -pen, tipo: "negativo" });
  } else if (cartoes.length > 0) {
    fatores.push({ label: "Uso de cartao saudavel", impacto: +3, tipo: "positivo" });
  }

  const pagas = dividas.filter((d) => d.status === "pago").length;
  const total = dividas.length;
  if (total > 0 && pagas / total >= 0.5) {
    score += 5;
    fatores.push({ label: "Bom historico de quitacao", impacto: +5, tipo: "positivo" });
  }

  score = Math.max(0, Math.min(100, score));

  let classificacao: FinancialScore["classificacao"];
  if (score >= 80) classificacao = "Otima";
  else if (score >= 60) classificacao = "Boa";
  else if (score >= 40) classificacao = "Atencao";
  else classificacao = "Risco";

  const tendencia: FinancialScore["tendencia"] =
    vencidas.length > 2 ? "piorando" : saldo > 0 ? "melhorando" : "estavel";

  return { valor: score, classificacao, tendencia, fatores };
}

function generateInsightsFromContext({
  dividas,
  servicos,
  cartoes,
  compras,
  rendas,
}: Pick<FinancialContext, "dividas" | "servicos" | "cartoes" | "compras" | "rendas">): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), "yyyy-MM");
  const today = format(now, "yyyy-MM-dd");
  const in30 = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");

  const totalRenda = rendas.filter((r) => r.ativo).reduce((s, r) => s + toNumber(r.valor), 0);
  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const totalServicos = servicosAtivos.reduce((s, sv) => s + toNumber(sv.valorMensal), 0);
  const totalCartoes = compras.reduce((s, c) => s + toNumber(c.valorParcela), 0);
  const totalPagar = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente")
    .reduce((s, d) => s + toNumber(d.valor), 0);
  const totalReceber = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente")
    .reduce((s, d) => s + toNumber(d.valor), 0);

  const entradas = totalRenda + totalReceber;
  const saidas = totalPagar + totalServicos + totalCartoes;
  const saldo = entradas - saidas;

  const pagosMes = dividas.filter((d) => d.status === "pago" && String(d.dataPagamento || "").startsWith(currentMonth)).length;
  const pagosMesAnterior = dividas.filter((d) => d.status === "pago" && String(d.dataPagamento || "").startsWith(prevMonth)).length;
  if (pagosMes > 0 && pagosMes > pagosMesAnterior) {
    insights.push({ tipo: "positivo", texto: `Voce quitou ${pagosMes} divida(s) este mes - mais que no mes anterior!`, icone: "trophy" });
  }

  const vencidas = dividas.filter((d) => d.status === "pendente" && d.dataVencimento && d.dataVencimento < today);
  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, d) => s + toNumber(d.valor), 0);
    insights.push({
      tipo: "negativo",
      texto: `Voce tem ${vencidas.length} divida(s) vencida(s) totalizando R$ ${total.toFixed(2).replace(".", ",")}`,
      icone: "alert",
    });
  }

  if (totalRenda > 0 && saidas > 0) {
    const comprometimento = (saidas / (entradas || 1)) * 100;
    if (comprometimento > 80) {
      insights.push({
        tipo: "negativo",
        texto: `Atencao: ${Math.round(comprometimento)}% da sua renda esta comprometida com despesas`,
        icone: "alert",
      });
    } else if (comprometimento < 50 && entradas > 0) {
      insights.push({
        tipo: "positivo",
        texto: `Otimo! Apenas ${Math.round(comprometimento)}% da sua renda esta comprometida`,
        icone: "star",
      });
    }
  }

  const receber30 = dividas
    .filter((d) =>
      d.tipo === "receber"
      && d.status === "pendente"
      && d.dataVencimento
      && d.dataVencimento >= today
      && d.dataVencimento <= in30,
    )
    .reduce((s, d) => s + toNumber(d.valor), 0);
  if (receber30 > 0) {
    insights.push({
      tipo: "positivo",
      texto: `Voce tem R$ ${receber30.toFixed(2).replace(".", ",")} a receber nos proximos 30 dias`,
      icone: "money",
    });
  }

  if (totalServicos > 300) {
    insights.push({
      tipo: "negativo",
      texto: `Seus gastos com servicos/assinaturas sao R$ ${totalServicos.toFixed(2).replace(".", ",")} por mes`,
      icone: "repeat",
    });
  } else if (servicosAtivos.length > 0) {
    insights.push({
      tipo: "neutro",
      texto: `Voce tem ${servicosAtivos.length} servico(s) ativo(s) custando R$ ${totalServicos.toFixed(2).replace(".", ",")} mensais`,
      icone: "repeat",
    });
  }

  for (const cartao of cartoes) {
    const usado = compras.filter((c) => c.cartaoId === cartao.id).reduce((s, c) => s + toNumber(c.valorParcela), 0);
    const limite = toNumber(cartao.limite);
    const pct = limite > 0 ? (usado / limite) * 100 : 0;
    if (pct >= 80) {
      insights.push({
        tipo: "negativo",
        texto: `Cartao ${cartao.nome} com ${Math.round(pct)}% do limite comprometido`,
        icone: "card",
      });
    }
  }

  if (saldo < 0) {
    insights.push({
      tipo: "negativo",
      texto: "Mantendo o ritmo atual, seu saldo permanece negativo. Reduza despesas ou aumente receitas.",
      icone: "trend",
    });
  } else if (saldo > 1000) {
    insights.push({
      tipo: "positivo",
      texto: `Excelente! Saldo previsto de R$ ${saldo.toFixed(2).replace(".", ",")} - considere criar uma meta de economia`,
      icone: "star",
    });
  }

  return insights.slice(0, 5);
}

function applyScoreSimulation(
  context: FinancialContext,
  simulation?: ScoreSimulationInput,
): FinancialContext {
  if (!simulation) return context;

  const quitarDivida = Math.max(0, simulation.quitarDivida ?? 0);
  const reducaoDespesas = Math.max(0, simulation.reducaoDespesas ?? 0);

  if (quitarDivida === 0 && reducaoDespesas === 0) return context;

  let remainingQuitar = quitarDivida;
  const simulatedDividas = context.dividas.map((divida) => {
    if (divida.status === "pendente" && divida.tipo === "pagar" && remainingQuitar > 0) {
      const valor = toNumber(divida.valor);
      if (remainingQuitar >= valor) {
        remainingQuitar -= valor;
        return { ...divida, status: "pago" as const };
      }
    }
    return divida;
  });

  let remainingReducao = reducaoDespesas;
  const simulatedServicos = context.servicos.map((servico) => {
    if (servico.status === "ativo" && remainingReducao > 0) {
      const valor = toNumber(servico.valorMensal);
      if (remainingReducao >= valor) {
        remainingReducao -= valor;
        return { ...servico, valorMensal: "0" };
      }
    }
    return servico;
  });

  return {
    ...context,
    dividas: simulatedDividas,
    servicos: simulatedServicos,
  };
}

export class FinancialService {
  constructor(private readonly repository: FinancialRepository) {}

  private async loadContext(userId: string): Promise<FinancialContext> {
    const [dividas, parcelas, servicos, cartoes, compras, rendas] = await Promise.all([
      this.repository.getDividas(userId),
      this.repository.getParcelas(userId),
      this.repository.getServicos(userId),
      this.repository.getCartoes(userId),
      this.repository.getComprasCartao(userId),
      this.repository.getRendas(userId),
    ]);

    return { dividas, parcelas, servicos, cartoes, compras, rendas };
  }

  async getSummary(userId: string, monthReference?: string): Promise<FinancialSummary> {
    const ctx = await this.loadContext(userId);
    const mesReferencia = resolveMonthReference(monthReference);

    const totalRenda = ctx.rendas.filter((r) => r.ativo).reduce((s, r) => s + toNumber(r.valor), 0);
    const totalServicos = ctx.servicos.filter((s) => s.status === "ativo").reduce((s, sv) => s + toNumber(sv.valorMensal), 0);

    const totalReceberMes = ctx.dividas
      .filter((d) => d.tipo === "receber" && String(d.dataVencimento || "").startsWith(mesReferencia))
      .reduce((s, d) => s + toNumber(d.valor), 0);
    const totalPagarMes = ctx.dividas
      .filter((d) => d.tipo === "pagar" && String(d.dataVencimento || "").startsWith(mesReferencia))
      .reduce((s, d) => s + toNumber(d.valor), 0);

    const totalCartoesMes = calculateCartoesForMonth(ctx.compras, mesReferencia);
    const totalEntradas = totalRenda + totalReceberMes;
    const totalSaidas = totalPagarMes + totalServicos + totalCartoesMes;
    const saldo = totalEntradas - totalSaidas;

    const dividaTotal = ctx.dividas.reduce((s, d) => s + toNumber(d.valor), 0);
    const dividaTotalPendente = ctx.dividas.filter((d) => d.status === "pendente").reduce((s, d) => s + toNumber(d.valor), 0);
    const dividaTotalPaga = ctx.dividas.filter((d) => d.status === "pago").reduce((s, d) => s + toNumber(d.valor), 0);

    const parcelasPagas = ctx.parcelas.filter((p) => p.status === "pago");
    const parcelasPendentes = ctx.parcelas.filter((p) => p.status === "pendente");

    return {
      mesReferencia,
      totalEntradas: round2(totalEntradas),
      totalSaidas: round2(totalSaidas),
      saldo: round2(saldo),
      totalRenda: round2(totalRenda),
      totalReceberMes: round2(totalReceberMes),
      totalPagarMes: round2(totalPagarMes),
      totalServicos: round2(totalServicos),
      totalCartoesMes: round2(totalCartoesMes),
      dividaTotal: round2(dividaTotal),
      dividaTotalPendente: round2(dividaTotalPendente),
      dividaTotalPaga: round2(dividaTotalPaga),
      parcelas: {
        total: ctx.parcelas.length,
        pagas: parcelasPagas.length,
        pendentes: parcelasPendentes.length,
        valorPago: round2(parcelasPagas.reduce((s, p) => s + toNumber(p.valor), 0)),
        valorPendente: round2(parcelasPendentes.reduce((s, p) => s + toNumber(p.valor), 0)),
      },
    };
  }

  async getScore(userId: string, simulation?: ScoreSimulationInput): Promise<FinancialScore> {
    const ctx = await this.loadContext(userId);
    const simulated = applyScoreSimulation(ctx, simulation);
    return calculateScoreFromContext(simulated);
  }

  async getInsights(userId: string): Promise<FinancialInsight[]> {
    const ctx = await this.loadContext(userId);
    return generateInsightsFromContext(ctx);
  }
}
