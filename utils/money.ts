export type MoneyInput = string | number | null | undefined;

const CENTS_SCALE = 2;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function pow10(exp: number): number {
  return 10 ** exp;
}

function isSafeInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isSafeInteger(value);
}

function normalizeRawMoneyInput(input: MoneyInput): string | null {
  if (input == null) return null;

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return String(input);
  }

  const trimmed = input
    .trim()
    .replace(/\s+/g, "")
    .replace(/R\$/gi, "");
  if (!trimmed) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      return trimmed.replace(/\./g, "").replace(",", ".");
    }
    return trimmed.replace(/,/g, "");
  }

  if (lastComma !== -1) {
    return trimmed.replace(/\./g, "").replace(",", ".");
  }

  return trimmed.replace(/,/g, "");
}

function decimalToScaledInteger(decimal: string, scale: number): number | null {
  const normalized = decimal.trim();
  if (!normalized) return null;

  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  if (!/^\d+(?:\.\d+)?$/.test(unsigned)) return null;

  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = Number(intPartRaw || "0");
  if (!isSafeInteger(intPart)) return null;

  const baseFrac = Number(fracPartRaw.slice(0, scale).padEnd(scale, "0"));
  if (!isSafeInteger(baseFrac)) return null;

  const scaled = intPart * pow10(scale) + baseFrac;
  if (!isSafeInteger(scaled)) return null;

  if (fracPartRaw.length <= scale) {
    return negative ? -scaled : scaled;
  }

  const roundDigit = Number(fracPartRaw.charAt(scale));
  const rounded = roundDigit >= 5 ? scaled + 1 : scaled;
  if (!isSafeInteger(rounded)) return null;
  return negative ? -rounded : rounded;
}

function parseDecimalRatio(input: string | number): { numerator: number; denominator: number } | null {
  const normalized = normalizeRawMoneyInput(input);
  if (!normalized) return null;

  const trimmed = normalized.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  if (!/^\d+(?:\.\d+)?$/.test(unsigned)) return null;

  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = Number(intPartRaw || "0");
  const fracPart = Number(fracPartRaw || "0");
  const denominator = pow10(fracPartRaw.length);

  if (!isSafeInteger(intPart) || !isSafeInteger(fracPart) || !isSafeInteger(denominator)) return null;

  const numeratorUnsigned = intPart * denominator + fracPart;
  if (!isSafeInteger(numeratorUnsigned)) return null;

  const numerator = negative ? -numeratorUnsigned : numeratorUnsigned;
  return { numerator, denominator };
}

function roundDiv(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new Error("Divisao por zero");
  }

  const sameSign = (numerator >= 0 && denominator >= 0) || (numerator < 0 && denominator < 0);
  const absNumerator = Math.abs(numerator);
  const absDenominator = Math.abs(denominator);
  const quotient = Math.floor(absNumerator / absDenominator);
  const remainder = absNumerator % absDenominator;
  const shouldRoundUp = remainder * 2 >= absDenominator;
  const rounded = shouldRoundUp ? quotient + 1 : quotient;

  return sameSign ? rounded : -rounded;
}

function centsToFixed(cents: number): string {
  const normalized = Math.trunc(cents);
  const negative = normalized < 0;
  const abs = Math.abs(normalized);
  const intPart = Math.floor(abs / 100);
  const fracPart = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

export function toCentsBigInt(input: MoneyInput): number | null {
  const normalized = normalizeRawMoneyInput(input);
  if (!normalized) return null;
  return decimalToScaledInteger(normalized, CENTS_SCALE);
}

export function parseMoney(input: MoneyInput): number | null {
  const cents = toCentsBigInt(input);
  if (cents == null) return null;
  return cents / 100;
}

export function toCents(input: MoneyInput): number | null {
  return toCentsBigInt(input);
}

export function fromCents(cents: number): number {
  return Math.trunc(cents) / 100;
}

export function add(...inputs: MoneyInput[]): string {
  const total = inputs.reduce<number>((sum, value) => sum + (toCentsBigInt(value) ?? 0), 0);
  return centsToFixed(total);
}

export function subtract(base: MoneyInput, ...inputs: MoneyInput[]): string {
  const baseCents = toCentsBigInt(base) ?? 0;
  const subtractCents = inputs.reduce<number>((sum, value) => sum + (toCentsBigInt(value) ?? 0), 0);
  return centsToFixed(baseCents - subtractCents);
}

export function multiply(value: MoneyInput, factor: string | number): string {
  const valueCents = toCentsBigInt(value);
  if (valueCents == null) return "0.00";

  const ratio = parseDecimalRatio(factor);
  if (!ratio) return "0.00";

  const multiplied = roundDiv(valueCents * ratio.numerator, ratio.denominator);
  return centsToFixed(multiplied);
}

export function divide(value: MoneyInput, divisor: string | number): string {
  const valueCents = toCentsBigInt(value);
  if (valueCents == null) return "0.00";

  const ratio = parseDecimalRatio(divisor);
  if (!ratio || ratio.numerator === 0) {
    throw new Error("Divisao por zero");
  }

  const divided = roundDiv(valueCents * ratio.denominator, ratio.numerator);
  return centsToFixed(divided);
}

export function format(
  input: MoneyInput,
  options?: { locale?: string; currency?: string },
): string | null {
  const value = parseMoney(input);
  if (value == null) return null;

  return new Intl.NumberFormat(options?.locale ?? "pt-BR", {
    style: "currency",
    currency: options?.currency ?? "BRL",
  }).format(value);
}

export function formatMoneyFixed(input: MoneyInput): string | null {
  const cents = toCentsBigInt(input);
  if (cents == null) return null;
  return centsToFixed(cents);
}

export function addMoney(...inputs: MoneyInput[]): number {
  return parseMoney(add(...inputs)) ?? 0;
}

export function subtractMoney(base: MoneyInput, ...inputs: MoneyInput[]): number {
  return parseMoney(subtract(base, ...inputs)) ?? 0;
}

export function compareMoney(left: MoneyInput, right: MoneyInput): -1 | 0 | 1 {
  const leftCents = toCentsBigInt(left) ?? 0;
  const rightCents = toCentsBigInt(right) ?? 0;
  if (leftCents === rightCents) return 0;
  return leftCents > rightCents ? 1 : -1;
}

export function assertMoneyValue(input: MoneyInput, fallback = 0): number {
  const parsed = parseMoney(input);
  return parsed == null ? fallback : parsed;
}
