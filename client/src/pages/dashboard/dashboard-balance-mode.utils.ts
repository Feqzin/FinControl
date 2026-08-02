export type DashboardBalanceMode = "monthly" | "patrimony";

type DashboardBalanceViewInput = {
  mode: DashboardBalanceMode;
  monthlyBalance: number;
  totalPatrimony: number;
  confirmedIncome: number;
  totalExpenses: number;
};

export type DashboardBalanceView = {
  title: string;
  value: number;
  primaryLabel: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryValue: number;
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildDashboardBalanceView({
  mode,
  monthlyBalance,
  totalPatrimony,
  confirmedIncome,
  totalExpenses,
}: DashboardBalanceViewInput): DashboardBalanceView {
  if (mode === "patrimony") {
    return {
      title: "Saldo com patrimônio",
      value: roundCurrency(totalPatrimony + monthlyBalance),
      primaryLabel: "Patrimônio atual",
      primaryValue: roundCurrency(totalPatrimony),
      secondaryLabel: "Resultado do mês",
      secondaryValue: roundCurrency(monthlyBalance),
    };
  }

  return {
    title: "Saldo do mês",
    value: roundCurrency(monthlyBalance),
    primaryLabel: "Entradas confirmadas",
    primaryValue: roundCurrency(confirmedIncome),
    secondaryLabel: "Saídas",
    secondaryValue: roundCurrency(totalExpenses),
  };
}
