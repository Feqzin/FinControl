export type MeiActivity = "comercio" | "servico" | "comercio_servico";

export type DasMeiOverride = {
  principal?: number | null;
  dueDate?: string | null;
  beneficioInss?: boolean;
  officialTotal?: number | null;
};

export type DasMeiCalculation = {
  competencia: string;
  dueDate: string;
  calculationDate: string;
  principal: number;
  finePercentage: number;
  fineAmount: number;
  interestPercentage: number;
  interestAmount: number;
  total: number;
  beneficioInss: boolean;
  principalManual: boolean;
  dueDateManual: boolean;
  officialTotalManual: boolean;
  selicSnapshot: Record<string, number>;
};

const MEI_INSS_BY_YEAR: Record<number, number> = {
  2024: 70.6,
  2025: 75.9,
  2026: 81.05,
};

const SPECIAL_DUE_DATES: Record<string, string> = {
  "2025-04": "2025-05-28",
};

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Data inválida: ${value}`);
  const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    result.getUTCFullYear() !== Number(match[1])
    || result.getUTCMonth() !== Number(match[2]) - 1
    || result.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`Data inválida: ${value}`);
  }
  return result;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toMonthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addUtcMonths(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function easterSunday(year: number): Date {
  const goldenNumber = year % 19;
  const century = Math.floor(year / 100);
  const yearInCentury = year % 100;
  const leapCenturies = Math.floor(century / 4);
  const centuryRemainder = century % 4;
  const correction = Math.floor((century + 8) / 25);
  const moonCorrection = Math.floor((century - correction + 1) / 3);
  const epact = (19 * goldenNumber + century - leapCenturies - moonCorrection + 15) % 30;
  const leapYears = Math.floor(yearInCentury / 4);
  const yearRemainder = yearInCentury % 4;
  const weekdayCorrection = (32 + 2 * centuryRemainder + 2 * leapYears - epact - yearRemainder) % 7;
  const finalCorrection = Math.floor((goldenNumber + 11 * epact + 22 * weekdayCorrection) / 451);
  const month = Math.floor((epact + weekdayCorrection - 7 * finalCorrection + 114) / 31);
  const day = ((epact + weekdayCorrection - 7 * finalCorrection + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isBrazilianBankHoliday(value: Date): boolean {
  const key = `${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  const fixedHolidays = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"]);
  if (value.getUTCFullYear() >= 2024) fixedHolidays.add("11-20");
  if (fixedHolidays.has(key)) return true;

  const easter = easterSunday(value.getUTCFullYear());
  const movableHolidays = [-48, -47, -2, 60].map((offset) => toIsoDate(addUtcDays(easter, offset)));
  return movableHolidays.includes(toIsoDate(value));
}

function nextBusinessDay(value: Date): Date {
  let current = value;
  while (current.getUTCDay() === 0 || current.getUTCDay() === 6 || isBrazilianBankHoliday(current)) {
    current = addUtcDays(current, 1);
  }
  return current;
}

