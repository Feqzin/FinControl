import { and, desc, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "../db.js";
import { cartoes, comprasCartao, importLogs, parcelasCompra, servicos, type InsertCompraCartao } from "../../shared/schema.js";
import { formatMoneyFixed, multiply, parseMoney } from "../../utils/money.js";
import { buildParcelasCompraRows } from "./parcelas-compra-materialization.js";
import type {
  ImportAction,
  ImportConfirmBodyInput,
  ImportPreviewBodyInput,
  ImportPreviewItemInput,
} from "../validators/import.validators.js";

type ConfidenceLevel = "alta" | "media" | "baixa";
type CanonicalImportItemStatus = "novo" | "duplicata_exata" | "possivel_duplicata" | "invalido";
type ServiceCategory = "streaming" | "software" | "lazer" | "assinatura" | "utilidades" | "outros";
type ImportServiceAction =
  | { type: "none" }
  | {
    type: "create_new";
    name: string;
    category: ServiceCategory;
    monthlyValue: number;
    billingDay: number;
  };
type DuplicateProbeRow = {
  id: string;
  descricao: string;
  valorTotal: string;
  valorParcela: string;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
  cartaoId: string;
};

export type ImportPreviewItem = {
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
  action: ImportAction;
  duplicateId: string | null;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  validationIssues: string[];
  canImport: boolean;
  reviewRequired: boolean;
  status: CanonicalImportItemStatus;
  forceImport: boolean;
  requiresForceImport: boolean;
  serviceAction: ImportServiceAction;
};

type ImportPreviewSummary = {
  totalItems: number;
  importItems: number;
  skipItems: number;
  reviewItems: number;
  duplicateItems: number;
  averageConfidence: number;
};

type ImportPreviewPayloadSnapshot = {
  items: ImportPreviewItem[];
  summary: ImportPreviewSummary;
};

type ImportConfirmResult = {
  importLogId: string;
  createdCount: number;
  skippedCount: number;
  createdCompraIds: string[];
  summary: {
    totalProcessed: number;
    createdCount: number;
    ignoredCount: number;
    blockedExactDuplicates: number;
    forcedExactDuplicates: number;
    invalidCount: number;
    errorCount: number;
    servicesCreatedCount: number;
    servicesSkippedCount: number;
  };
  alreadyConfirmed?: boolean;
};

type ImportRollbackResult = {
  importLogId: string;
  deletedCount: number;
  deletedCompraIds: string[];
  alreadyRolledBack?: boolean;
};

const IMPORT_LOG_SOURCE_TYPES = new Set(["texto", "csv", "ofx", "qfx", "manual"]);

function normalizeImportLogSourceType(sourceType: string): "texto" | "csv" | "ofx" | "qfx" | "manual" {
  if (sourceType === "pdf") {
    // Compatibilidade com constraint legado do banco:
    // o pipeline aceita PDF textual, mas source_type ainda nao inclui "pdf".
    return "texto";
  }
  if (IMPORT_LOG_SOURCE_TYPES.has(sourceType)) {
    return sourceType as "texto" | "csv" | "ofx" | "qfx" | "manual";
  }
  return "manual";
}

export class ImportPipelineError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDuplicateId(input: ImportPreviewItemInput): string | null {
  if (input.duplicateId) return input.duplicateId;

  if (
    input.duplicata &&
    typeof input.duplicata === "object" &&
    "id" in (input.duplicata as Record<string, unknown>) &&
    (input.duplicata as Record<string, unknown>).id
  ) {
    return String((input.duplicata as Record<string, unknown>).id);
  }

  return null;
}

function parseForceImport(input: ImportPreviewItemInput): boolean {
  return input.forceImport === true;
}

function normalizeServiceCategory(rawCategory: string | null | undefined): ServiceCategory {
  const normalized = (rawCategory ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "streaming") return "streaming";
  if (normalized === "software") return "software";
  if (normalized === "lazer") return "lazer";
  if (normalized === "assinatura") return "assinatura";
  if (normalized === "utilidades") return "utilidades";
  if (normalized === "outros") return "outros";
  if (normalized === "seguro") return "utilidades";
  if (normalized === "outro") return "outros";
  return "outros";
}

function normalizeServiceAction(input: ImportPreviewItemInput): ImportServiceAction {
  const raw = input.serviceAction;
  if (!raw || raw.type !== "create_new") {
    return { type: "none" };
  }

  const name = String(raw.name ?? "").trim();
  const monthlyValue = Number(raw.monthlyValue ?? Number.NaN);
  const billingDay = Number(raw.billingDay ?? Number.NaN);
  if (!name || !Number.isFinite(monthlyValue) || monthlyValue <= 0 || !Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
    throw new ImportPipelineError(400, "Dados inválidos para criar serviço.");
  }

  return {
    type: "create_new",
    name: name.slice(0, 120),
    category: normalizeServiceCategory(raw.category),
    monthlyValue,
    billingDay,
  };
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseComparableDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayDiff(a: string, b: string): number | null {
  const dateA = parseComparableDate(a);
  const dateB = parseComparableDate(b);
  if (!dateA || !dateB) return null;
  return Math.floor(Math.abs(dateA.getTime() - dateB.getTime()) / 86_400_000);
}

function extractComparableMerchant(descricao: string): string {
  const normalized = normalizeComparableText(descricao)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 4)
    .join(" ");
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

function toNumericMoney(value: number | string | null | undefined): number | null {
  const parsed = parseMoney(value ?? null);
  return parsed == null ? null : parsed;
}

function valuesAreEqualWithinTolerance(a: number | null, b: number | null, tolerance = 0.01): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function isExactDuplicateMatch(item: {
  descricao: string;
  estabelecimento?: string | null;
  valor: number | null;
  valorParcela: number | null;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
}, duplicateRow: DuplicateProbeRow | null): boolean {
  if (!duplicateRow) return false;

  const descricaoMatch = normalizeComparableText(item.descricao) === normalizeComparableText(duplicateRow.descricao);
  const estabelecimentoMatch = !item.estabelecimento
    || normalizeComparableText(item.estabelecimento) === extractComparableMerchant(duplicateRow.descricao);
  const valorTotalMatch = item.valor == null
    || valuesAreEqualWithinTolerance(item.valor, toNumericMoney(duplicateRow.valorTotal));
  const valorParcelaMatch = valuesAreEqualWithinTolerance(item.valorParcela, toNumericMoney(duplicateRow.valorParcela));
  const parcelasMatch = item.parcelas === duplicateRow.parcelas;
  const parcelaAtualMatch = item.parcelaAtual === duplicateRow.parcelaAtual;
  const dataCompraMatch = item.dataCompra === duplicateRow.dataCompra;

  return descricaoMatch && estabelecimentoMatch && valorParcelaMatch && valorTotalMatch && parcelasMatch && parcelaAtualMatch && dataCompraMatch;
}

function findPotentialDuplicateCandidate(
  item: {
    descricao: string;
    estabelecimento?: string | null;
    valor: number | null;
    valorParcela: number | null;
    parcelas: number;
    parcelaAtual: number;
    dataCompra: string;
    cartaoId: string;
  },
  duplicateRows: DuplicateProbeRow[],
): { row: DuplicateProbeRow; kind: "exact" | "possible" } | null {
  const normalizedDescricao = normalizeComparableText(item.descricao);
  const normalizedEstabelecimento = normalizeComparableText(item.estabelecimento ?? extractComparableMerchant(item.descricao));
  let best: { row: DuplicateProbeRow; score: number; kind: "exact" | "possible" } | null = null;

  for (const row of duplicateRows) {
    if (row.cartaoId !== item.cartaoId) continue;

    const rowValorParcela = toNumericMoney(row.valorParcela);
    const rowValorTotal = toNumericMoney(row.valorTotal);
    const rowDescricao = normalizeComparableText(row.descricao);
    const rowEstabelecimento = extractComparableMerchant(row.descricao);

    const diffParcela = item.valorParcela == null || rowValorParcela == null
      ? Number.POSITIVE_INFINITY
      : Math.abs(item.valorParcela - rowValorParcela);
    const diffTotal = item.valor == null || rowValorTotal == null
      ? Number.POSITIVE_INFINITY
      : Math.abs(item.valor - rowValorTotal);
    const dateDistance = dayDiff(item.dataCompra, row.dataCompra);
    const descricaoSimilarity = similarityByTokenOverlap(normalizedDescricao, rowDescricao);
    const estabelecimentoSimilarity = similarityByTokenOverlap(normalizedEstabelecimento, rowEstabelecimento);

    let score = 0;
    if (diffParcela <= 0.01) score += 4;
    else if (diffParcela <= 0.1) score += 2;
    if (diffTotal <= 0.05) score += 2;
    if (dateDistance === 0) score += 2;
    else if (dateDistance != null && dateDistance <= 3) score += 1;
    if (item.parcelas === row.parcelas) score += 1;
    if (item.parcelaAtual === row.parcelaAtual) score += 1;
    if (normalizedDescricao === rowDescricao) score += 3;
    else if (descricaoSimilarity >= 0.6) score += 2;
    else if (descricaoSimilarity >= 0.4) score += 1;
    if (normalizedEstabelecimento && estabelecimentoSimilarity >= 0.75) score += 1;

    const kind: "exact" | "possible" =
      diffParcela <= 0.01
      && diffTotal <= 0.05
      && dateDistance === 0
      && item.parcelas === row.parcelas
      && item.parcelaAtual === row.parcelaAtual
      && normalizedDescricao === rowDescricao
        ? "exact"
        : "possible";

    if (!best || score > best.score || (score === best.score && kind === "exact" && best.kind !== "exact")) {
      best = { row, score, kind };
    }
  }

  if (!best) return null;
  if (best.kind === "exact") return { row: best.row, kind: "exact" };
  if (best.score >= 6) return { row: best.row, kind: "possible" };
  return null;
}

function computeCanonicalStatus(input: {
  canImport: boolean;
  duplicateKind: "exact" | "possible" | null;
  duplicateRow: DuplicateProbeRow | null;
  descricao: string;
  estabelecimento?: string | null;
  valor: number | null;
  valorParcela: number | null;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
}): CanonicalImportItemStatus {
  if (!input.canImport) return "invalido";
  if (!input.duplicateRow && !input.duplicateKind) return "novo";
  if (input.duplicateKind === "exact") return "duplicata_exata";
  if (input.duplicateKind === "possible") return "possivel_duplicata";

  if (
    isExactDuplicateMatch(
      {
        descricao: input.descricao,
        estabelecimento: input.estabelecimento,
        valor: input.valor,
        valorParcela: input.valorParcela,
        parcelas: input.parcelas,
        parcelaAtual: input.parcelaAtual,
        dataCompra: input.dataCompra,
      },
      input.duplicateRow,
    )
  ) {
    return "duplicata_exata";
  }

  return "possivel_duplicata";
}

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 85) return "alta";
  if (score >= 65) return "media";
  return "baixa";
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function deserializeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeImportItem(
  input: ImportPreviewItemInput,
  index: number,
  options?: {
    duplicateRowsById?: Map<string, DuplicateProbeRow>;
    duplicateRows?: DuplicateProbeRow[];
    cartaoId?: string;
    mode?: "preview" | "confirm";
  },
): ImportPreviewItem {
  const issues: string[] = [];
  let score = 100;
  let canImport = true;

  const id = input.id ? String(input.id) : input.itemId ? String(input.itemId) : String(index);
  const descricao = input.descricao.trim();
  const valor = parseMoney(input.valor);
  const valorParcela = parseMoney(input.valorParcela);
  const parcelas = input.parcelas;
  const parcelaAtual = input.parcelaAtual;
  const dataCompra = input.dataCompra;
  const vencimentoFatura = input.vencimentoFatura ?? null;
  const tipo = input.tipo ?? "compra";
  const estabelecimento = input.estabelecimento?.trim() || null;
  const duplicateIdFromInput = parseDuplicateId(input);
  const serviceAction = normalizeServiceAction(input);
  const duplicateRowFromInput = duplicateIdFromInput ? (options?.duplicateRowsById?.get(duplicateIdFromInput) ?? null) : null;
  const candidateMatch = findPotentialDuplicateCandidate({
    descricao,
    estabelecimento,
    valor,
    valorParcela,
    parcelas,
    parcelaAtual,
    dataCompra,
    cartaoId: options?.cartaoId ?? "",
  }, options?.duplicateRows ?? []);
  const duplicateRow = duplicateRowFromInput ?? candidateMatch?.row ?? null;
  const duplicateId = duplicateRow?.id ?? duplicateIdFromInput;
  const duplicateKind: "exact" | "possible" | null =
    candidateMatch?.kind
    ?? (duplicateRowFromInput
      ? (isExactDuplicateMatch({
        descricao,
        estabelecimento,
        valor,
        valorParcela,
        parcelas,
        parcelaAtual,
        dataCompra,
      }, duplicateRowFromInput) ? "exact" : "possible")
      : null);
  const forceImport = parseForceImport(input);

  if (descricao.length < 3) {
    issues.push("Descricao curta");
    score -= 10;
  }

  if (valor == null || valor <= 0) {
    issues.push("Valor total invalido");
    score -= 40;
    canImport = false;
  }

  if (valorParcela == null || valorParcela <= 0) {
    issues.push("Valor da parcela invalido");
    score -= 40;
    canImport = false;
  }

  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 360) {
    issues.push("Total de parcelas invalido");
    score -= 40;
    canImport = false;
  }

  if (!Number.isInteger(parcelaAtual) || parcelaAtual < 1 || parcelaAtual > parcelas) {
    issues.push("Parcela atual invalida");
    score -= 35;
    canImport = false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCompra)) {
    issues.push("Data da compra invalida");
    score -= 35;
    canImport = false;
  }

  if (valor != null && valorParcela != null && parcelas >= 1) {
    const expectedTotal = parseMoney(multiply(valorParcela, parcelas)) ?? 0;
    const diff = Math.abs(expectedTotal - valor);
    if (diff > 0.05) {
      issues.push("Valor total divergente das parcelas");
      score -= 20;
    }
  }

  const parserIssues = Array.isArray(input.validationIssues)
    ? input.validationIssues
      .filter((issue) => typeof issue === "string")
      .map((issue) => issue.trim())
      .filter((issue) => issue.length > 0)
      .slice(0, 10)
    : [];
  if (parserIssues.length > 0) {
    for (const issue of parserIssues) {
      if (!issues.includes(issue)) issues.push(issue);
    }
    score -= Math.min(30, parserIssues.length * 6);
  }
  if (input.reviewRequired === true) {
    score -= 8;
  }
  if (typeof input.confidenceScore === "number" && Number.isFinite(input.confidenceScore)) {
    score = Math.min(score, clamp(input.confidenceScore, 0, 100));
  }

  const status = computeCanonicalStatus({
    canImport,
    duplicateKind,
    duplicateRow,
    descricao,
    estabelecimento,
    valor,
    valorParcela,
    parcelas,
    parcelaAtual,
    dataCompra,
  });

  if (status === "duplicata_exata") {
    issues.push("Duplicata exata detectada");
    score -= 40;
  } else if (status === "possivel_duplicata") {
    issues.push("Possivel duplicata");
    score -= 30;
  }

  score = clamp(score, 0, 100);
  const reviewRequired = status !== "novo" || issues.length > 0 || score < 75;
  const requestedAction: ImportAction =
    typeof input.shouldImport === "boolean"
      ? (input.shouldImport ? "import" : "skip")
      : (input.action ?? (status === "novo" ? "import" : "skip"));

  let action: ImportAction = requestedAction;
  if (options?.mode !== "confirm") {
    if (status === "invalido") {
      action = "skip";
    } else if (status === "duplicata_exata" && !forceImport) {
      action = "skip";
    }
  }

  return {
    id,
    descricao,
    valor: valor ?? 0,
    valorParcela: valorParcela ?? 0,
    parcelas,
    parcelaAtual,
    // Semantica padrao: restantes inclui a parcela atual em aberto.
    parcelasRestantes: calculateParcelasRestantes(parcelas, parcelaAtual),
    dataCompra,
    vencimentoFatura,
    tipo,
    action,
    duplicateId,
    confidenceScore: score,
    confidenceLevel: confidenceLevel(score),
    validationIssues: issues,
    canImport,
    reviewRequired,
    status,
    forceImport,
    requiresForceImport: status === "duplicata_exata",
    serviceAction,
  };
}

