import { format } from "date-fns";
import type { CompraCartao } from "@shared/schema";
import { formatMoneyFixed, multiply, parseMoney, toMoneyNumber } from "@/lib/money";

export interface ParsedItem {
  id: string;
  descricao: string;
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

function extractAllISODates(str: string): { iso: string; raw: string; index: number }[] {
  const results: { iso: string; raw: string; index: number }[] = [];
  const re = /(\d{2})\/(\d{2})\/(\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    const mo = m[2]; const d = m[1];
    const intY = parseInt(y); const intMo = parseInt(mo); const intD = parseInt(d);
    if (intMo >= 1 && intMo <= 12 && intD >= 1 && intD <= 31 && intY >= 2000 && intY <= 2050) {
      results.push({ iso: `${y}-${mo}-${d}`, raw: m[0], index: m.index });
    }
  }
  return results;
}

function extractInstallment(str: string): { parcelaAtual: number; totalParcelas: number; raw: string } | null {
  // Priority 1: explicit "Parcela X/Y" keyword (Portuguese CSV format)
  const kwRe = /\bparcela\s+(\d{1,2})\/(\d{1,2})\b/gi;
  let km: RegExpExecArray | null;
  while ((km = kwRe.exec(str)) !== null) {
    const x = parseInt(km[1]); const y = parseInt(km[2]);
    if (x >= 1 && y >= 1 && x <= y && y <= 48) {
      return { parcelaAtual: x, totalParcelas: y, raw: km[0] };
    }
  }
  // Priority 2: generic X/Y (where Y >= 2 to avoid date confusion)
  const re = /\b(\d{1,2})\/(\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const x = parseInt(m[1]); const y = parseInt(m[2]);
    if (x >= 1 && y >= 2 && x <= y && y <= 48) {
      return { parcelaAtual: x, totalParcelas: y, raw: m[0] };
    }
  }
  return null;
}

function extractMonetaryValue(str: string): { valor: number; raw: string } | null {
  const patterns = [
    /R?\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/,
    /R?\$\s*([\d]{1,3}(?:,\d{3})*\.\d{2})/,
    /(?<!\d)([\d]{1,3}(?:\.\d{3})*,\d{2})(?!\d)/,
  ];
  for (const pat of patterns) {
    const m = str.match(pat);
    if (m) {
      const raw = m[1];
      const clean = raw.includes(",") && raw.indexOf(",") > raw.indexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "").replace(/\.(?=\d{3})/g, "");
      const v = parseMoney(clean);
      if (v != null && v > 0 && v < 1_000_000) return { valor: v, raw: m[0] };
    }
  }
  return null;
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
  // Replace asterisks with space (e.g. "AMAZON*MKTPL")
  s = s.replace(/\*/g, " ");
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

function parseLinha(linha: string, vencimentoFatura: string | null): Omit<ParsedItem, "id" | "duplicata" | "action"> | null {
  const valResult = extractMonetaryValue(linha);
  if (!valResult) return null;
  const valorParcela = valResult.valor; // value on the line = this installment's amount

  const fullDates = extractAllISODates(linha);

  let working = linha;
  for (const d of [...fullDates].reverse()) {
    working = working.slice(0, d.index) + " " + working.slice(d.index + d.raw.length);
  }
  working = working.replace(valResult.raw, " ");

  const instResult = extractInstallment(working);
  const parcelaAtual = instResult ? instResult.parcelaAtual : 1;
  const totalParcelas = instResult ? instResult.totalParcelas : 1;
  if (instResult) working = working.replace(instResult.raw, " ");

  const descricao = normalizarDescricao(working);
  const dataCompra = fullDates.length > 0 ? fullDates[0].iso : format(new Date(), "yyyy-MM-dd");
  const valor = toMoneyNumber(multiply(valorParcela, totalParcelas)); // true total
  const parcelasRestantes = calculateParcelasRestantes(totalParcelas, parcelaAtual);
  const tipo = detectarTipo(linha);

  return { descricao, valor, valorParcela, parcelas: totalParcelas, parcelaAtual, parcelasRestantes, dataCompra, vencimentoFatura, tipo };
}

function checkDuplicata(item: { valorParcela: number; descricao: string }, existentes: CompraCartao[], cartaoId: string) {
  return existentes.find((e) => {
    const diffVal = Math.abs(toMoneyNumber(e.valorParcela) - item.valorParcela) / (item.valorParcela || 1);
    const key = item.descricao.toLowerCase().replace(/\s+/g, "").slice(0, 8);
    const ekey = e.descricao.toLowerCase().replace(/\s+/g, "").slice(0, 8);
    return diffVal < 0.06 && (key === ekey || key.includes(ekey.slice(0, 5)) || ekey.includes(key.slice(0, 5))) && e.cartaoId === cartaoId;
  }) || null;
}

function parseTexto(text: string, existentes: CompraCartao[], cartaoId: string): ParseResult {
  const vencimentoFatura = findVencimentoFatura(text);
  const linhas = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  const stats = createParseStats("texto", linhas.length);
  let idx = 0;
  for (const linha of linhas) {
    const parsed = parseLinha(linha, vencimentoFatura);
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

function parseCsvDate(raw: string): string {
  const s = raw.trim().replace(/"/g, "");
  // ISO: 2026-02-17
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // BR: 17/02/2026
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  // Short BR: 17/02/26
  const br2 = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (br2) return `20${br2[3]}-${br2[2]}-${br2[1]}`;
  // American: 02/17/2026
  const us = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return format(new Date(), "yyyy-MM-dd");
}

const PAYMENT_KEYWORDS = /pagamento\s*(recebido|de\s*fatura|efetuado)|credito\s*em\s*conta|estorno|reembolso|cashback/i;

export function parseCsv(content: string, existentes: CompraCartao[], cartaoId: string): ParseResult {
  // Detect separator: prefer comma for simple CSV, semicolon for BR exports
  const firstLine = content.split(/\n/)[0] ?? "";
  const sep = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const linhas = content.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return parseTexto(content, existentes, cartaoId);

  const rawHeaders = linhas[0].split(sep).map((h) => h.replace(/"/g, "").trim());
  const headers = rawHeaders.map((h) => h.toLowerCase());

  // Column detection — "title" and "amount" are explicit Nubank/inter CSV names
  const dateIdx = headers.findIndex((h) => /^date$|^data$|data.compra|lança|post/i.test(h));
  const descIdx = headers.findIndex((h) => /^title$|^desc|^hist|^memo|^nome$|^lancamento/i.test(h));
  const valIdx  = headers.findIndex((h) => /^amount$|^valor$|^value$|trnamt|debito|credito/i.test(h));

  if (valIdx < 0 && descIdx < 0) return parseTexto(content, existentes, cartaoId);

  const vencimentoFatura = findVencimentoFatura(content);
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

    const dataCompra = parseCsvDate(dataRaw);

    // Extract installments from the raw title BEFORE cleaning
    const instResult = extractInstallment(rawDesc);
    const parcelaAtual = instResult ? instResult.parcelaAtual : 1;
    const totalParcelas = instResult ? instResult.totalParcelas : 1;
    const parcelasRestantes = calculateParcelasRestantes(totalParcelas, parcelaAtual);
    const valorTotal = toMoneyNumber(multiply(valorParcela, totalParcelas));

    // Clean description after extracting installment info
    const descricao = normalizarDescricao(rawDesc);
    const tipo = detectarTipo(rawDesc);

    const duplicata = checkDuplicata({ valorParcela, descricao }, existentes, cartaoId);
    items.push({
      id: String(idx++),
      descricao,
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
    });
  }

  if (
    items.length === 0 &&
    stats.skippedInvalidValue === 0 &&
    stats.skippedNegativeValue === 0 &&
    stats.skippedPaymentOrCredit === 0
  ) {
    return parseTexto(content, existentes, cartaoId);
  }

  return { items, stats };
}

export function parseOfx(content: string, existentes: CompraCartao[], cartaoId: string): ParseResult {
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
    if (dtRaw && dtRaw.length >= 8) dataCompra = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`;
    const instResult = extractInstallment(rawDesc);
    const parcelaAtual = instResult ? instResult.parcelaAtual : 1;
    const totalParcelas = instResult ? instResult.totalParcelas : 1;
    const valor = toMoneyNumber(multiply(valorParcela, totalParcelas));
    const parcelasRestantes = calculateParcelasRestantes(totalParcelas, parcelaAtual);
    const tipo = detectarTipo(rawDesc);
    const duplicata = checkDuplicata({ valorParcela, descricao }, existentes, cartaoId);
    items.push({ id: String(idx++), descricao, valor, valorParcela, parcelas: totalParcelas, parcelaAtual, parcelasRestantes, dataCompra, vencimentoFatura, tipo, duplicata, action: duplicata ? "skip" : "import" });
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

