import { format, subMonths } from "date-fns";
import type { Divida, Servico, Renda } from "@shared/schema";
import { toMoneyNumber } from "@/lib/money";

export interface MonthlySnapshot {
  mes: string;
  label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  dividasQuitadas: number;
  dividasPendentes: number;
}

export function gerarHistoricoMensal(
  dividas: Divida[],
  servicos: Servico[],
  meses: number = 6,
  rendas: Renda[] = [],
): MonthlySnapshot[] {
  const now = new Date();
  const servicosMensais = servicos
    .filter((s) => s.status === "ativo")
    .reduce((s, sv) => s + toMoneyNumber(sv.valorMensal), 0);
  const rendaMensal = rendas
    .filter((r) => r.ativo)
    .reduce((s, r) => s + toMoneyNumber(r.valor), 0);

  return Array.from({ length: meses }, (_, i) => {
    const data = subMonths(now, meses - 1 - i);
    const mes = format(data, "yyyy-MM");
    const label = format(data, "MMM/yy");

    const receitasDividas = dividas
      .filter((d) => d.tipo === "receber" && (d.dataPagamento || d.dataVencimento || "").startsWith(mes))
      .reduce((s, d) => s + toMoneyNumber(d.valor), 0);

    const despesasDividas = dividas
      .filter((d) => d.tipo === "pagar" && (d.dataPagamento || d.dataVencimento || "").startsWith(mes))
      .reduce((s, d) => s + toMoneyNumber(d.valor), 0);

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
