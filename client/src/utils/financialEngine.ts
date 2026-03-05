import { format, subMonths, differenceInDays, parseISO } from "date-fns";
import type { Divida, Servico, Cartao, CompraCartao, Renda } from "@shared/schema";

export interface FinancialScore {
  valor: number;
  classificacao: "Otima" | "Boa" | "Atencao" | "Risco";
  tendencia: "melhorando" | "estavel" | "piorando";
  fatores: { label: string; impacto: number; tipo: "positivo" | "negativo" | "neutro" }[];
}

export interface MonthlySnapshot {
  mes: string;
  label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  dividasQuitadas: number;
  dividasPendentes: number;
}

export interface Insight {
  tipo: "positivo" | "negativo" | "neutro";
  texto: string;
  icone: string;
}

export function calcularScore(
  dividas: Divida[],
  servicos: Servico[],
  cartoes: Cartao[],
  compras: CompraCartao[],
  rendas: Renda[] = []
): FinancialScore {
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

  const totalRenda = rendas.filter((r) => r.ativo).reduce((s, r) => s + Number(r.valor), 0);
  const totalReceber = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);
  const totalPagar = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);
  const totalServicos = servicos.filter((s) => s.status === "ativo").reduce((s, sv) => s + Number(sv.valorMensal), 0);
  const totalCartoes = compras.reduce((s, c) => s + Number(c.valorParcela), 0);

  const entradas = totalRenda + totalReceber;
  const saidas = totalPagar + totalServicos + totalCartoes;
  const saldo = entradas - saidas;

  if (totalRenda > 0) {
    const bonus = Math.min(Math.round(totalRenda / 1000) * 2, 10);
    score += bonus;
    fatores.push({ label: `Renda mensal cadastrada (${rendas.filter((r) => r.ativo).length} fonte(s))`, impacto: +bonus, tipo: "positivo" });
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
    const usado = compras.filter((c) => c.cartaoId === cartao.id).reduce((s, c) => s + Number(c.valorParcela), 0);
    const pct = Number(cartao.limite) > 0 ? (usado / Number(cartao.limite)) * 100 : 0;
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

  const tendencia: FinancialScore["tendencia"] = vencidas.length > 2 ? "piorando" : saldo > 0 ? "melhorando" : "estavel";

  return { valor: score, classificacao, tendencia, fatores };
}

export function gerarHistoricoMensal(
  dividas: Divida[],
  servicos: Servico[],
  meses: number = 6,
  rendas: Renda[] = []
): MonthlySnapshot[] {
  const now = new Date();
  const servicosMensais = servicos.filter((s) => s.status === "ativo").reduce((s, sv) => s + Number(sv.valorMensal), 0);
  const rendaMensal = rendas.filter((r) => r.ativo).reduce((s, r) => s + Number(r.valor), 0);

  return Array.from({ length: meses }, (_, i) => {
    const data = subMonths(now, meses - 1 - i);
    const mes = format(data, "yyyy-MM");
    const label = format(data, "MMM/yy");

    const receitasDividas = dividas
      .filter((d) => d.tipo === "receber" && (d.dataPagamento || d.dataVencimento || "").startsWith(mes))
      .reduce((s, d) => s + Number(d.valor), 0);

    const despesasDividas = dividas
      .filter((d) => d.tipo === "pagar" && (d.dataPagamento || d.dataVencimento || "").startsWith(mes))
      .reduce((s, d) => s + Number(d.valor), 0);

    const receitasMes = receitasDividas + rendaMensal;
    const despesasMes = despesasDividas + servicosMensais;

    const dividasQuitadas = dividas.filter((d) => d.status === "pago" && (d.dataPagamento || "").startsWith(mes)).length;
    const dividasPendentes = dividas.filter((d) => d.status === "pendente" && (d.dataVencimento || "").startsWith(mes)).length;

    return {
      mes,
      label,
      receitas: Math.round(receitasMes * 100) / 100,
      despesas: Math.round(despesasMes * 100) / 100,
      saldo: Math.round((receitasMes - despesasMes) * 100) / 100,
      dividasQuitadas,
      dividasPendentes,
    };
  });
}

export function gerarInsights(
  dividas: Divida[],
  servicos: Servico[],
  cartoes: Cartao[],
  compras: CompraCartao[],
  rendas: Renda[] = []
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(subMonths(now, 1), "yyyy-MM");
  const today = format(now, "yyyy-MM-dd");
  const in30 = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");

  const totalRenda = rendas.filter((r) => r.ativo).reduce((s, r) => s + Number(r.valor), 0);
  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const totalServicos = servicosAtivos.reduce((s, sv) => s + Number(sv.valorMensal), 0);
  const totalCartoes = compras.reduce((s, c) => s + Number(c.valorParcela), 0);
  const totalPagar = dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const totalReceber = dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);

  const entradas = totalRenda + totalReceber;
  const saidas = totalPagar + totalServicos + totalCartoes;
  const saldo = entradas - saidas;

  const pagosMes = dividas.filter((d) => d.status === "pago" && (d.dataPagamento || "").startsWith(currentMonth)).length;
  const pagosMesAnterior = dividas.filter((d) => d.status === "pago" && (d.dataPagamento || "").startsWith(prevMonth)).length;
  if (pagosMes > 0 && pagosMes > pagosMesAnterior) {
    insights.push({ tipo: "positivo", texto: `Voce quitou ${pagosMes} divida(s) este mes — mais que no mes anterior!`, icone: "trophy" });
  }

  const vencidas = dividas.filter((d) => d.status === "pendente" && d.dataVencimento && d.dataVencimento < today);
  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, d) => s + Number(d.valor), 0);
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
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento && d.dataVencimento >= today && d.dataVencimento <= in30)
    .reduce((s, d) => s + Number(d.valor), 0);
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
    const usado = compras.filter((c) => c.cartaoId === cartao.id).reduce((s, c) => s + Number(c.valorParcela), 0);
    const pct = Number(cartao.limite) > 0 ? (usado / Number(cartao.limite)) * 100 : 0;
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
      texto: `Mantendo o ritmo atual, seu saldo permanece negativo. Reduza despesas ou aumente receitas.`,
      icone: "trend",
    });
  } else if (saldo > 1000) {
    insights.push({
      tipo: "positivo",
      texto: `Excelente! Saldo previsto de R$ ${saldo.toFixed(2).replace(".", ",")} — considere criar uma meta de economia`,
      icone: "star",
    });
  }

  return insights.slice(0, 5);
}