function calculateParcelasRestantes(parcelas: number, parcelaAtual: number): number {
  return Math.max(0, parcelas - parcelaAtual + 1);
}

function summarizePreview(items: ImportPreviewItem[]): ImportPreviewSummary {
  const totalItems = items.length;
  const importItems = items.filter((item) => item.action === "import").length;
  const skipItems = totalItems - importItems;
  const reviewItems = items.filter((item) => item.reviewRequired).length;
  const duplicateItems = items.filter((item) => item.duplicateId != null).length;
  const averageConfidence = totalItems > 0
    ? items.reduce((sum, item) => sum + item.confidenceScore, 0) / totalItems
    : 0;

  return {
    totalItems,
    importItems,
    skipItems,
    reviewItems,
    duplicateItems,
    averageConfidence,
  };
}

function summarizeConfirmResult(items: ImportPreviewItem[], createdCount: number, servicesCreatedCount = 0) {
  const totalProcessed = items.length;
  const invalidCount = items.filter((item) => item.status === "invalido").length;
  const forcedExactDuplicates = items.filter((item) => (
    item.status === "duplicata_exata" && item.action === "import" && item.forceImport === true
  )).length;
  const blockedExactDuplicates = items.filter((item) => (
    item.status === "duplicata_exata" && (item.action !== "import" || item.forceImport !== true)
  )).length;
  const ignoredCount = items.filter((item) => item.action !== "import").length;

  return {
    totalProcessed,
    createdCount,
    ignoredCount,
    blockedExactDuplicates,
    forcedExactDuplicates,
    invalidCount,
    errorCount: 0,
    servicesCreatedCount,
    servicesSkippedCount: 0,
  };
}

function normalizeServiceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function hasSimilarService(
  existingServices: Array<{ nome: string; valorMensal: string }>,
  candidate: { name: string; monthlyValue: number },
): boolean {
  const candidateName = normalizeServiceName(candidate.name);
  if (!candidateName) return false;

  return existingServices.some((service) => {
    const existingName = normalizeServiceName(service.nome);
    if (!existingName) return false;

    const exactName = existingName === candidateName;
    const similarName = similarityByTokenOverlap(existingName, candidateName) >= 0.75;
    if (!exactName && !similarName) return false;

    const existingValue = parseMoney(service.valorMensal) ?? 0;
    const diff = Math.abs(existingValue - candidate.monthlyValue);
    const valueTolerance = Math.max(2, candidate.monthlyValue * 0.1);
    return diff <= valueTolerance;
  });
}

function toCompraInsert(userId: string, cartaoId: string, item: ImportPreviewItem): InsertCompraCartao {
  return {
    userId,
    cartaoId,
    descricao: item.descricao,
    valorTotal: formatMoneyFixed(item.valor) ?? "0.00",
    parcelas: item.parcelas,
    // parcelaAtual representa a parcela corrente em aberto.
    parcelaAtual: item.parcelaAtual,
    valorParcela: formatMoneyFixed(item.valorParcela) ?? "0.00",
    dataCompra: item.dataCompra,
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  };
}

