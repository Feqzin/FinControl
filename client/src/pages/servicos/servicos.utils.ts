import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export function getMeses(): string[] {
  const now = new Date();
  return [
    format(subMonths(now, 2), "yyyy-MM"),
    format(subMonths(now, 1), "yyyy-MM"),
    format(now, "yyyy-MM"),
  ];
}

export function labelMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const d = new Date(parseInt(ano, 10), parseInt(m, 10) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
}
