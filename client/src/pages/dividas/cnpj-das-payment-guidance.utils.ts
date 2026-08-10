import type { CnpjDasObligationView } from "@/services/api/cnpj-das";

export type DasPaymentPriority = {
  id: string;
  competencia: string;
  total: number;
  reason: string;
  urgency: "daily_fine" | "due_soon" | "selic" | "future";
};

export type DasPaymentGuidance = {
  totalOpen: number;
  overdueTotal: number;
  dueSoonTotal: number;
  dailyFineCount: number;
  minimumGuide: number;
  priorities: DasPaymentPriority[];
  firstMonthPriorities: DasPaymentPriority[];
  firstMonthTotal: number;
  estimatedMonths: number | null;
  budgetFitsGuide: boolean;
};

function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildCnpjDasPaymentGuidance(
  obligations: CnpjDasObligationView[],
  monthlyBudget: number,
  referenceDate: string,
): DasPaymentGuidance {
  const reference = parseIsoDate(referenceDate);
  const open = obligations
    .filter((item) => item.debtStatus !== "pago" && !item.debtDeletedAt)
    .map((item) => {
      const dueDate = parseIsoDate(item.dataVencimento);
      const daysUntilDue = Math.ceil((dueDate.getTime() - reference.getTime()) / 86_400_000);
      const finePercentage = Number(item.multaPercentual);
      const overdue = daysUntilDue < 0;
      const urgency: DasPaymentPriority["urgency"] = overdue && finePercentage < 20
        ? "daily_fine"
        : daysUntilDue >= 0 && daysUntilDue <= 30
          ? "due_soon"
          : overdue
            ? "selic"
            : "future";
      const reason = urgency === "daily_fine"
        ? "A multa ainda pode crescer 0,33% ao dia até atingir 20%."
        : urgency === "due_soon"
          ? daysUntilDue === 0
            ? "Vence hoje; pagar evita o início da multa por atraso."
            : `Vence em ${daysUntilDue} dia(s); reserve antes de quitar débitos antigos.`
          : urgency === "selic"
            ? "A multa já chegou ou está próxima do teto; a Selic continua aumentando o débito."
            : "Ainda não venceu; programe o valor para não criar um novo atraso.";

      return {
        id: item.id,
        competencia: item.competencia,
        total: Number(item.total),
        principal: Number(item.principal),
        daysUntilDue,
        urgency,
        reason,
      };
    });

  const urgencyOrder: Record<DasPaymentPriority["urgency"], number> = {
    daily_fine: 0,
    due_soon: 1,
    selic: 2,
    future: 3,
  };
  open.sort((left, right) => {
    const urgencyDifference = urgencyOrder[left.urgency] - urgencyOrder[right.urgency];
    if (urgencyDifference !== 0) return urgencyDifference;
    if (left.urgency === "daily_fine") return right.daysUntilDue - left.daysUntilDue;
    if (left.urgency === "selic") return right.principal - left.principal || left.daysUntilDue - right.daysUntilDue;
    return left.daysUntilDue - right.daysUntilDue;
  });

  const priorities = open.map(({ principal: _principal, daysUntilDue: _daysUntilDue, ...item }) => item);
  const validBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0 ? monthlyBudget : 0;
  const firstMonthPriorities: DasPaymentPriority[] = [];
  let firstMonthTotal = 0;
  if (validBudget > 0) {
    for (const item of priorities) {
      if (firstMonthTotal + item.total <= validBudget + 0.001) {
        firstMonthPriorities.push(item);
        firstMonthTotal += item.total;
      }
    }
  }

  const totalOpen = roundMoney(open.reduce((sum, item) => sum + item.total, 0));
  const overdueTotal = roundMoney(open.filter((item) => item.daysUntilDue < 0).reduce((sum, item) => sum + item.total, 0));
  const dueSoonTotal = roundMoney(open.filter((item) => item.daysUntilDue >= 0 && item.daysUntilDue <= 30).reduce((sum, item) => sum + item.total, 0));
  const minimumGuide = open.length > 0 ? Math.min(...open.map((item) => item.total)) : 0;
  const budgetFitsGuide = validBudget > 0 && minimumGuide > 0 && validBudget + 0.001 >= minimumGuide;

  return {
    totalOpen,
    overdueTotal,
    dueSoonTotal,
    dailyFineCount: open.filter((item) => item.urgency === "daily_fine").length,
    minimumGuide: roundMoney(minimumGuide),
    priorities,
    firstMonthPriorities,
    firstMonthTotal: roundMoney(firstMonthTotal),
    estimatedMonths: budgetFitsGuide ? Math.ceil(totalOpen / validBudget) : null,
    budgetFitsGuide,
  };
}
