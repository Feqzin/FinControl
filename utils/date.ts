const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}[T ]/;
const BR_DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const SLASH_ISO_DATE_REGEX = /^(\d{4})\/(\d{2})\/(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isIsoDateString(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return formatIsoDate(parsed) === value;
}

export function parseIsoDate(value: string): Date | null {
  if (!isIsoDateString(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeIsoDate(input: string | Date | null | undefined): string | null {
  if (input == null || input === "") return null;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return formatIsoDate(input);
  }

  if (isIsoDateString(input)) {
    return input;
  }

  const trimmed = input.trim();

  if (ISO_DATE_TIME_PREFIX_REGEX.test(trimmed)) {
    const datePrefix = trimmed.slice(0, 10);
    return isIsoDateString(datePrefix) ? datePrefix : null;
  }

  const brMatch = trimmed.match(BR_DATE_REGEX);
  if (brMatch) {
    const normalized = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    return isIsoDateString(normalized) ? normalized : null;
  }

  const slashIsoMatch = trimmed.match(SLASH_ISO_DATE_REGEX);
  if (slashIsoMatch) {
    const normalized = `${slashIsoMatch[1]}-${slashIsoMatch[2]}-${slashIsoMatch[3]}`;
    return isIsoDateString(normalized) ? normalized : null;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatIsoDate(parsed);
}

export function todayIsoDate(referenceDate: Date = new Date()): string {
  return formatIsoDate(referenceDate);
}
