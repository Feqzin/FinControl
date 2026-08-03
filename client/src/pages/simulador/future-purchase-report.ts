import type {
  FuturePurchaseSimulationInput,
  FuturePurchaseSimulationMonth,
  FuturePurchaseSimulationResult,
} from "@/pages/simulador/future-purchase-simulation";

export type FuturePurchaseMonthlyEquation = {
  monthReference: string;
  label: string;
  startingBalance: number;
  totalIncome: number;
  actualIncome: number;
  simulatedExtraIncome: number;
  totalExpenses: number;
  actualExpenses: number;
  simulatedInstallment: number;
  calculatedEndingBalance: number;
  endingBalance: number;
  reconciled: boolean;
};

export type FuturePurchaseReportData = {
  generatedAt: string;
  simulationName: string;
  purchaseName: string;
  cardName: string;
  input: FuturePurchaseSimulationInput;
  result: FuturePurchaseSimulationResult;
  monthlyEquations: FuturePurchaseMonthlyEquation[];
  allMonthsReconciled: boolean;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildFuturePurchaseMonthlyEquation(
  month: FuturePurchaseSimulationMonth,
): FuturePurchaseMonthlyEquation {
  const totalIncome = roundMoney(month.actualIncome + month.simulatedExtraIncome);
  const totalExpenses = roundMoney(month.actualExpenses + month.simulatedInstallment);
  const calculatedEndingBalance = roundMoney(month.startingBalance + totalIncome - totalExpenses);
  return {
    monthReference: month.monthReference,
    label: month.label,
    startingBalance: month.startingBalance,
    totalIncome,
    actualIncome: month.actualIncome,
    simulatedExtraIncome: month.simulatedExtraIncome,
    totalExpenses,
    actualExpenses: month.actualExpenses,
    simulatedInstallment: month.simulatedInstallment,
    calculatedEndingBalance,
    endingBalance: month.endingBalance,
    reconciled: Math.abs(calculatedEndingBalance - month.endingBalance) < 0.01,
  };
}

export function buildFuturePurchaseReportData(params: {
  simulationName: string;
  purchaseName: string;
  cardName: string;
  input: FuturePurchaseSimulationInput;
  result: FuturePurchaseSimulationResult;
  generatedAt?: string;
}): FuturePurchaseReportData {
  const monthlyEquations = params.result.months.map(buildFuturePurchaseMonthlyEquation);
  return {
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    simulationName: params.simulationName.trim() || "Simulação de compra futura",
    purchaseName: params.purchaseName.trim() || "Compra sem nome",
    cardName: params.cardName.trim() || "Cartão não informado",
    input: params.input,
    result: params.result,
    monthlyEquations,
    allMonthsReconciled: monthlyEquations.every((month) => month.reconciled),
  };
}