export class ImportsService {
  constructor(
    private readonly deps: {
      buildParcelasCompraRows?: typeof buildParcelasCompraRows;
    } = {},
  ) {}

  private getBuildParcelasCompraRows() {
    return this.deps.buildParcelasCompraRows ?? buildParcelasCompraRows;
  }

  async preview(userId: string, payload: ImportPreviewBodyInput) {
    const [cartao] = await db.select().from(cartoes).where(and(eq(cartoes.id, payload.cartaoId), eq(cartoes.userId, userId)));
    if (!cartao) {
      throw new ImportPipelineError(400, "Cartao not found");
    }

    const duplicateRows = await db.select({
      id: comprasCartao.id,
      descricao: comprasCartao.descricao,
      valorTotal: comprasCartao.valorTotal,
      valorParcela: comprasCartao.valorParcela,
      parcelas: comprasCartao.parcelas,
      parcelaAtual: comprasCartao.parcelaAtual,
      dataCompra: comprasCartao.dataCompra,
      cartaoId: comprasCartao.cartaoId,
    }).from(comprasCartao).where(and(
      eq(comprasCartao.userId, userId),
      eq(comprasCartao.cartaoId, payload.cartaoId),
    ));
    const duplicateRowsById = new Map(duplicateRows.map((row) => [row.id, row] as const));

    const previewItems = payload.items.map((item, index) => normalizeImportItem(item, index, {
      duplicateRowsById,
      duplicateRows,
      cartaoId: payload.cartaoId,
      mode: "preview",
    }));
    const summary = summarizePreview(previewItems);
    const snapshot: ImportPreviewPayloadSnapshot = { items: previewItems, summary };

    const [log] = await db.insert(importLogs).values({
      userId,
      cartaoId: payload.cartaoId,
      sourceType: normalizeImportLogSourceType(payload.sourceType),
      sourceName: payload.sourceName ?? null,
      status: "previewed",
      requestPayload: serializeJson(payload),
      previewPayload: serializeJson(snapshot),
      totalItems: summary.totalItems,
      importedItems: summary.importItems,
      skippedItems: summary.skipItems,
      averageConfidence: summary.averageConfidence.toFixed(2),
    }).returning();

    return {
      importLogId: log.id,
      items: previewItems,
      summary,
    };
  }