export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;

  const calculateDigit = (length: number) => {
    let weight = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight -= 1;
      if (weight === 1) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

export function getMeiPrincipal(competencia: string, activity: MeiActivity, beneficioInss = false): number {
  const year = Number(competencia.slice(0, 4));
  const inss = MEI_INSS_BY_YEAR[year];
  if (inss == null) {
    throw new Error(`Não há valor automático de DAS MEI cadastrado para ${year}. Informe o principal manualmente.`);
  }

  const tax = activity === "comercio" ? 1 : activity === "servico" ? 5 : 6;
  return roundMoney((beneficioInss ? 0 : inss) + tax);
}

export function getDasMeiDueDate(competencia: string): string {
  const monthKey = competencia.slice(0, 7);
  if (SPECIAL_DUE_DATES[monthKey]) return SPECIAL_DUE_DATES[monthKey];

  const competencyDate = parseIsoDate(`${monthKey}-01`);
  const nominalDueDate = new Date(Date.UTC(
    competencyDate.getUTCFullYear(),
    competencyDate.getUTCMonth() + 1,
    20,
  ));
  return toIsoDate(nextBusinessDay(nominalDueDate));
}

export function requiredSelicMonths(dueDate: string, calculationDate: string): string[] {
  const due = parseIsoDate(dueDate);
  const payment = parseIsoDate(calculationDate);
  if (payment <= due || toMonthKey(payment) === toMonthKey(due)) return [];

  const months: string[] = [];
  let current = addUtcMonths(due, 1);
  const paymentMonth = new Date(Date.UTC(payment.getUTCFullYear(), payment.getUTCMonth(), 1));
  while (current < paymentMonth) {
    months.push(toMonthKey(current));
    current = addUtcMonths(current, 1);
  }
  return months;
}

export function calculateDasMei(params: {
  competencia: string;
  activity: MeiActivity;
  requestedCalculationDate: string;
  selicRates: Record<string, number>;
  override?: DasMeiOverride;
}): DasMeiCalculation {
  const competencia = `${params.competencia.slice(0, 7)}-01`;
  const automaticDueDate = getDasMeiDueDate(competencia);
  const dueDate = params.override?.dueDate || automaticDueDate;
  const requestedDate = parseIsoDate(params.requestedCalculationDate);
  const due = parseIsoDate(dueDate);
  const effectiveCalculationDate = requestedDate < due ? due : requestedDate;
  const calculationDate = toIsoDate(effectiveCalculationDate);
  const beneficioInss = params.override?.beneficioInss === true;
  const principal = params.override?.principal == null
    ? getMeiPrincipal(competencia, params.activity, beneficioInss)
    : roundMoney(params.override.principal);

  const daysLate = Math.max(0, Math.floor((effectiveCalculationDate.getTime() - due.getTime()) / 86_400_000));
  let finePercentage = Math.min(20, roundMoney(daysLate * 0.33));
  let fineAmount = roundMoney(principal * finePercentage / 100);

  const selicMonths = requiredSelicMonths(dueDate, calculationDate);
  const selicSnapshot: Record<string, number> = {};
  let interestPercentage = 0;
  for (const month of selicMonths) {
    const rate = params.selicRates[month];
    if (rate == null || !Number.isFinite(rate)) {
      throw new Error(`Taxa Selic oficial indisponível para ${month}.`);
    }
    selicSnapshot[month] = rate;
    interestPercentage += rate;
  }
  if (effectiveCalculationDate > due && toMonthKey(effectiveCalculationDate) !== toMonthKey(due)) {
    interestPercentage += 1;
  }
  interestPercentage = roundPercentage(interestPercentage);
  let interestAmount = roundMoney(principal * interestPercentage / 100);
  let total = roundMoney(principal + fineAmount + interestAmount);
  const officialTotalManual = params.override?.officialTotal != null;

  if (officialTotalManual) {
    const officialTotal = roundMoney(Number(params.override?.officialTotal));
    if (!Number.isFinite(officialTotal) || officialTotal <= 0) {
      throw new Error("O total oficial importado deve ser maior que zero.");
    }
    if (officialTotal < principal) {
      throw new Error("O total oficial importado não pode ser menor que o principal do DAS.");
    }

    const officialAdditions = roundMoney(officialTotal - principal);
    fineAmount = Math.min(fineAmount, officialAdditions);
    interestAmount = roundMoney(officialAdditions - fineAmount);
    finePercentage = principal > 0 ? roundPercentage(fineAmount * 100 / principal) : 0;
    interestPercentage = principal > 0 ? roundPercentage(interestAmount * 100 / principal) : 0;
    total = officialTotal;
  }

  return {
    competencia,
    dueDate,
    calculationDate,
    principal,
    finePercentage,
    fineAmount,
    interestPercentage,
    interestAmount,
    total,
    beneficioInss,
    principalManual: params.override?.principal != null,
    dueDateManual: Boolean(params.override?.dueDate && params.override.dueDate !== automaticDueDate),
    officialTotalManual,
    selicSnapshot,
  };
}

export function listCompetencies(startMonth: string, endMonth: string): string[] {
  const start = parseIsoDate(`${startMonth.slice(0, 7)}-01`);
  const end = parseIsoDate(`${endMonth.slice(0, 7)}-01`);
  if (start > end) throw new Error("A competência inicial deve ser anterior à final.");

  const values: string[] = [];
  let current = start;
  while (current <= end) {
    values.push(toIsoDate(current));
    if (values.length >= 60) throw new Error("Selecione no máximo 60 competências por vez.");
    current = addUtcMonths(current, 1);
  }
  return values;
}
