import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

function parseMonthRef(mes: string): Date | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  const [ano, mesNumero] = mes.split("-");
  const year = Number(ano);
  const month = Number(mesNumero) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  return new Date(year, month, 1);
}

export function getMesAtualRef(referenceDate: Date = new Date()): string {
  return format(referenceDate, "yyyy-MM");
}

export function getMesesRecentes(totalMeses: number, referenceDate: Date = new Date()): string[] {
  const safeTotal = Math.max(1, Math.min(24, Math.floor(totalMeses)));
  return Array.from({ length: safeTotal }, (_, index) =>
    format(subMonths(referenceDate, safeTotal - 1 - index), "yyyy-MM"),
  );
}

export function getMesesIntervalo(mesInicio: string, mesFim: string): string[] {
  const start = parseMonthRef(mesInicio);
  const end = parseMonthRef(mesFim);
  if (!start || !end) return [];

  const [rangeStart, rangeEnd] = start <= end ? [start, end] : [end, start];
  const meses: string[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);

  while (cursor <= rangeEnd && meses.length < 36) {
    meses.push(format(cursor, "yyyy-MM"));
    const next = addMonths(cursor, 1);
    cursor.setFullYear(next.getFullYear(), next.getMonth(), 1);
  }

  return meses;
}

// Compatibilidade retroativa: util legado ainda retorna 3 meses.
export function getMeses(): string[] {
  return getMesesRecentes(3);
}

export function labelMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const d = new Date(parseInt(ano, 10), parseInt(m, 10) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
}
