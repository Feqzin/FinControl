import { isPast, parseISO } from "date-fns";
import { formatIsoDateToBR, formatCurrencyBRL } from "@/utils/formatters";

export const FORMAS_PAGAMENTO_DIVIDA = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
] as const;

export function formatDividaCurrency(value: number): string {
  return formatCurrencyBRL(value);
}

export function formatDividaDate(value?: string | null): string {
  return formatIsoDateToBR(value);
}

export function isOverdueDate(value?: string | null): boolean {
  if (!value) return false;
  try {
    return isPast(parseISO(`${value}T23:59:59`));
  } catch {
    return false;
  }
}
