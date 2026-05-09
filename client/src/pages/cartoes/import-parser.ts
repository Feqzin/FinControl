import { format } from "date-fns";
import type { CompraCartao } from "@shared/schema";
import { formatMoneyFixed, multiply, parseMoney, toMoneyNumber } from "@/lib/money";

export interface ParsedItem {
  id: string;
  descricao: string;
  estabelecimento?: string | null;
  valor: number;
  valorParcela: number;
  parcelas: number;
  parcelaAtual: number;
  parcelasRestantes: number;
  dataCompra: string;
  vencimentoFatura: string | null;
  tipo: "compra" | "taxa";
  duplicata: any;
  action: "import" | "skip";
  status?: "novo" | "duplicata_exata" | "possivel_duplicata" | "invalido";
  forceImport?: boolean;
  confidenceScore?: number;
  confidenceLevel?: "alta" | "media" | "baixa";
  validationIssues?: string[];
  canImport?: boolean;
  reviewRequired?: boolean;
  duplicateId?: string | null;
}

type ParseSource = "csv" | "ofx" | "texto";

interface ParseStats {
  source: ParseSource;
  totalRows: number;
  skippedInvalidValue: number;
  skippedNegativeValue: number;
  skippedPaymentOrCredit: number;
  skippedUnrecognized: number;
}

export interface ParseResult {
  items: ParsedItem[];
  stats: ParseStats;
}

interface ParseOptions {
  referenceBillingDate?: string | null;
}

interface ParsedDateMetadata {
  iso: string;
  estimatedYear: boolean;
  confidencePenalty: number;
  issue?: string;
}

/**
 * Semantica padrao de importacao:
 * - parcelaAtual representa a parcela corrente (em aberto).
 * - parcelasRestantes inclui a parcelaAtual (ex.: 5/12 => 8 restantes).
 */
function calculateParcelasRestantes(totalParcelas: number, parcelaAtual: number): number {
  return Math.max(totalParcelas - parcelaAtual + 1, 0);
}

function createParseStats(source: ParseSource, totalRows: number): ParseStats {
  return {
    source,
    totalRows,
    skippedInvalidValue: 0,
    skippedNegativeValue: 0,
    skippedPaymentOrCredit: 0,
    skippedUnrecognized: 0,
  };
}

// ── Parser helpers ──────────────────────────────────────────────────────────

