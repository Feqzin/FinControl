export type DasImportedItem = {
  competencia: string;
  total: number;
  sourceLine: string;
};

export type DasReportedTotal = {
  label: string;
  year: number | null;
  total: number;
};

export type DasImportResult = {
  items: DasImportedItem[];
  yearlyTotals: Record<string, number>;
  calculatedTotal: number;
  reportedTotals: DasReportedTotal[];
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).sort((left, right) => right.length - left.length).join("|");
const MONTH_NAME_REGEX = new RegExp(`\\b(${MONTH_NAMES})\\s*(?:/|-|de)?\\s*(20\\d{2})\\b`, "i");
const NUMERIC_MONTH_REGEX = /\b(0?[1-9]|1[0-2])\s*[/.\-]\s*(20\d{2})\b/;
const MONEY_REGEX = /(?:R\s*\$\s*)?(\d{1,3}(?:\.\d{3})*,\s*\d{2}|\d+[,.]\s*\d{2})/gi;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/(\d)[,.]\s+(\d{2})\b/g, "$1,$2");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseMoney(value: string): number {
  const compact = value.replace(/\s/g, "");
  const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
  const normalized = decimalSeparator === ","
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(/,/g, "");
  return roundMoney(Number(normalized));
}

function extractAmounts(line: string): number[] {
  const values: number[] = [];
  MONEY_REGEX.lastIndex = 0;
  let match = MONEY_REGEX.exec(line);
  while (match) {
    const value = parseMoney(match[1]);
    if (Number.isFinite(value) && value > 0) values.push(value);
    match = MONEY_REGEX.exec(line);
  }
  return values;
}

function extractCompetency(line: string): string | null {
  const named = MONTH_NAME_REGEX.exec(line.toLowerCase());
  if (named) {
    return `${named[2]}-${String(MONTHS[named[1].toLowerCase()]).padStart(2, "0")}`;
  }

  const numeric = NUMERIC_MONTH_REGEX.exec(line);
  if (numeric) return `${numeric[2]}-${String(Number(numeric[1])).padStart(2, "0")}`;

  return null;
}

function totalsByYear(items: DasImportedItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    const year = item.competencia.slice(0, 4);
    result[year] = roundMoney((result[year] ?? 0) + item.total);
    return result;
  }, {});
}

export function parseCnpjDasImportText(rawText: string): DasImportResult {
  const normalized = normalizeText(rawText);
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const itemsByMonth = new Map<string, DasImportedItem>();
  const reportedTotals: DasReportedTotal[] = [];
  const warnings: string[] = [];
  let pendingTotal: { label: string; year: number | null } | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const amounts = extractAmounts(line);
    const yearTotalMatch = /\btotal\b.*?\b(20\d{2})\b/i.exec(line);
    const isGeneralTotal = /\btotal\s+geral\b/i.test(line);
    const isConsolidatedTotal = /\bdas\s+consolidado\b/i.test(line);

    if (yearTotalMatch || isGeneralTotal || isConsolidatedTotal) {
      const descriptor = {
        label: isGeneralTotal
          ? "Total geral"
          : isConsolidatedTotal
            ? "Total consolidado do DAS"
            : `Total de ${yearTotalMatch?.[1]}`,
        year: yearTotalMatch ? Number(yearTotalMatch[1]) : null,
      };
      if (amounts.length > 0) {
        reportedTotals.push({ ...descriptor, total: amounts[amounts.length - 1] });
        pendingTotal = null;
      } else {
        pendingTotal = descriptor;
      }
      continue;
    }

    if (pendingTotal && amounts.length > 0 && !extractCompetency(line)) {
      reportedTotals.push({ ...pendingTotal, total: amounts[amounts.length - 1] });
      pendingTotal = null;
      continue;
    }

    if (lower.includes("periodo de apuracao") || lower.includes("competencia")) continue;
    const competencia = extractCompetency(line);
    if (!competencia) continue;
    if (amounts.length === 0) {
      warnings.push(`${competencia.slice(5)}/${competencia.slice(0, 4)} foi ignorado porque não possui valor.`);
      continue;
    }

    const item = { competencia, total: amounts[amounts.length - 1], sourceLine: line };
    const existing = itemsByMonth.get(competencia);
    if (existing) {
      warnings.push(
        existing.total === item.total
          ? `${competencia.slice(5)}/${competencia.slice(0, 4)} apareceu repetido e foi considerado uma vez.`
          : `${competencia.slice(5)}/${competencia.slice(0, 4)} apareceu com valores diferentes; foi mantido o último.`,
      );
    }
    itemsByMonth.set(competencia, item);
  }

  const items = Array.from(itemsByMonth.values()).sort((left, right) => left.competencia.localeCompare(right.competencia));
  const yearlyTotals = totalsByYear(items);
  const calculatedTotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));

  for (const reported of reportedTotals) {
    const calculated = reported.year == null ? calculatedTotal : yearlyTotals[String(reported.year)] ?? 0;
    if (Math.abs(reported.total - calculated) > 0.01) {
      warnings.push(`${reported.label} informado (${reported.total.toFixed(2)}) difere da soma das competências (${calculated.toFixed(2)}).`);
    }
  }

  return { items, yearlyTotals, calculatedTotal, reportedTotals, warnings };
}