  async confirm(userId: string, payload: ImportConfirmBodyInput): Promise<ImportConfirmResult> {
    const [log] = await db.select().from(importLogs).where(and(eq(importLogs.id, payload.importLogId), eq(importLogs.userId, userId)));
    if (!log) {
      throw new ImportPipelineError(404, "Import log not found");
    }

    if (log.status === "rolled_back") {
      throw new ImportPipelineError(409, "Import already rolled back");
    }

    if (log.status === "confirmed") {
      const existingIds = deserializeJson<string[]>(log.createdCompraIds, []);
      const confirmedPayload = deserializeJson<ImportPreviewItem[]>(log.confirmedPayload, []);
      const servicesCreatedCount = confirmedPayload.filter((item) => (
        item.action === "import" && item.serviceAction?.type === "create_new"
      )).length;
      const summary = confirmedPayload.length > 0
        ? summarizeConfirmResult(confirmedPayload, existingIds.length, servicesCreatedCount)
        : {
          totalProcessed: Math.max(log.totalItems, existingIds.length + log.skippedItems),
          createdCount: existingIds.length,
          ignoredCount: log.skippedItems,
          blockedExactDuplicates: 0,
          forcedExactDuplicates: 0,
          invalidCount: 0,
          errorCount: 0,
          servicesCreatedCount: 0,
          servicesSkippedCount: 0,
        };
      return {
        importLogId: log.id,
        createdCount: existingIds.length,
        skippedCount: log.skippedItems,
        createdCompraIds: existingIds,
        summary,
        alreadyConfirmed: true,
      };
    }

    const snapshot = deserializeJson<ImportPreviewPayloadSnapshot>(log.previewPayload, { items: [], summary: summarizePreview([]) });
    const sourceItems = payload.items ?? snapshot.items;
    const duplicateRows = await db.select({
      id: comprasCartao.id,
      descricao: comprasCartao.descricao,
      valorTotal: comprasCartao.valorTotal,
      valorParcela: comprasCartao.valorParcela,
      parcelas: comprasCartao.parcelas,
      parcelaAtual: comprasCartao.parcelaAtual,
      dataCompra: comprasCartao.dataCompra,
      cartaoId: comprasCartao.cartaoId,
    }).from(comprasCartao).where(and(
      eq(comprasCartao.userId, userId),
      eq(comprasCartao.cartaoId, log.cartaoId),
    ));
    const duplicateRowsById = new Map(duplicateRows.map((row) => [row.id, row] as const));

    const candidateItems = sourceItems.map((item, index) => normalizeImportItem(item, index, {
      duplicateRowsById,
      duplicateRows,
      cartaoId: log.cartaoId,
      mode: "confirm",
    }));

    if (candidateItems.length === 0) {
      throw new ImportPipelineError(400, "Nenhum item para confirmar");
    }

    const importItems = candidateItems.filter((item) => item.action === "import");
    if (importItems.length > 0 && payload.userConfirmed !== true) {
      throw new ImportPipelineError(400, "Confirmacao explicita do usuario e obrigatoria.");
    }

    const invalidImportItems = importItems.filter((item) => item.status === "invalido");
    if (invalidImportItems.length > 0) {
      throw new ImportPipelineError(
        400,
        "Existem itens com erro de validacao. Corrija antes de confirmar.",
        {
          blockedIds: invalidImportItems.map((item) => item.id),
          issues: invalidImportItems.map((item) => ({ id: item.id, validationIssues: item.validationIssues })),
        },
      );
    }

    const exactDuplicatesWithoutForce = importItems.filter((item) => (
      item.status === "duplicata_exata" && item.forceImport !== true
    ));
    if (exactDuplicatesWithoutForce.length > 0) {
      throw new ImportPipelineError(
        400,
        "Duplicatas exatas exigem confirmacao explicita para forcar importacao.",
        {
          blockedIds: exactDuplicatesWithoutForce.map((item) => item.id),
        },
      );
    }

    const createServiceItems = candidateItems.filter((item) => item.serviceAction.type === "create_new");
    const createServiceIgnoredItems = createServiceItems.filter((item) => item.action !== "import");
    if (createServiceIgnoredItems.length > 0) {
      throw new ImportPipelineError(
        400,
        "Ação de criar serviço só é permitida para itens marcados para importação.",
        { blockedIds: createServiceIgnoredItems.map((item) => item.id) },
      );
    }

    const createServiceInvalidItems = createServiceItems.filter((item) => item.status === "invalido");
    if (createServiceInvalidItems.length > 0) {
      throw new ImportPipelineError(
        400,
        "Não é possível criar serviço para itens inválidos.",
        { blockedIds: createServiceInvalidItems.map((item) => item.id) },
      );
    }

    const createServiceExactDupWithoutForce = createServiceItems.filter((item) => (
      item.status === "duplicata_exata" && item.forceImport !== true
    ));
    if (createServiceExactDupWithoutForce.length > 0) {
      throw new ImportPipelineError(
        400,
        "Duplicatas exatas exigem forçar importação antes de criar serviço.",
        { blockedIds: createServiceExactDupWithoutForce.map((item) => item.id) },
      );
    }

    const rowsToInsert = importItems.map((item) => toCompraInsert(userId, log.cartaoId, item));

    const summary = summarizePreview(candidateItems);
    const transactionResult = await db.transaction(async (tx) => {
      const createdRows = rowsToInsert.length > 0
        ? await tx.insert(comprasCartao).values(rowsToInsert).returning()
        : [];

      if (createdRows.length > 0) {
        const buildRows = this.getBuildParcelasCompraRows();
        const parcelasRows = createdRows.flatMap((row) => buildRows(row));
        if (parcelasRows.length > 0) {
          await tx.insert(parcelasCompra).values(parcelasRows);
        }
      }

      const existingServices = await tx.select({
        nome: servicos.nome,
        valorMensal: servicos.valorMensal,
      }).from(servicos).where(eq(servicos.userId, userId));

      let servicesCreatedCount = 0;
      for (let index = 0; index < importItems.length; index += 1) {
        const item = importItems[index];
        if (item?.serviceAction.type !== "create_new") continue;

        const createdCompra = createdRows[index];
        if (!createdCompra) {
          throw new ImportPipelineError(409, "Não foi possível vincular serviço à compra criada.");
        }

        const serviceAction = item.serviceAction;
        if (hasSimilarService(existingServices, serviceAction)) {
          throw new ImportPipelineError(
            409,
            "Já existe um serviço parecido. Vincule ao serviço existente ou altere a escolha.",
            { itemId: item.id },
          );
        }

        const valorMensal = formatMoneyFixed(serviceAction.monthlyValue);
        if (!valorMensal) {
          throw new ImportPipelineError(400, "Valor mensal inválido para criação de serviço.");
        }

        await tx.insert(servicos).values({
          userId,
          nome: serviceAction.name,
          categoria: serviceAction.category,
          valorMensal,
          dataCobranca: serviceAction.billingDay,
          formaPagamento: "cartao",
          compraCartaoId: createdCompra.id,
          status: "ativo",
          iconeId: null,
        });

        existingServices.push({
          nome: serviceAction.name,
          valorMensal,
        });
        servicesCreatedCount += 1;
      }

      const ids = createdRows.map((row) => row.id);

      const [updatedLog] = await tx.update(importLogs).set({
        status: "confirmed",
        confirmedPayload: serializeJson(candidateItems),
        createdCompraIds: serializeJson(ids),
        importedItems: summary.importItems,
        skippedItems: summary.skipItems,
        averageConfidence: summary.averageConfidence.toFixed(2),
        errorMessage: null,
        confirmedAt: new Date(),
      }).where(and(eq(importLogs.id, log.id), eq(importLogs.userId, userId))).returning({
        id: importLogs.id,
      });

      if (!updatedLog) {
        throw new ImportPipelineError(409, "Import log nao encontrado durante a confirmacao");
      }

      return {
        ids,
        servicesCreatedCount,
      };
    });

    return {
      importLogId: log.id,
      createdCount: transactionResult.ids.length,
      skippedCount: summary.skipItems,
      createdCompraIds: transactionResult.ids,
      summary: summarizeConfirmResult(candidateItems, transactionResult.ids.length, transactionResult.servicesCreatedCount),
    };
  }