function isValidDateParts(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseIsoDateString(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveYearForDayMonth(month: number, referenceDate: Date | null): number {
  const now = new Date();
  const fallbackYear = now.getFullYear();
  if (!referenceDate) return fallbackYear;
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  if (refMonth === 1 && month === 12) return refYear - 1;
  if (refMonth === 12 && month === 1) return refYear + 1;
  return refYear;
}

function parseDateFromToken(
  rawToken: string,
  options?: ParseOptions,
): ParsedDateMetadata | null {
  const fullMatch = rawToken.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (fullMatch) {
    const day = Number.parseInt(fullMatch[1] ?? "", 10);
    const month = Number.parseInt(fullMatch[2] ?? "", 10);
    const yearRaw = Number.parseInt(fullMatch[3] ?? "", 10);
    const year = (fullMatch[3]?.length ?? 0) === 2 ? 2000 + yearRaw : yearRaw;
    if (!isValidDateParts(day, month, year)) return null;
    return {
      iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      estimatedYear: false,
      confidencePenalty: 0,
    };
  }

  const shortMatch = rawToken.match(/^(\d{2})\/(\d{2})$/);
  if (shortMatch) {
    const day = Number.parseInt(shortMatch[1] ?? "", 10);
    const month = Number.parseInt(shortMatch[2] ?? "", 10);
    const referenceDate = parseIsoDateString(options?.referenceBillingDate ?? null);
    const year = resolveYearForDayMonth(month, referenceDate);
    if (!isValidDateParts(day, month, year)) return null;
    return {
      iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      estimatedYear: true,
      confidencePenalty: 15,
      issue: "Ano inferido a partir da fatura",
    };
  }

  return null;
}

function extractAllISODates(str: string): { iso: string; raw: string; index: number; estimatedYear: boolean; issue?: string; confidencePenalty: number }[] {
  const results: { iso: string; raw: string; index: number; estimatedYear: boolean; issue?: string; confidencePenalty: number }[] = [];
  const re = /\b(\d{2}\/\d{2}(?:\/\d{2,4})?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const token = m[1] ?? "";
    const parsed = parseDateFromToken(token);
    if (!parsed) continue;
    results.push({
      iso: parsed.iso,
      raw: token,
      index: m.index,
      estimatedYear: parsed.estimatedYear,
      issue: parsed.issue,
      confidencePenalty: parsed.confidencePenalty,
    });
  }
  return results;
}

function extractInstallment(str: string): { parcelaAtual: number; totalParcelas: number; raw: string; ambiguous?: boolean } | null {
  const normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const patterns: { regex: RegExp; parser: (match: RegExpExecArray) => { parcelaAtual: number; totalParcelas: number; raw: string; ambiguous?: boolean } | null }[] = [
    {
      regex: /\bparcela\s+(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b/gi,
      parser: (match) => {
        const parcelaAtual = Number.parseInt(match[1] ?? "", 10);
        const totalParcelas = Number.parseInt(match[2] ?? "", 10);
        if (parcelaAtual >= 1 && totalParcelas >= 1 && parcelaAtual <= totalParcelas && totalParcelas <= 360) {
          return { parcelaAtual, totalParcelas, raw: match[0] };
        }
        return null;
      },
    },
    {
      regex: /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g,
      parser: (match) => {
        if (typeof match.index === "number" && match.index <= 5) {
          return null;
        }
        const parcelaAtual = Number.parseInt(match[1] ?? "", 10);
        const totalParcelas = Number.parseInt(match[2] ?? "", 10);
        if (parcelaAtual >= 1 && totalParcelas >= 2 && parcelaAtual <= totalParcelas && totalParcelas <= 360) {
          return { parcelaAtual, totalParcelas, raw: match[0] };
        }
        return null;
      },
    },
    {
      regex: /\b(\d{1,3})x\b/gi,
      parser: (match) => {
        const totalParcelas = Number.parseInt(match[1] ?? "", 10);
        if (totalParcelas >= 2 && totalParcelas <= 360) {
          return { parcelaAtual: 1, totalParcelas, raw: match[0], ambiguous: true };
        }
        return null;
      },
    },
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(normalized)) !== null) {
      const parsed = pattern.parser(m);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractMonetaryValue(str: string): { valor: number; raw: string } | null {
  const matches = str.match(/(?:R\$\s*)?-?\d(?:[\d.,]{0,20}\d)?(?:[.,]\d{2})/g) ?? [];
  let best: { valor: number; raw: string } | null = null;

  for (const rawMatch of matches) {
    const parsed = parseMoney(rawMatch);
    if (parsed == null || !Number.isFinite(parsed) || parsed <= 0 || parsed >= 1_000_000) continue;
    if (!best || rawMatch.length > best.raw.length) {
      best = { valor: toMoneyNumber(parsed), raw: rawMatch.trim() };
    }
  }

  return best;
}

function detectarTipo(titulo: string): "taxa" | "compra" {
  if (/\b(IOF|seguro|tarifa|encargo|juros|anuidade)\b/i.test(titulo)) return "taxa";
  return "compra";
}

function normalizarDescricao(raw: string): string {
  let s = raw;
  // Remove " - Parcela X/Y" and "- PARC X/Y" patterns (with surrounding dash)
  s = s.replace(/\s*[-–]\s*Parcela\s+\d{1,2}\/\d{1,2}/gi, "");
  s = s.replace(/\s*[-–]\s*PARC(?:ELA)?\s+\d{1,2}\/\d{1,2}/gi, "");
  // Remove bare "Parcela X/Y" at end of string
  s = s.replace(/\bPARC(?:ELA)?\s+\d{1,2}\/\d{1,2}\b/gi, "");
  // Remove long digit sequences (auth codes)
  s = s.replace(/\b\d{7,}\b/g, "");
  // Remove common statement noise
  s = s.replace(/\b(autorizacao|aut\.|codigo|cod\.|nsu|trx|transacao|compra\s+no\s+credito|debito\s+automatico)\b/gi, " ");
  s = s.replace(/\b(data|valor|total|parcela|parcelado|fatura)\b/gi, " ");
  // Replace asterisks with space (e.g. "AMAZON*MKTPL")
  s = s.replace(/\*/g, " ");
  s = s.replace(/[|;]+/g, " ");
  // Remove R$ symbols
  s = s.replace(/R\$\s*/g, "");
  // Collapse whitespace and trim
  s = s.trim().replace(/\s+/g, " ");
  // Remove leading/trailing non-alphanumeric
  s = s.replace(/^[\s\W]+|[\s\W]+$/g, "").trim();
  // Convert ALL-CAPS to Title Case
  const uppers = (s.match(/[A-Z]/g) || []).length;
  const lowers = (s.match(/[a-z]/g) || []).length;
  if (uppers > 2 && lowers === 0) {
    s = s.toLowerCase().replace(/(^\w|\s\w)/g, (c) => c.toUpperCase());
  }
  return s.trim() || "Compra importada";
}

export function findVencimentoFatura(text: string): string | null {
  const linhas = text.split(/\n/).slice(0, 20);
  for (const l of linhas) {
    if (/vencimento|vencto|venc\b|due.?date/i.test(l)) {
      const dates = extractAllISODates(l);
      if (dates.length > 0) return dates[0].iso;
    }
  }
  for (const l of linhas.slice(0, 5)) {
    const dates = extractAllISODates(l);
    if (dates.length > 0) return dates[0].iso;
  }
  return null;
}

function extractEstabelecimento(descricao: string): string | null {
  const normalized = descricao
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const words = normalized
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 4);
  if (words.length === 0) return null;
  return words.join(" ");
}

function parseLinha(
  linha: string,
  vencimentoFatura: string | null,
  options?: ParseOptions,
): Omit<ParsedItem, "id" | "duplicata" | "action"> | null {
  const valResult = extractMonetaryValue(linha);
  if (!valResult) return null;
  const valorParcela = valResult.valor; // value on the line = this installment's amount

  const inferredDateIssues: string[] = [];
  let confidenceScore = 100;
  const referenceBillingDate = options?.referenceBillingDate ?? vencimentoFatura;
  const fullDates: { iso: string; raw: string; index: number; estimatedYear: boolean; issue?: string; confidencePenalty: number }[] = [];
  for (const entry of extractAllISODates(linha)) {
    const parsedWithReference = entry.estimatedYear
      ? parseDateFromToken(entry.raw, { referenceBillingDate })
      : parseDateFromToken(entry.raw, options);
    if (!parsedWithReference) continue;
    fullDates.push({
      ...entry,
      iso: parsedWithReference.iso,
      estimatedYear: parsedWithReference.estimatedYear,
      confidencePenalty: parsedWithReference.confidencePenalty,
      issue: parsedWithReference.issue,
    });
  }

  let working = linha;
  for (const d of [...fullDates].reverse()) {
    working = working.slice(0, d.index) + " " + working.slice(d.index + d.raw.length);
    if (d.issue) inferredDateIssues.push(d.issue);
    confidenceScore -= d.confidencePenalty;
  }
  working = working.replace(valResult.raw, " ");

  const instResult = extractInstallment(working);
  const parcelaAtual = instResult ? instResult.parcelaAtual : 1;
  const totalParcelas = instResult ? instResult.totalParcelas : 1;
  if (instResult?.ambiguous) {
    inferredDateIssues.push("Parcela atual inferida como 1");
    confidenceScore -= 10;
  }
  if (instResult) working = working.replace(instResult.raw, " ");

  const descricao = normalizarDescricao(working);
  const estabelecimento = extractEstabelecimento(descricao);
  const primaryDate = fullDates[0];
  const dataCompra = primaryDate?.iso ?? format(new Date(), "yyyy-MM-dd");
  if (!primaryDate) {
    inferredDateIssues.push("Data da compra inferida como hoje");
    confidenceScore -= 30;
  }
  const valor = toMoneyNumber(multiply(valorParcela, totalParcelas)); // true total
  const parcelasRestantes = calculateParcelasRestantes(totalParcelas, parcelaAtual);
  const tipo = detectarTipo(linha);
  const finalConfidence = Math.max(0, Math.min(100, confidenceScore));

  return {
    descricao,
    estabelecimento,
    valor,
    valorParcela,
    parcelas: totalParcelas,
    parcelaAtual,
    parcelasRestantes,
    dataCompra,
    vencimentoFatura,
    tipo,
    confidenceScore: finalConfidence,
    confidenceLevel: finalConfidence >= 85 ? "alta" : finalConfidence >= 65 ? "media" : "baixa",
    reviewRequired: inferredDateIssues.length > 0 || finalConfidence < 75,
    validationIssues: inferredDateIssues,
  };
}

function normalizeForDuplicateCompare(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityByTokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(a.split(" ").filter((token) => token.length >= 3));
  const tokensB = new Set(b.split(" ").filter((token) => token.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of Array.from(tokensA)) {
    if (tokensB.has(token)) intersection += 1;
  }
  return intersection / Math.max(tokensA.size, tokensB.size);
}

function checkDuplicata(item: {
  valorParcela: number;
  valor?: number;
  descricao: string;
  estabelecimento?: string | null;
  dataCompra?: string;
  parcelas?: number;
  parcelaAtual?: number;
}, existentes: CompraCartao[], cartaoId: string) {
  const normalizedDescricao = normalizeForDuplicateCompare(item.descricao);
  const normalizedEstabelecimento = normalizeForDuplicateCompare(item.estabelecimento);
  const baseDate = item.dataCompra ? parseIsoDateString(item.dataCompra) : null;

  let bestMatch: { row: CompraCartao; score: number } | null = null;
  for (const existing of existentes) {
    if (existing.cartaoId !== cartaoId) continue;

    const existingValorParcela = toMoneyNumber(existing.valorParcela);
    const existingValorTotal = toMoneyNumber(existing.valorTotal);
    const diffParcela = Math.abs(existingValorParcela - item.valorParcela);
    const diffTotal = item.valor != null ? Math.abs(existingValorTotal - item.valor) : Number.POSITIVE_INFINITY;
    const existingDescricao = normalizeForDuplicateCompare(existing.descricao);
    const existingEstabelecimento = normalizeForDuplicateCompare(extractEstabelecimento(existing.descricao));

    const dateA = baseDate;
    const dateB = parseIsoDateString(existing.dataCompra);
    const dayDiff = dateA && dateB ? Math.floor(Math.abs(dateA.getTime() - dateB.getTime()) / 86_400_000) : null;

    const descricaoSimilarity = similarityByTokenOverlap(normalizedDescricao, existingDescricao);
    const estabelecimentoSimilarity = similarityByTokenOverlap(normalizedEstabelecimento, existingEstabelecimento);

    let score = 0;
    if (diffParcela <= 0.01) score += 4;
    else if (diffParcela <= 0.1) score += 2;
    if (diffTotal <= 0.05) score += 2;
    if (dayDiff === 0) score += 2;
    else if (dayDiff != null && dayDiff <= 3) score += 1;
    if ((item.parcelas ?? 1) === existing.parcelas) score += 1;
    if ((item.parcelaAtual ?? 1) === existing.parcelaAtual) score += 1;
    if (normalizedDescricao && normalizedDescricao === existingDescricao) score += 3;
    else if (descricaoSimilarity >= 0.6) score += 2;
    else if (descricaoSimilarity >= 0.4) score += 1;
    if (normalizedEstabelecimento && estabelecimentoSimilarity >= 0.75) score += 1;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { row: existing, score };
    }
  }

  if (!bestMatch) return null;
  return bestMatch.score >= 6 ? bestMatch.row : null;
}

function parseTexto(
  text: string,
  existentes: CompraCartao[],
  cartaoId: string,
  options?: ParseOptions,
): ParseResult {
  const vencimentoFatura = findVencimentoFatura(text);
  const linhas = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  const stats = createParseStats("texto", linhas.length);
  let idx = 0;
  for (const linha of linhas) {
    const parsed = parseLinha(linha, vencimentoFatura, {
      referenceBillingDate: options?.referenceBillingDate ?? vencimentoFatura,
    });
    if (!parsed) {
      stats.skippedUnrecognized += 1;
      continue;
    }
    const duplicata = checkDuplicata(parsed, existentes, cartaoId);
    items.push({ id: String(idx++), ...parsed, tipo: parsed.tipo ?? "compra", vencimentoFatura, duplicata, action: duplicata ? "skip" : "import" });
  }
  return { items, stats };
}

function parseCsvValue(raw: string): number {
  const parsed = parseMoney(raw);
  return parsed == null ? Number.NaN : parsed;
}

function parseCsvDate(raw: string, options?: ParseOptions): ParsedDateMetadata {
  const s = raw.trim().replace(/"/g, "");
  // ISO: 2026-02-17
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { iso: s, estimatedYear: false, confidencePenalty: 0 };
  }
  // BR: 17/02/2026
  const parsed = parseDateFromToken(s, options);
  if (parsed) return parsed;
  // Short BR: 17/02/26
  const us = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (us) {
    const month = Number.parseInt(us[1] ?? "", 10);
    const day = Number.parseInt(us[2] ?? "", 10);
    const year = Number.parseInt(us[3] ?? "", 10);
    if (isValidDateParts(day, month, year)) {
      return {
        iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        estimatedYear: false,
        confidencePenalty: 10,
        issue: "Data em formato alternativo",
      };
    }
  }
  return {
    iso: format(new Date(), "yyyy-MM-dd"),
    estimatedYear: true,
    confidencePenalty: 35,
    issue: "Data da compra inferida como hoje",
  };
}

const PAYMENT_KEYWORDS = /pagamento\s*(recebido|de\s*fatura|efetuado)|credito\s*em\s*conta|estorno|reembolso|cashback/i;

export function parseCsv(
  content: string,
  existentes: CompraCartao[],
  cartaoId: string,
  options?: ParseOptions,
): ParseResult {
  // Detect separator: prefer comma for simple CSV, semicolon for BR exports
  const firstLine = content.split(/\n/)[0] ?? "";
  const sep = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const linhas = content.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return parseTexto(content, existentes, cartaoId, options);

  const rawHeaders = linhas[0].split(sep).map((h) => h.replace(/"/g, "").trim());
  const headers = rawHeaders.map((h) => h.toLowerCase());

  // Column detection — "title" and "amount" are explicit Nubank/inter CSV names
  const dateIdx = headers.findIndex((h) => /^date$|^data$|data.compra|lança|post/i.test(h));
  const descIdx = headers.findIndex((h) => /^title$|^desc|^hist|^memo|^nome$|^lancamento/i.test(h));
  const valIdx  = headers.findIndex((h) => /^amount$|^valor$|^value$|trnamt|debito|credito/i.test(h));

  if (valIdx < 0 && descIdx < 0) return parseTexto(content, existentes, cartaoId, options);

  const vencimentoFatura = findVencimentoFatura(content);
  const referenceBillingDate = options?.referenceBillingDate ?? vencimentoFatura;
  const items: ParsedItem[] = [];
  const stats = createParseStats("csv", Math.max(0, linhas.length - 1));
  let idx = 0;

  for (let i = 1; i < linhas.length; i++) {
    const raw = linhas[i];
    // Handle quoted fields with commas inside
    const cols: string[] = [];
    let cur = ""; let inQ = false;
    for (const ch of raw) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === sep && !inQ) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());

    if (cols.length < 2) {
      stats.skippedUnrecognized += 1;
      continue;
    }

    const rawDesc = (descIdx >= 0 ? cols[descIdx] : cols[1] ?? "").replace(/"/g, "").trim();
    const valorRaw = (valIdx >= 0 ? cols[valIdx] : cols[cols.length - 1] ?? "").replace(/"/g, "").trim();
    const dataRaw  = (dateIdx >= 0 ? cols[dateIdx] : cols[0] ?? "").replace(/"/g, "").trim();

    // Skip empty rows
    if (!rawDesc && !valorRaw) {
      stats.skippedUnrecognized += 1;
      continue;
    }

    // Parse value — keep sign to detect payments
    const valorSigned = parseCsvValue(valorRaw);
    if (isNaN(valorSigned) || valorSigned === 0) {
      stats.skippedInvalidValue += 1;
      continue;
    }

    // Skip payments received (negative = credit to account, or keyword match)
    if (valorSigned < 0) {
      stats.skippedNegativeValue += 1;
      continue;
    }
    if (PAYMENT_KEYWORDS.test(rawDesc)) {
      stats.skippedPaymentOrCredit += 1;
      continue;
    }

    const valorParcela = valorSigned; // CSV amount = this installment's value

    const parsedDate = parseCsvDate(dataRaw, { referenceBillingDate });
    const dataCompra = parsedDate.iso;

    // Extract installments from the raw title BEFORE cleaning
    const instResult = extractInstallment(rawDesc);
    const parcelaAtual = instResult ? instResult.parcelaAtual : 1;
    const totalParcelas = instResult ? instResult.totalParcelas : 1;
    const parcelasRestantes = calculateParcelasRestantes(totalParcelas, parcelaAtual);
    const valorTotal = toMoneyNumber(multiply(valorParcela, totalParcelas));

    // Clean description after extracting installment info
    const descricao = normalizarDescricao(rawDesc);
    const estabelecimento = extractEstabelecimento(descricao);
    const tipo = detectarTipo(rawDesc);
    const issues: string[] = [];
    let confidenceScore = 100 - parsedDate.confidencePenalty;
    if (parsedDate.issue) issues.push(parsedDate.issue);
    if (instResult?.ambiguous) {
      issues.push("Parcela atual inferida como 1");
      confidenceScore -= 10;
    }
    const finalConfidence = Math.max(0, Math.min(100, confidenceScore));

    const duplicata = checkDuplicata({
      valorParcela,
      valor: valorTotal,
      descricao,
      estabelecimento,
      dataCompra,
      parcelas: totalParcelas,
      parcelaAtual,
    }, existentes, cartaoId);
    items.push({
      id: String(idx++),
      descricao,
      estabelecimento,
      valor: valorTotal,
      valorParcela,
      parcelas: totalParcelas,
      parcelaAtual,
      parcelasRestantes,
      dataCompra,
      vencimentoFatura,
      tipo,
      duplicata,
      action: duplicata ? "skip" : "import",
      confidenceScore: finalConfidence,
      confidenceLevel: finalConfidence >= 85 ? "alta" : finalConfidence >= 65 ? "media" : "baixa",
      reviewRequired: issues.length > 0 || finalConfidence < 75,
      validationIssues: issues,
    });
  }

  if (
    items.length === 0 &&
    stats.skippedInvalidValue === 0 &&
    stats.skippedNegativeValue === 0 &&
    stats.skippedPaymentOrCredit === 0
  ) {
    return parseTexto(content, existentes, cartaoId, options);
  }

  return { items, stats };
}

export function parseOfx(
  content: string,
  existentes: CompraCartao[],
  cartaoId: string,
  options?: ParseOptions,
): ParseResult {
  const getTag = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}>([^<\n\r]+)`, "i"));
    return m ? m[1].trim() : "";
  };
  const normalizedOfx = content.includes("</STMTTRN>")
    ? content
    : content.replace(/<STMTTRN>/gi, "<STMTTRN>").replace(/(?=<(?:DTPOSTED|TRNAMT|MEMO|NAME|FITID)>)/gi, "\n");
  const rawBlocks: string[] = [];
  const openRe = /<STMTTRN>/gi;
  let om: RegExpExecArray | null;
  while ((om = openRe.exec(normalizedOfx)) !== null) {
    const start = om.index;
    const closeIdx = normalizedOfx.indexOf("</STMTTRN>", start);
    if (closeIdx >= 0) rawBlocks.push(normalizedOfx.slice(start, closeIdx + 10));
    else rawBlocks.push(normalizedOfx.slice(start, start + 500));
  }
  const blocks = rawBlocks.length > 0 ? rawBlocks : [content];
  const vencimentoFatura = findVencimentoFatura(content);
  const referenceBillingDate = options?.referenceBillingDate ?? vencimentoFatura;
  const items: ParsedItem[] = [];
  const stats = createParseStats("ofx", blocks.length);
  let idx = 0;
  for (const block of blocks) {
    const rawDesc = getTag(block, "MEMO") || getTag(block, "NAME") || "Compra OFX";
    const trnType = getTag(block, "TRNTYPE").toLowerCase();
    const valorStr = getTag(block, "TRNAMT");
    const valorSigned = parseFloat(valorStr.replace(",", "."));
    if (isNaN(valorSigned) || valorSigned === 0) {
      stats.skippedInvalidValue += 1;
      continue;
    }
    if (valorSigned < 0) {
      stats.skippedNegativeValue += 1;
      continue;
    }
    if (/credit|payment/.test(trnType) || PAYMENT_KEYWORDS.test(rawDesc)) {
      stats.skippedPaymentOrCredit += 1;
      continue;
    }
    const valorParcela = toMoneyNumber(formatMoneyFixed(valorSigned));
    const descricao = normalizarDescricao(rawDesc);
    const dtRaw = getTag(block, "DTPOSTED");
    let dataCompra = format(new Date(), "yyyy-MM-dd");
    const issues: string[] = [];
    let confidenceScore = 100;
    if (dtRaw && dtRaw.length >= 8) {
      dataCompra = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`;
    } else {
      const inferred = parseDateFromToken(dtRaw, { referenceBillingDate });
      if (inferred) {
        dataCompra = inferred.iso;
        if (inferred.issue) issues.push(inferred.issue);
        confidenceScore -= inferred.confidencePenalty;
      } else {
        issues.push("Data da compra inferida como hoje");
        confidenceScore -= 35;
      }
    }
    const instResult = extractInstallment(rawDesc);
    const parcelaAtual = instResult ? instResult.parcelaAtual : 1;
    const totalParcelas = instResult ? instResult.totalParcelas : 1;
    if (instResult?.ambiguous) {
      issues.push("Parcela atual inferida como 1");
      confidenceScore -= 10;
    }
    const valor = toMoneyNumber(multiply(valorParcela, totalParcelas));
    const parcelasRestantes = calculateParcelasRestantes(totalParcelas, parcelaAtual);
    const tipo = detectarTipo(rawDesc);
    const estabelecimento = extractEstabelecimento(descricao);
    const duplicata = checkDuplicata({
      valorParcela,
      valor,
      descricao,
      estabelecimento,
      dataCompra,
      parcelas: totalParcelas,
      parcelaAtual,
    }, existentes, cartaoId);
    const finalConfidence = Math.max(0, Math.min(100, confidenceScore));
    items.push({
      id: String(idx++),
      descricao,
      estabelecimento,
      valor,
      valorParcela,
      parcelas: totalParcelas,
      parcelaAtual,
      parcelasRestantes,
      dataCompra,
      vencimentoFatura,
      tipo,
      duplicata,
      action: duplicata ? "skip" : "import",
      confidenceScore: finalConfidence,
      confidenceLevel: finalConfidence >= 85 ? "alta" : finalConfidence >= 65 ? "media" : "baixa",
      reviewRequired: issues.length > 0 || finalConfidence < 75,
      validationIssues: issues,
    });
  }
  return { items, stats };
}

export function countIgnoredRows(stats: ParseStats): number {
  return (
    stats.skippedInvalidValue +
    stats.skippedNegativeValue +
    stats.skippedPaymentOrCredit +
    stats.skippedUnrecognized
  );
}

export function buildIgnoredDetails(stats: ParseStats): string | undefined {
  const reasons: string[] = [];
  if (stats.skippedNegativeValue > 0) reasons.push(`${stats.skippedNegativeValue} com valor negativo (credito/estorno)`);
  if (stats.skippedPaymentOrCredit > 0) reasons.push(`${stats.skippedPaymentOrCredit} com pagamento/estorno/reembolso`);
  if (stats.skippedInvalidValue > 0) reasons.push(`${stats.skippedInvalidValue} com valor invalido`);
  if (stats.skippedUnrecognized > 0) reasons.push(`${stats.skippedUnrecognized} nao reconhecida(s)`);
  if (reasons.length === 0) return undefined;
  return `Linhas ignoradas: ${reasons.join(", ")}.`;
}

