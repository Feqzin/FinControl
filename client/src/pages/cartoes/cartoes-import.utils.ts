import type { Servico } from "@shared/schema";
import {
  detectRecurringServiceCandidate,
  type ParsedItem,
} from "@/pages/cartoes/import-parser";
import type { CartoesTab } from "@/pages/cartoes/types";

const IMPORT_PDF_DEBUG_MAX_LINES = 80;
const IMPORT_PDF_DEBUG_MAX_LINE_CHARS = 220;

const IMPORT_ALLOWED_MIME_BY_EXTENSION: Record<string, string[]> = {
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
  txt: ["text/plain"],
  ofx: ["application/ofx", "application/x-ofx", "application/octet-stream", "text/plain"],
  qfx: ["application/ofx", "application/x-ofx", "application/octet-stream", "text/plain"],
  pdf: ["application/pdf"],
};

type CanonicalImportStatus =
  | "novo"
  | "duplicata_exata"
  | "possivel_duplicata"
  | "invalido";

export function normalizeImportDebugText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function clampImportDebugLine(line: string): string {
  if (line.length <= IMPORT_PDF_DEBUG_MAX_LINE_CHARS) return line;
  return `${line.slice(0, IMPORT_PDF_DEBUG_MAX_LINE_CHARS)}…`;
}

export function toIndexedImportDebugLines(lines: string[]): string[] {
  const limited = lines.slice(0, IMPORT_PDF_DEBUG_MAX_LINES);
  const indexed = limited.map((line, index) => `${index + 1}. ${clampImportDebugLine(line)}`);
  if (lines.length > IMPORT_PDF_DEBUG_MAX_LINES) {
    indexed.push(`... +${lines.length - IMPORT_PDF_DEBUG_MAX_LINES} linha(s) ocultas`);
  }
  return indexed;
}

export function extractItauDebugSectionLines(text: string): string[] {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const startIndex = lines.findIndex((line) => {
    const normalized = normalizeImportDebugText(line);
    return normalized.includes("LANCAMENTOS: COMPRAS E SAQUES")
      || normalized.includes("LANCAMENTOS COMPRAS E SAQUES");
  });

  if (startIndex < 0) {
    return lines.slice(0, 120);
  }

  const endIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) return false;
    const normalized = normalizeImportDebugText(line);
    return normalized.startsWith("LANCAMENTOS NO CARTAO")
      || normalized.startsWith("TOTAL DOS LANCAMENTOS ATUAIS")
      || normalized.startsWith("COMPRAS PARCELADAS - PROXIMAS FATURAS")
      || normalized.startsWith("COMPRAS PARCELADAS PROXIMAS FATURAS")
      || normalized.startsWith("LIMITES DE CREDITO")
      || normalized.startsWith("ENCARGOS COBRADOS NESTA FATURA");
  });

  const finalEnd = endIndex > startIndex ? endIndex : Math.min(lines.length, startIndex + 180);
  return lines.slice(startIndex, finalEnd);
}

export function normalizeCartoesTab(value: string | null | undefined): CartoesTab {
  if (value === "compras" || value === "resumo") {
    return value;
  }
  if (value === "fatura") {
    return "compras";
  }
  if (value === "parcelas") {
    return "compras";
  }
  if (value === "limite") {
    return "resumo";
  }
  return "resumo";
}

export function isImportItemStructurallyInvalid(item: ParsedItem): boolean {
  if (!item.descricao?.trim()) return true;
  if (!Number.isFinite(item.valor) || item.valor <= 0) return true;
  if (!Number.isFinite(item.valorParcela) || item.valorParcela <= 0) return true;
  if (!Number.isInteger(item.parcelas) || item.parcelas < 1 || item.parcelas > 360) return true;
  if (!Number.isInteger(item.parcelaAtual) || item.parcelaAtual < 1 || item.parcelaAtual > item.parcelas) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.dataCompra)) return true;
  return false;
}

export function getImportItemEffectiveStatus(item: ParsedItem): CanonicalImportStatus {
  const hasDuplicate = Boolean(item.duplicateId || item.duplicata);
  if (isImportItemStructurallyInvalid(item)) return "invalido";

  if (item.status === "duplicata_exata" || item.status === "possivel_duplicata" || item.status === "novo") {
    return item.status;
  }
  if (item.status === "invalido") {
    return hasDuplicate ? "possivel_duplicata" : "novo";
  }
  return hasDuplicate ? "possivel_duplicata" : "novo";
}

