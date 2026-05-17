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
