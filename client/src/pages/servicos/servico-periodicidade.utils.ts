import {
  calculateServicoValorMensalEquivalente,
  normalizeServicoPeriodicidade,
  resolveServicoBillingFields,
  type ServicoBillingLike,
  type ServicoPeriodicidade,
} from "@shared/servico-periodicidade";
import { formatCurrencyBRL } from "@/utils/formatters";

export const SERVICO_PERIODICIDADE_OPTIONS: Array<{ value: ServicoPeriodicidade; label: string }> = [
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
  { value: "semestral", label: "Semestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "bimestral", label: "Bimestral" },
  { value: "semanal", label: "Semanal" },
];

function getPeriodicidadeLabel(periodicidade: ServicoPeriodicidade): string {
  switch (periodicidade) {
    case "anual":
      return "ano";
    case "semestral":
      return "semestre";
    case "trimestral":
      return "trimestre";
    case "bimestral":
      return "bimestre";
    case "semanal":
      return "semana";
    case "mensal":
    default:
      return "mês";
  }
}

export function resolveServicoBillingView(servico: ServicoBillingLike): {
  periodicidade: ServicoPeriodicidade;
  valorCobranca: number;
  valorMensalEquivalente: number;
} {
  const resolved = resolveServicoBillingFields({}, servico);
  return {
    periodicidade: resolved.periodicidadeCobranca,
    valorCobranca: resolved.valorCobrancaNumber,
    valorMensalEquivalente: resolved.valorMensalNumber,
  };
}

export function formatServicoBillingValue(servico: ServicoBillingLike): string {
  const { periodicidade, valorCobranca, valorMensalEquivalente } = resolveServicoBillingView(servico);
  const formattedValorCobranca = formatCurrencyBRL(valorCobranca);

  if (periodicidade === "mensal") {
    return `${formattedValorCobranca}/mês`;
  }

  return `${formattedValorCobranca}/${getPeriodicidadeLabel(periodicidade)} · equiv. ${formatCurrencyBRL(valorMensalEquivalente)}/mês`;
}

export function buildServicoPeriodicidadeResumo(
  periodicidadeInput: string | null | undefined,
  valorCobrancaInput: string | number | null | undefined,
): { primary: string; secondary?: string; equivalenteMensal: number } {
  const periodicidade = normalizeServicoPeriodicidade(periodicidadeInput);
  const equivalenteMensal = calculateServicoValorMensalEquivalente(valorCobrancaInput, periodicidade);
  const valorFormatado = formatCurrencyBRL(Number.isFinite(Number(valorCobrancaInput)) ? Number(valorCobrancaInput) : (resolveServicoBillingFields({
    periodicidadeCobranca: periodicidade,
    valorCobranca: valorCobrancaInput,
  }).valorCobrancaNumber));

  switch (periodicidade) {
    case "anual":
      return {
        primary: `Você paga ${valorFormatado} por ano.`,
        secondary: `Equivalente mensal: ${formatCurrencyBRL(equivalenteMensal)}.`,
        equivalenteMensal,
      };
    case "semestral":
      return {
        primary: `Você paga ${valorFormatado} a cada 6 meses.`,
        secondary: `Equivalente mensal: ${formatCurrencyBRL(equivalenteMensal)}.`,
        equivalenteMensal,
      };
    case "trimestral":
      return {
        primary: `Você paga ${valorFormatado} a cada 3 meses.`,
        secondary: `Equivalente mensal: ${formatCurrencyBRL(equivalenteMensal)}.`,
        equivalenteMensal,
      };
    case "bimestral":
      return {
        primary: `Você paga ${valorFormatado} a cada 2 meses.`,
        secondary: `Equivalente mensal: ${formatCurrencyBRL(equivalenteMensal)}.`,
        equivalenteMensal,
      };
    case "semanal":
      return {
        primary: `Você paga ${valorFormatado} por semana.`,
        secondary: `Equivalente mensal: ${formatCurrencyBRL(equivalenteMensal)}.`,
        equivalenteMensal,
      };
    case "mensal":
    default:
      return {
        primary: `Você paga ${valorFormatado} por mês.`,
        equivalenteMensal,
      };
  }
}
