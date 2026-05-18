export type ParcelaCompetencySnapshot = {
  id?: string;
  numero: number;
  dataVencimento: string | null;
  statusCartao?: string | null;
  dataPagamentoCartao?: string | null;
  statusPessoa?: string | null;
  dataPagamentoPessoa?: string | null;
  comprovantePath?: string | null;
  comprovanteNome?: string | null;
  comprovanteMimeType?: string | null;
  comprovanteTamanho?: number | null;
  comprovanteEnviadoEm?: string | Date | null;
};

export type ParcelaCompetencySuggestion = {
  numero: number;
  dataVencimento: string | null;
};

export type ParcelaCompetencyDiffKind = "due_date_mismatch" | "missing_parcela" | "extra_parcela";

export type ParcelaCompetencyDiff = {
  numero: number;
  kind: ParcelaCompetencyDiffKind;
  currentDueDate: string | null;
  suggestedDueDate: string | null;
  protectedReasons: string[];
};

export function hasParcelaComprovanteForCompetency(row: ParcelaCompetencySnapshot): boolean {
  return Boolean(
    row.comprovantePath
      || row.comprovanteNome
      || row.comprovanteMimeType
      || row.comprovanteTamanho != null
      || row.comprovanteEnviadoEm != null,
  );
}

type ParsedCompetenciaMonth = {
  year: number;
  month: number;
};

function parseIsoDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = Number(value.slice(8, 10));
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return day;
}

function clampDay(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  return Math.max(minValue, Math.min(maxValue, Math.trunc(value)));
}

export function parseCompetenciaMonth(value: string | null | undefined): ParsedCompetenciaMonth | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));

  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function resolveDueDateFromCompetencia(params: {
  competencia: string;
  diaVencimento?: number | null;
  fallbackDataVencimento?: string | null;
}): string | null {
  const parsedCompetencia = parseCompetenciaMonth(params.competencia);
  if (!parsedCompetencia) return null;

  const dueDayFromCard = (
    typeof params.diaVencimento === "number"
    && Number.isFinite(params.diaVencimento)
    && params.diaVencimento >= 1
  ) ? params.diaVencimento : null;
  const dueDayFromFallback = parseIsoDay(params.fallbackDataVencimento);
  const dueDayCandidate = dueDayFromCard ?? dueDayFromFallback ?? 1;

  const maxDayOfMonth = new Date(parsedCompetencia.year, parsedCompetencia.month, 0).getDate();
  const dueDay = clampDay(dueDayCandidate, 1, maxDayOfMonth);

  const monthText = String(parsedCompetencia.month).padStart(2, "0");
  const dayText = String(dueDay).padStart(2, "0");
  return `${parsedCompetencia.year}-${monthText}-${dayText}`;
}

export function getParcelaProtectionReasonsForCompetency(row: ParcelaCompetencySnapshot): string[] {
  const reasons: string[] = [];
  if (row.statusCartao === "pago") reasons.push("status_cartao_pago");
  if (row.dataPagamentoCartao) reasons.push("data_pagamento_cartao");
  if (row.statusPessoa === "pago") reasons.push("status_pessoa_pago");
  if (row.dataPagamentoPessoa) reasons.push("data_pagamento_pessoa");
  if (hasParcelaComprovanteForCompetency(row)) reasons.push("comprovante");
  return reasons;
}

export function diffParcelasCompetencySchedules(
  currentRows: ParcelaCompetencySnapshot[],
  suggestedRows: ParcelaCompetencySuggestion[],
): ParcelaCompetencyDiff[] {
  const currentByNumber = new Map<number, ParcelaCompetencySnapshot>();
  const suggestedByNumber = new Map<number, ParcelaCompetencySuggestion>();

  for (const row of currentRows) {
    currentByNumber.set(row.numero, row);
  }
  for (const row of suggestedRows) {
    suggestedByNumber.set(row.numero, row);
  }

  const numbers = new Set<number>([
    ...Array.from(currentByNumber.keys()),
    ...Array.from(suggestedByNumber.keys()),
  ]);

  return Array.from(numbers)
    .sort((a, b) => a - b)
    .flatMap((numero): ParcelaCompetencyDiff[] => {
      const current = currentByNumber.get(numero);
      const suggested = suggestedByNumber.get(numero);

      if (current && suggested) {
        if (current.dataVencimento === suggested.dataVencimento) return [];
        return [{
          numero,
          kind: "due_date_mismatch",
          currentDueDate: current.dataVencimento ?? null,
          suggestedDueDate: suggested.dataVencimento ?? null,
          protectedReasons: getParcelaProtectionReasonsForCompetency(current),
        }];
      }

      if (!current && suggested) {
        return [{
          numero,
          kind: "missing_parcela",
          currentDueDate: null,
          suggestedDueDate: suggested.dataVencimento ?? null,
          protectedReasons: [],
        }];
      }

      if (current && !suggested) {
        return [{
          numero,
          kind: "extra_parcela",
          currentDueDate: current.dataVencimento ?? null,
          suggestedDueDate: null,
          protectedReasons: getParcelaProtectionReasonsForCompetency(current),
        }];
      }

      return [];
    });
}

export function matchesLegacyPurchaseDateSchedule(
  currentRows: Array<Pick<ParcelaCompetencySnapshot, "numero" | "dataVencimento">>,
  legacyRows: Array<Pick<ParcelaCompetencySuggestion, "numero" | "dataVencimento">>,
): boolean {
  if (currentRows.length !== legacyRows.length) return false;
  const legacyByNumber = new Map(legacyRows.map((row) => [row.numero, row.dataVencimento] as const));
  return currentRows.every((row) => legacyByNumber.get(row.numero) === row.dataVencimento);
}

export function canAutoRematerializeCompetency(diffs: ParcelaCompetencyDiff[]): { canApply: boolean; reason: string | null } {
  if (diffs.length === 0) {
    return { canApply: false, reason: "no_differences" };
  }

  if (diffs.some((diff) => diff.kind !== "due_date_mismatch")) {
    return { canApply: false, reason: "schedule_structure_changed" };
  }

  const protectedDiff = diffs.find((diff) => diff.protectedReasons.length > 0);
  if (protectedDiff) {
    return { canApply: false, reason: `protected_parcela_${protectedDiff.numero}` };
  }

  return { canApply: true, reason: null };
}
