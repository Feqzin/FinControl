import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type InvoiceMonthStatus = "atual" | "futura" | "fechada";

const INVOICE_MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

function parseInvoiceMonthKey(monthKey: string): { year: number; month: number } | null {
  if (!INVOICE_MONTH_KEY_PATTERN.test(monthKey)) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function toMonthDate(monthKey: string): Date | null {
  const parsed = parseInvoiceMonthKey(monthKey);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, 1);
}

export function formatInvoiceMonthLong(monthKey: string): string {
  const date = toMonthDate(monthKey);
  if (!date) return monthKey;
  const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });
  return label.replace(/^\w/, (char) => char.toUpperCase());
}

export function formatInvoiceMonthShort(monthKey: string, referenceMonthKey?: string): string {
  const date = toMonthDate(monthKey);
  if (!date) return monthKey;

  const shortMonth = format(date, "MMM", { locale: ptBR })
    .replace(".", "")
    .replace(/^\w/, (char) => char.toUpperCase());

  const parsedMonth = parseInvoiceMonthKey(monthKey);
  const parsedReference = referenceMonthKey ? parseInvoiceMonthKey(referenceMonthKey) : null;
  const mustShowYear = parsedReference ? parsedReference.year !== parsedMonth?.year : false;
  if (!mustShowYear) return shortMonth;

  const shortYear = monthKey.slice(2, 4);
  return `${shortMonth}/${shortYear}`;
}

export function compareInvoiceMonthKeys(a: string, b: string): number {
  const parsedA = parseInvoiceMonthKey(a);
  const parsedB = parseInvoiceMonthKey(b);
  if (!parsedA || !parsedB) return 0;
  if (parsedA.year !== parsedB.year) return parsedA.year - parsedB.year;
  return parsedA.month - parsedB.month;
}

export function getInvoiceMonthStatus(
  monthKey: string,
  currentMonthKey: string,
): InvoiceMonthStatus {
  const comparison = compareInvoiceMonthKeys(monthKey, currentMonthKey);
  if (comparison === 0) return "atual";
  if (comparison > 0) return "futura";
  return "fechada";
}

export function getVisibleInvoiceMonths(params: {
  selectedMonth: string;
  currentMonth: string;
  availableMonths?: string[];
  previousCount?: number;
  nextCount?: number;
}): string[] {
  const previousCount = params.previousCount ?? 2;
  const nextCount = params.nextCount ?? 3;
  const availableMonths = (params.availableMonths ?? [])
    .filter((monthKey) => INVOICE_MONTH_KEY_PATTERN.test(monthKey));

  if (availableMonths.length > 0) {
    const normalizedMonths = Array.from(new Set([
      ...availableMonths,
      params.currentMonth,
      params.selectedMonth,
    ]))
      .filter((monthKey) => INVOICE_MONTH_KEY_PATTERN.test(monthKey))
      .sort(compareInvoiceMonthKeys);

    const selectedIndex = normalizedMonths.indexOf(params.selectedMonth);
    const fallbackIndex = normalizedMonths.indexOf(params.currentMonth);
    const anchorIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, fallbackIndex);
    const start = Math.max(0, anchorIndex - previousCount);
    const end = Math.min(normalizedMonths.length, anchorIndex + nextCount + 1);
    return normalizedMonths.slice(start, end);
  }

  const baseMonth = parseInvoiceMonthKey(params.selectedMonth)
    ? params.selectedMonth
    : params.currentMonth;
  const baseDate = toMonthDate(baseMonth) ?? new Date();
  const months: string[] = [];

  for (let offset = -previousCount; offset <= nextCount; offset += 1) {
    months.push(format(addMonths(baseDate, offset), "yyyy-MM"));
  }

  return Array.from(new Set(months));
}

export function groupInvoiceMonthsByYear(monthKeys: string[]): Array<{ year: string; months: string[] }> {
  const grouped = new Map<string, string[]>();
  const normalized = Array.from(
    new Set(monthKeys.filter((monthKey) => INVOICE_MONTH_KEY_PATTERN.test(monthKey))),
  ).sort((a, b) => b.localeCompare(a));

  for (const monthKey of normalized) {
    const year = monthKey.slice(0, 4);
    const items = grouped.get(year) ?? [];
    items.push(monthKey);
    grouped.set(year, items);
  }

  return Array.from(grouped.entries()).map(([year, months]) => ({ year, months }));
}
