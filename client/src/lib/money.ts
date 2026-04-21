import {
  add,
  compareMoney,
  divide,
  format,
  formatMoneyFixed,
  multiply,
  parseMoney,
  subtract,
  toCents,
  type MoneyInput,
} from "../../../utils/money";

export type { MoneyInput };

export { add, subtract, multiply, divide, format, formatMoneyFixed, parseMoney, compareMoney, toCents };

export function toMoneyNumber(input: MoneyInput, fallback = 0): number {
  const parsed = parseMoney(input);
  return parsed == null ? fallback : parsed;
}

export function sumMoney(inputs: MoneyInput[]): number {
  return inputs.reduce<number>((sum, item) => sum + toMoneyNumber(item), 0);
}