export function tryParseApiErrorMessage(rawMessage: string): string | null {
  const marker = ":";
  const firstColon = rawMessage.indexOf(marker);
  if (firstColon <= 0) return null;
  const maybeJson = rawMessage.slice(firstColon + 1).trim();
  if (!maybeJson.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(maybeJson) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function formatImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getImportFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return "";
  return normalized.slice(dotIndex + 1);
}

export function isImportMimeAllowed(extension: string, mimeType: string): boolean {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (!normalizedMime) return true;
  const allowed = IMPORT_ALLOWED_MIME_BY_EXTENSION[extension];
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(normalizedMime);
}

export function isNubankCardLikeName(cardName: string): boolean {
  const normalized = cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (normalized.includes("NUBANK")) return true;
  return /\bNU\b/.test(normalized) && /\b(MASTERCARD|CREDITO|CARTAO)\b/.test(normalized);
}

export function isItauCardLikeName(cardName: string): boolean {
  const normalized = cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  return normalized.includes("ITAU") || normalized.includes("ITAUCARD");
}

export function isMercadoPagoCardLikeName(cardName: string): boolean {
  const normalized = cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  return normalized.includes("MERCADO PAGO") || normalized.includes("MERCADOPAGO") || normalized.includes("CARTAO MP");
}

export function extractCardLast4FromName(cardName: string): string | null {
  const explicitFinal = cardName.match(/(?:final|ending)\s*(\d{4})/i);
  if (explicitFinal?.[1]) return explicitFinal[1];

  const masked = cardName.match(/\*{2,}\s*(\d{4})/);
  if (masked?.[1]) return masked[1];

  const allLast4 = cardName.match(/\b(\d{4})\b/g);
  if (allLast4 && allLast4.length > 0) {
    return allLast4[allLast4.length - 1] ?? null;
  }

  return null;
}

export function listToHumanReadable(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

export function normalizeServiceText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findMatchingServiceForImportItem(item: ParsedItem, servicos: Servico[]): Servico | null {
  const provider = normalizeServiceText(item.recurringServiceCandidate?.matchedProvider);
  const descricao = normalizeServiceText(item.descricao);
  if (!provider && !descricao) return null;

  const expectedValue = Number(item.valorParcela) || 0;
  let best: { servico: Servico; score: number } | null = null;

  for (const servico of servicos) {
    const nome = normalizeServiceText(servico.nome);
    if (!nome) continue;

    const valueDiff = Math.abs((Number(servico.valorMensal) || 0) - expectedValue);
    const providerMatch = provider.length > 0 && (nome.includes(provider) || provider.includes(nome));
    const descricaoMatch = descricao.length > 0 && (nome.includes(descricao) || descricao.includes(nome));

    let score = 0;
    if (providerMatch) score += 4;
    if (descricaoMatch) score += 2;
    if (valueDiff <= 0.05) score += 2;
    else if (valueDiff <= 3) score += 1;

    if (score < 3) continue;
    if (!best || score > best.score) {
      best = { servico, score };
    }
  }

  return best?.servico ?? null;
}

export function applyServiceSuggestionMetadata(items: ParsedItem[], servicos: Servico[]): ParsedItem[] {
  return items.map((item) => {
    const candidate = item.recurringServiceCandidate ?? detectRecurringServiceCandidate(item.descricao);
    if (!candidate.isServiceCandidate) {
      return {
        ...item,
        recurringServiceCandidate: candidate,
        serviceSuggestionAction: item.serviceSuggestionAction ?? "ignore",
        linkedServiceId: null,
        replaceExistingServiceLink: false,
        serviceSuggestionWarning: null,
      };
    }

    const matchedService = findMatchingServiceForImportItem(item, servicos);
    const hasPotentialDuplicate = Boolean(matchedService);
    const action = item.serviceSuggestionAction ?? (matchedService ? "link_existing" : "ignore");
    const linkedServiceId = action === "link_existing"
      ? (item.linkedServiceId ?? matchedService?.id ?? null)
      : null;

    return {
      ...item,
      recurringServiceCandidate: candidate,
      serviceSuggestionAction: action,
      linkedServiceId,
      replaceExistingServiceLink: action === "link_existing" ? item.replaceExistingServiceLink === true : false,
      serviceSuggestionWarning: hasPotentialDuplicate
        ? `Serviço parecido encontrado: ${matchedService?.nome}. Prefira vincular ao existente para evitar duplicidade.`
        : null,
    };
  });
}

export function mergePreviewItemsWithLocalSignals(
  previewItems: ParsedItem[],
  parsedItems: ParsedItem[],
  servicos: Servico[],
): ParsedItem[] {
  const parsedById = new Map(parsedItems.map((item) => [item.id, item]));
  const merged = previewItems.map((item) => {
    const local = parsedById.get(item.id);
    if (!local) return item;

    return {
      ...item,
      recurringServiceCandidate: local.recurringServiceCandidate ?? item.recurringServiceCandidate,
      serviceSuggestionAction: local.serviceSuggestionAction ?? item.serviceSuggestionAction ?? "ignore",
      linkedServiceId: local.linkedServiceId ?? item.linkedServiceId ?? null,
      replaceExistingServiceLink: local.replaceExistingServiceLink ?? item.replaceExistingServiceLink ?? false,
      createServiceSuggestion: local.createServiceSuggestion ?? item.createServiceSuggestion ?? null,
      serviceSuggestionWarning: local.serviceSuggestionWarning ?? item.serviceSuggestionWarning ?? null,
      cardLast4: local.cardLast4 ?? item.cardLast4 ?? null,
      invoiceIssuerDetected: local.invoiceIssuerDetected ?? item.invoiceIssuerDetected,
      parserUsed: local.parserUsed ?? item.parserUsed,
      duplicata: local.duplicata ?? item.duplicata,
    };
  });

  return applyServiceSuggestionMetadata(merged, servicos);
}
