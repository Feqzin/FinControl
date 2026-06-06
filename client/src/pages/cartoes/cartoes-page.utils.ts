import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { tryParseApiErrorMessage } from "@/pages/cartoes/cartoes-import.utils";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import {
  buildPremiumFeatureFriendlyMessage,
  parsePremiumFeatureError,
} from "@/lib/subscription-premium-feature";

export function getErrorMessage(error: unknown): string {
  const planLimitError = parsePlanLimitError(error);
  if (planLimitError) {
    return buildPlanLimitFriendlyMessage(planLimitError);
  }
  const premiumFeatureError = parsePremiumFeatureError(error);
  if (premiumFeatureError) {
    return buildPremiumFeatureFriendlyMessage(premiumFeatureError);
  }
  if (error instanceof Error) {
    return tryParseApiErrorMessage(error.message) ?? error.message;
  }
  return "Erro inesperado";
}

export function formatMesExibicao(mes: string): string {
  const [ano, mesNumero] = mes.split("-");
  const parsedMonth = Number(mesNumero);
  if (!ano || !Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return mes;
  const data = new Date(Number(ano), parsedMonth - 1, 1);
  return format(data, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, (char) => char.toUpperCase());
}

export function formatInvoiceCompetencyLabel(monthReference: string): string {
  const [year, month] = monthReference.split("-");
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  if (!Number.isFinite(yearNumber) || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return monthReference;
  }
  const asDate = new Date(yearNumber, monthNumber - 1, 1);
  return format(asDate, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, (char) => char.toUpperCase());
}
