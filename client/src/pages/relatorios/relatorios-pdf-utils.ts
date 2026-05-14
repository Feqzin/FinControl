import { format, parseISO } from "date-fns";

type BuildRelatorioPdfMetadataInput = {
  label: string;
  dataSource: string;
  overviewPeriod?: {
    startDate: string;
    endDate: string;
  } | null;
  overviewGeneratedAt?: string | null;
  fallbackStartDateIso: string;
  fallbackEndDateIso: string;
  now?: Date;
};

export type RelatorioPdfMetadata = {
  periodLabel: string;
  generatedAtLabel: string;
  sourceLabel: string;
};

function formatIsoDateToBR(isoDate: string): string {
  try {
    return format(parseISO(isoDate), "dd/MM/yyyy");
  } catch {
    return isoDate;
  }
}

export function buildRelatorioPdfMetadata({
  label,
  dataSource,
  overviewPeriod,
  overviewGeneratedAt,
  fallbackStartDateIso,
  fallbackEndDateIso,
  now = new Date(),
}: BuildRelatorioPdfMetadataInput): RelatorioPdfMetadata {
  const periodStart = overviewPeriod?.startDate ?? fallbackStartDateIso;
  const periodEnd = overviewPeriod?.endDate ?? fallbackEndDateIso;
  const periodLabel = `${label} (${formatIsoDateToBR(periodStart)} a ${formatIsoDateToBR(periodEnd)})`;

  const generatedAtDate = overviewGeneratedAt ? new Date(overviewGeneratedAt) : now;
  const generatedAtLabel = generatedAtDate.toLocaleString("pt-BR");

  return {
    periodLabel,
    generatedAtLabel,
    sourceLabel: dataSource === "overview" ? "relatório consolidado" : "modo compatibilidade",
  };
}
