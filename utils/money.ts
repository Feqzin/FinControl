function normalizeRawMoneyInput(input: string | number): string | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return String(input);
  }

  const trimmed = input.trim().replace(/\s+/g, "").replace("R$", "");
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

export function parseMoney(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const normalized = normalizeRawMoneyInput(input);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function toCents(input: string | number | null | undefined): number | null {
  const value = parseMoney(input);
  if (value == null) return null;
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatMoneyFixed(input: string | number | null | undefined): string | null {
  const cents = toCents(input);
  if (cents == null) return null;
  return fromCents(cents).toFixed(2);
}

export function addMoney(...inputs: Array<string | number | null | undefined>): number {
  const totalCents = inputs.reduce<number>((acc, value) => acc + (toCents(value) ?? 0), 0);
  return fromCents(totalCents);
}

export function subtractMoney(
  base: string | number | null | undefined,
  ...inputs: Array<string | number | null | undefined>
): number {
  const baseCents = toCents(base) ?? 0;
  const discountCents = inputs.reduce<number>((acc, value) => acc + (toCents(value) ?? 0), 0);
  return fromCents(baseCents - discountCents);
}

export function compareMoney(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): -1 | 0 | 1 {
  const leftCents = toCents(left) ?? 0;
  const rightCents = toCents(right) ?? 0;
  if (leftCents === rightCents) return 0;
  return leftCents > rightCents ? 1 : -1;
}