  async rollback(userId: string, importLogId: string): Promise<ImportRollbackResult> {
    const [log] = await db.select().from(importLogs).where(and(eq(importLogs.id, importLogId), eq(importLogs.userId, userId)));
    if (!log) {
      throw new ImportPipelineError(404, "Import log not found");
    }

    if (log.status === "rolled_back") {
      return {
        importLogId: log.id,
        deletedCount: 0,
        deletedCompraIds: [],
        alreadyRolledBack: true,
      };
    }

    if (log.status !== "confirmed") {
      throw new ImportPipelineError(409, "Only confirmed imports can be rolled back");
    }

    const requestedIds = deserializeJson<string[]>(log.createdCompraIds, []);
    const deletedCompraIds = await db.transaction(async (tx) => {
      const deletedRows = requestedIds.length > 0
        ? await tx.delete(comprasCartao)
          .where(and(eq(comprasCartao.userId, userId), inArray(comprasCartao.id, requestedIds)))
          .returning({ id: comprasCartao.id })
        : [];

      const ids = deletedRows.map((row) => row.id);

      const [updatedLog] = await tx.update(importLogs).set({
        status: "rolled_back",
        rollbackPayload: serializeJson({
          requestedIds,
          deletedIds: ids,
          rolledBackAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX"),
        }),
        rolledBackAt: new Date(),
      }).where(and(eq(importLogs.id, log.id), eq(importLogs.userId, userId))).returning({
        id: importLogs.id,
      });

      if (!updatedLog) {
        throw new ImportPipelineError(409, "Import log nao encontrado durante o rollback");
      }

      return ids;
    });

    return {
      importLogId: log.id,
      deletedCount: deletedCompraIds.length,
      deletedCompraIds,
    };
  }

  async list(userId: string, limit = 20) {
    const safeLimit = clamp(limit, 1, 100);
    const rows = await db.select().from(importLogs)
      .where(eq(importLogs.userId, userId))
      .orderBy(desc(importLogs.createdAt))
      .limit(safeLimit);

    return rows.map((row) => ({
      id: row.id,
      cartaoId: row.cartaoId,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      status: row.status,
      totalItems: row.totalItems,
      importedItems: row.importedItems,
      skippedItems: row.skippedItems,
      averageConfidence: parseMoney(row.averageConfidence) ?? 0,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
      rolledBackAt: row.rolledBackAt,
    }));
  }
}
