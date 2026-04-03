import { addMonths, format } from "date-fns";

type ParcelaPagaInput = {
  valor: number;
};

type BuildDividaRecalculoInput = {
  valorTotal: number;
  novoTotal: number;
  parcelasPagas: ParcelaPagaInput[];
  primeiroVencimento: Date;
};

export type ParcelaPendentePlan = {
  numero: number;
  valor: string;
  dataVencimento: string;
  status: "pendente";
  dataPagamento: null;
  formaPagamento: null;
};

export type DividaRecalculoPlan = {
  valorTotal: string;
  valorRestante: string;
  valorParcelaReferencia: string;
  parcelasPendentes: ParcelaPendentePlan[];
};

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export function buildDividaRecalculoPlan(input: BuildDividaRecalculoInput): DividaRecalculoPlan {
  const { valorTotal, novoTotal, parcelasPagas, primeiroVencimento } = input;

  if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
    throw new Error("valorTotal invalido para recalculo");
  }
  if (!Number.isInteger(novoTotal) || novoTotal < 1) {
    throw new Error("novoTotal deve ser um inteiro >= 1");
  }

  const paidCount = parcelasPagas.length;
  if (novoTotal < paidCount) {
    throw new Error("novoTotal nao pode ser menor que a quantidade de parcelas pagas");
  }

  const totalCents = toCents(valorTotal);
  const paidCents = parcelasPagas.reduce((sum, p) => sum + toCents(Number(p.valor)), 0);
  const remainingCents = totalCents - paidCents;
  const pendingCount = novoTotal - paidCount;

  if (remainingCents < 0) {
    throw new Error("inconsistencia: parcelas pagas maiores que o valor total");
  }
  if (pendingCount === 0 && remainingCents !== 0) {
    throw new Error("novoTotal insuficiente para cobrir o valor restante");
  }
  if (pendingCount > 0 && remainingCents <= 0) {
    throw new Error("nao ha valor restante para distribuir em novas parcelas");
  }

  if (pendingCount === 0) {
    return {
      valorTotal: fromCents(totalCents),
      valorRestante: fromCents(remainingCents),
      valorParcelaReferencia: "0.00",
      parcelasPendentes: [],
    };
  }

  const baseParcelaCents = Math.floor(remainingCents / pendingCount);
  const parcelasPendentes: ParcelaPendentePlan[] = [];

  for (let i = 0; i < pendingCount; i++) {
    const isLast = i === pendingCount - 1;
    const valorCents = isLast
      ? remainingCents - baseParcelaCents * (pendingCount - 1)
      : baseParcelaCents;

    parcelasPendentes.push({
      numero: paidCount + i + 1,
      valor: fromCents(valorCents),
      dataVencimento: format(addMonths(primeiroVencimento, i), "yyyy-MM-dd"),
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    });
  }

  return {
    valorTotal: fromCents(totalCents),
    valorRestante: fromCents(remainingCents),
    valorParcelaReferencia: parcelasPendentes[0]?.valor ?? "0.00",
    parcelasPendentes,
  };
}

