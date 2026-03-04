import { format, subMonths, differenceInDays, parseISO } from "date-fns";
import type { Divida, Servico, Cartao, CompraCartao } from "@shared/schema";

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
  compras: CompraCartao[]
): FinancialScore {
  const today = format(new Date(), "yyyy-MM-dd");
  const fatores: FinancialScore["fatores"] = [];

  let score = 60;

  const vencidas = dividas.filter((d) => d.status === "pendente" && d.dataVencimento < today);
  if (vencidas.length === 0) {
    score += 15;
    fatores.push({ label: "Sem dividas vencidas", impacto: +15, tipo: "positivo" });
  } else {
    const penalidade = Math.min(vencidas.length * 8, 30);
    score -= penalidade;
    fatores.push({ label: `${vencidas.length} divida(s) vencida(s)`, impacto: -penalidade, tipo: "negativo" });
  }

  const totalReceber = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);
  const totalPagar = dividas
    .filter((d) => d.tipo === "pagar" && d.status === "pendente")
    .reduce((s, d) => s + Number(d.valor), 0);
  const totalServicos = servicos.filter((s) => s.status === "ativo").reduce((s, sv) => s + Number(sv.valorMensal), 0);
  const saldo = totalReceber - totalPagar - totalServicos;

  if (saldo > 0) {
    const bonus = Math.min(Math.round(saldo / 500), 15);
    score += bonus;
    fatores.push({ label: "Saldo previsto positivo", impacto: +bonus, tipo: "positivo" });
  } else if (saldo < 0) {
    score -= 20;
    fatores.push({ label: "Saldo previsto negativo", impacto: -20, tipo: "negativo" });
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
  meses: number = 6
): MonthlySnapshot[] {
  const now = new Date();
  const servicosMensais = servicos.filter((s) => s.status === "ativo").reduce((s, sv) => s + Number(sv.valorMensal), 0);

  return Array.from({ length: meses }, (_, i) => {
    const data = subMonths(now, meses - 1 - i);
    const mes = format(data, "yyyy-MM");
    const label = format(data, "MMM/yy");

    const receitasMes = dividas
      .filter((d) => d.tipo === "receber" && (d.dataPagamento || d.dataVencimento).startsWith(mes))
      .reduce((s, d) => s + Number(d.valor), 0);

    const despesasDividas = dividas
      .filter((d) => d.tipo === "pagar" && (d.dataPagamento || d.dataVencimento).startsWith(mes))
      .reduce((s, d) => s + Number(d.valor), 0);

    const despesasMes = despesasDividas + servicosMensais;

    const dividasQuitadas = dividas.filter((d) => d.status === "pago" && (d.dataPagamento || "").startsWith(mes)).length;
    const dividasPendentes = dividas.filter((d) => d.status === "pendente" && d.dataVencimento.startsWith(mes)).length;

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
  compras: CompraCartao[]
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(subMonths(now, 1), "yyyy-MM");
  const today = format(now, "yyyy-MM-dd");
  const in30 = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");

  const pagosMes = dividas.filter((d) => d.status === "pago" && (d.dataPagamento || "").startsWith(currentMonth)).length;
  const pagosMesAnterior = dividas.filter((d) => d.status === "pago" && (d.dataPagamento || "").startsWith(prevMonth)).length;
  if (pagosMes > 0 && pagosMes > pagosMesAnterior) {
    insights.push({ tipo: "positivo", texto: `Voce quitou ${pagosMes} divida(s) este mes — mais que no mes anterior!`, icone: "trophy" });
  }

  const vencidas = dividas.filter((d) => d.status === "pendente" && d.dataVencimento < today);
  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, d) => s + Number(d.valor), 0);
    insights.push({
      tipo: "negativo",
      texto: `Voce tem ${vencidas.length} divida(s) vencida(s) totalizando R$ ${total.toFixed(2).replace(".", ",")}`,
      icone: "alert",
    });
  }

  const receber30 = dividas
    .filter((d) => d.tipo === "receber" && d.status === "pendente" && d.dataVencimento >= today && d.dataVencimento <= in30)
    .reduce((s, d) => s + Number(d.valor), 0);
  if (receber30 > 0) {
    insights.push({
      tipo: "positivo",
      texto: `Voce tem R$ ${receber30.toFixed(2).replace(".", ",")} a receber nos proximos 30 dias`,
      icone: "money",
    });
  }

  const servicosAtivos = servicos.filter((s) => s.status === "ativo");
  const totalServicos = servicosAtivos.reduce((s, sv) => s + Number(sv.valorMensal), 0);
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

  const totalPagar = dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const totalReceber = dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const saldo = totalReceber - totalPagar - totalServicos;
  if (saldo < 0) {
    const mesesNegativo = Math.abs(Math.round(saldo / (totalServicos || 1)));
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
