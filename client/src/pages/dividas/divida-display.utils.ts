import { formatIsoDateToBR } from "@/utils/formatters";

const DAS_PERSON_PREFIX = /^Receita Federal\s*·\s*DAS MEI\s*·\s*/i;
const DAS_DESCRIPTION_PATTERN = /^DAS MEI\s+(\d{2}\/\d{4})(?:\s*·|$)/i;
const MAX_COMPACT_TITLE_LENGTH = 64;

type CompactDebtDisplayInput = {
  description?: string | null;
  origin?: string | null;
  personName?: string | null;
  type: string;
};

type CompactDebtDateInput = {
  status: string;
  paymentDate?: string | null;
  dueDate?: string | null;
  overdue?: boolean;
};

export type CompactDebtDisplay = {
  title: string;
  context: string | null;
  details?: string;
};

function normalizeText(value?: string | null): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function shortenText(value: string, maxLength = MAX_COMPACT_TITLE_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function cleanPersonName(value?: string | null): string {
  return normalizeText(value).replace(DAS_PERSON_PREFIX, "").trim();
}

export function buildCompactDebtDisplay({
  description,
  origin,
  personName,
  type,
}: CompactDebtDisplayInput): CompactDebtDisplay {
  const normalizedDescription = normalizeText(description);
  const normalizedPersonName = cleanPersonName(personName);
  const dasMatch = origin === "cnpj_das" ? normalizedDescription.match(DAS_DESCRIPTION_PATTERN) : null;
  const firstDescriptionSegment = normalizeText(normalizedDescription.split("·")[0]);
  const fallbackTitle = type === "receber" ? "Valor a receber" : "Conta a pagar";
  const title = shortenText(
    dasMatch
      ? `DAS MEI · ${dasMatch[1]}`
      : firstDescriptionSegment || normalizedPersonName || fallbackTitle,
  );
  const context = normalizedPersonName && normalizedPersonName.toLocaleLowerCase("pt-BR") !== title.toLocaleLowerCase("pt-BR")
    ? normalizedPersonName
    : null;

  return {
    title,
    context,
    details: normalizedDescription && normalizedDescription !== title ? normalizedDescription : undefined,
  };
}

export function buildCompactDebtDateLabel({
  status,
  paymentDate,
  dueDate,
  overdue = false,
}: CompactDebtDateInput): string {
  if (status === "pago") {
    return paymentDate ? `Pago em ${formatIsoDateToBR(paymentDate)}` : "Pagamento registrado";
  }
  if (!dueDate) return "Sem vencimento";
  return `${overdue ? "Venceu" : "Vence"} em ${formatIsoDateToBR(dueDate)}`;
}
