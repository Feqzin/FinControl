import type { ParcelaCompra } from "@shared/schema";
import { addMonths, format, isPast, parseISO } from "date-fns";
import { formatCurrencyBRL } from "@/utils/formatters";

export function formatCartaoCurrency(value: number): string {
  return formatCurrencyBRL(value);
}

export function getNextInvoiceDate(diaVencimento: number): string {
  const now = new Date();
  const currentDay = now.getDate();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), diaVencimento);
  if (currentDay >= diaVencimento) targetDate = addMonths(targetDate, 1);
  return format(targetDate, "dd/MM/yyyy");
}

export function getDaysUntilInvoice(diaVencimento: number): number {
  const now = new Date();
  const currentDay = now.getDate();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), diaVencimento);
  if (currentDay >= diaVencimento) targetDate = addMonths(targetDate, 1);
  return Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isParcelaVencida(p: ParcelaCompra): boolean {
  if (p.statusCartao === "pago") return false;
  if (!p.dataVencimento) return false;
  try {
    return isPast(parseISO(`${p.dataVencimento}T23:59:59`));
  } catch {
    return false;
  }
}
