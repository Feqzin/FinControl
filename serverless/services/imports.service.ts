import { and, desc, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "../db.js";
import {
  cartoes,
  comprasCartao,
  importLogs,
  parcelasCompra,
  servicos,
  servicoPagamentos,
  servicoPessoas,
  type InsertCompraCartao,
} from "../../shared/schema.js";
import {
  SERVICO_CATEGORY_DEFAULT_VALUE,
  type ServicoCategory,
  resolveServicoCategoryValue,
} from "../../shared/service-categories.js";
import { formatMoneyFixed, multiply, parseMoney } from "../../utils/money.js";
import { buildParcelasCompraRows } from "./parcelas-compra-materialization.js";
import type {
  ImportAction,
  ImportConfirmBodyInput,
  ImportPreviewBodyInput,
  ImportPreviewItemInput,
  ImportReconcilePurchaseBodyInput,
} from "../validators/import.validators.js";

type ConfidenceLevel = "alta" | "media" | "baixa";
type CanonicalImportItemStatus = "novo" | "duplicata_exata" | "possivel_duplicata" | "invalido";
type ImportServiceAction =
  | { type: "none" }
  | {
    type: "create_new";
    name: string;
    category: ServicoCategory;
    monthlyValue: number;
    billingDay: number;
  }
  | {
    type: "link_existing";
    serviceId: string;
    replaceExistingLink: boolean;
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
  reconcileActions?: ReconcileRollbackActionSnapshot[];
};

type CompraReconcileSnapshot = {
  descricao: string;
  valorTotal: string;
  valorParcela: string;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
  vencimentoFatura: string | null;
};

type ReconcileRollbackActionSnapshot = {
  itemId: string;
  action: "replace_existing";
  existingCompraCartaoId: string;
  updatedCompraCartaoId: string;
  previousSnapshot: CompraReconcileSnapshot;
  appliedSnapshot: CompraReconcileSnapshot;
  valueChanged: boolean;
  parcelasChanged: boolean;
  purchaseDateChanged: boolean;
  descriptionChanged: boolean;
  updateNameFromImport: boolean;
  protectedParcelasCount: number;
  recordedAt: string;
};

type ServiceRollbackActionSnapshot = {
  itemId: string;
  action: "create_new" | "link_existing";
  serviceId: string;
  compraCartaoId: string;
  previousCompraCartaoId: string | null;
  serviceCreatedByImport: boolean;
  createdServiceSnapshot?: {
    nome: string;
    categoria: string;
    valorMensal: string;
    dataCobranca: number;
    formaPagamento: string;
  };
  recordedAt: string;
};

type ImportConfirmedPayloadSnapshot = {
  items: ImportPreviewItem[];
  serviceActions: ServiceRollbackActionSnapshot[];
  reconcileActions: ReconcileRollbackActionSnapshot[];
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
    servicesLinkedCount: number;
    servicesLinkSkippedCount: number;
    reconciledExistingCount?: number;
  };
  alreadyConfirmed?: boolean;
};

type ImportRollbackResult = {
  importLogId: string;
  deletedCount: number;
  deletedCompraIds: string[];
  servicesRemovedCount: number;
  servicesUnlinkedCount: number;
  servicesRestoredCount: number;
  serviceRollbackWarnings: string[];
  alreadyRolledBack?: boolean;
};

type ImportReconcilePurchaseResult = {
  existingCompraCartaoId: string;
  updatedCompraCartaoId: string;
  updated: boolean;
  valueChanged: boolean;
  parcelasChanged: boolean;
  descriptionChanged: boolean;
  blockedByProtection: boolean;
  protectedParcelasCount: number;
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

function normalizeServiceCategory(rawCategory: string | null | undefined): ServicoCategory {
  return resolveServicoCategoryValue(rawCategory) ?? SERVICO_CATEGORY_DEFAULT_VALUE;
}

function normalizeServiceAction(input: ImportPreviewItemInput): ImportServiceAction {
  const raw = input.serviceAction;
  if (!raw || raw.type === "none") {
    return { type: "none" };
  }

  if (raw.type === "link_existing") {
    const serviceId = String(raw.serviceId ?? "").trim();
    if (!serviceId) {
      throw new ImportPipelineError(400, "Serviço inválido para vínculo.");
    }

    return {
      type: "link_existing",
      serviceId,
      replaceExistingLink: raw.replaceExistingLink === true,
    };
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

function parsePreviewPayloadSnapshot(value: string | null | undefined): ImportPreviewPayloadSnapshot {
  const fallback: ImportPreviewPayloadSnapshot = {
    items: [],
    summary: summarizePreview([]),
    reconcileActions: [],
  };
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    const objectValue = parsed as Record<string, unknown>;
    const rawItems = objectValue.items;
    const rawSummary = objectValue.summary;
    const rawReconcileActions = objectValue.reconcileActions;

    return {
      items: Array.isArray(rawItems) ? (rawItems as ImportPreviewItem[]) : [],
      summary: rawSummary && typeof rawSummary === "object"
        ? (rawSummary as ImportPreviewSummary)
        : summarizePreview([]),
      reconcileActions: Array.isArray(rawReconcileActions)
        ? (rawReconcileActions as ReconcileRollbackActionSnapshot[])
        : [],
    };
  } catch {
    return fallback;
  }
}

function parseConfirmedPayloadSnapshot(value: string | null | undefined): ImportConfirmedPayloadSnapshot {
  if (!value) return { items: [], serviceActions: [], reconcileActions: [] };

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return {
        items: parsed as ImportPreviewItem[],
        serviceActions: [],
        reconcileActions: [],
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return { items: [], serviceActions: [], reconcileActions: [] };
    }

    const objectValue = parsed as Record<string, unknown>;
    const rawItems = objectValue.items;
    const rawServiceActions = objectValue.serviceActions;
    const rawReconcileActions = objectValue.reconcileActions;

    return {
      items: Array.isArray(rawItems) ? (rawItems as ImportPreviewItem[]) : [],
      serviceActions: Array.isArray(rawServiceActions)
        ? (rawServiceActions as ServiceRollbackActionSnapshot[])
        : [],
      reconcileActions: Array.isArray(rawReconcileActions)
        ? (rawReconcileActions as ReconcileRollbackActionSnapshot[])
        : [],
    };
  } catch {
    return { items: [], serviceActions: [], reconcileActions: [] };
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

function summarizeConfirmResult(
  items: ImportPreviewItem[],
  createdCount: number,
  servicesCreatedCount = 0,
  servicesLinkedCount = 0,
  reconciledExistingCount = 0,
) {
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
    servicesLinkedCount,
    servicesLinkSkippedCount: 0,
    reconciledExistingCount,
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

function hasParcelaComprovante(
  row: Pick<
    typeof parcelasCompra.$inferSelect,
    "comprovantePath" | "comprovanteNome" | "comprovanteMimeType" | "comprovanteTamanho" | "comprovanteEnviadoEm"
  >,
): boolean {
  return Boolean(
    row.comprovantePath
    || row.comprovanteNome
    || row.comprovanteMimeType
    || row.comprovanteTamanho != null
    || row.comprovanteEnviadoEm != null,
  );
}

function isParcelaProtectedForReconcile(
  row: Pick<
    typeof parcelasCompra.$inferSelect,
    | "statusCartao"
    | "dataPagamentoCartao"
    | "statusPessoa"
    | "dataPagamentoPessoa"
    | "comprovantePath"
    | "comprovanteNome"
    | "comprovanteMimeType"
    | "comprovanteTamanho"
    | "comprovanteEnviadoEm"
  >,
): boolean {
  if (row.statusCartao === "pago") return true;
  if (row.dataPagamentoCartao) return true;
  if (row.statusPessoa === "pago") return true;
  if (row.dataPagamentoPessoa) return true;
  if (hasParcelaComprovante(row)) return true;
  return false;
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
      const confirmedSnapshot = parseConfirmedPayloadSnapshot(log.confirmedPayload);
      const confirmedItems = confirmedSnapshot.items;
      const reconciledExistingCount = confirmedSnapshot.reconcileActions.length;
      const servicesCreatedCount = confirmedItems.filter((item) => (
        item.action === "import" && item.serviceAction?.type === "create_new"
      )).length;
      const servicesLinkedCount = confirmedItems.filter((item) => (
        item.action === "import" && item.serviceAction?.type === "link_existing"
      )).length;
      const summary = confirmedItems.length > 0
        ? summarizeConfirmResult(
          confirmedItems,
          existingIds.length,
          servicesCreatedCount,
          servicesLinkedCount,
          reconciledExistingCount,
        )
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
          servicesLinkedCount: 0,
          servicesLinkSkippedCount: 0,
          reconciledExistingCount,
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

    const snapshot = parsePreviewPayloadSnapshot(log.previewPayload);
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

    const linkServiceItems = candidateItems.filter((item) => item.serviceAction.type === "link_existing");
    const linkServiceIgnoredItems = linkServiceItems.filter((item) => item.action !== "import");
    if (linkServiceIgnoredItems.length > 0) {
      throw new ImportPipelineError(
        400,
        "Ação de vincular serviço só é permitida para itens marcados para importação.",
        { blockedIds: linkServiceIgnoredItems.map((item) => item.id) },
      );
    }

    const linkServiceInvalidItems = linkServiceItems.filter((item) => item.status === "invalido");
    if (linkServiceInvalidItems.length > 0) {
      throw new ImportPipelineError(
        400,
        "Não é possível vincular serviço para itens inválidos.",
        { blockedIds: linkServiceInvalidItems.map((item) => item.id) },
      );
    }

    const linkServiceExactDupWithoutForce = linkServiceItems.filter((item) => (
      item.status === "duplicata_exata" && item.forceImport !== true
    ));
    if (linkServiceExactDupWithoutForce.length > 0) {
      throw new ImportPipelineError(
        400,
        "Duplicatas exatas exigem forçar importação antes de vincular serviço.",
        { blockedIds: linkServiceExactDupWithoutForce.map((item) => item.id) },
      );
    }

    const rowsToInsert = importItems.map((item) => toCompraInsert(userId, log.cartaoId, item));

    const summary = summarizePreview(candidateItems);
    const transactionResult = await db.transaction(async (tx) => {
      const [cardCycle] = await tx.select({
        diaVencimento: cartoes.diaVencimento,
        melhorDiaCompra: cartoes.melhorDiaCompra,
      }).from(cartoes).where(and(
        eq(cartoes.id, log.cartaoId),
        eq(cartoes.userId, userId),
      )).limit(1);

      if (!cardCycle) {
        throw new ImportPipelineError(400, "Cartão de destino não encontrado para materializar parcelas.");
      }

      const createdRows = rowsToInsert.length > 0
        ? await tx.insert(comprasCartao).values(rowsToInsert).returning()
        : [];

      if (createdRows.length > 0) {
        const buildRows = this.getBuildParcelasCompraRows();
        const parcelasRows = createdRows.flatMap((row, index) => {
          const sourceItem = importItems[index];
          return buildRows({
            ...row,
            vencimentoFatura: sourceItem?.vencimentoFatura ?? null,
          }, {
            cardCycle,
          });
        });
        if (parcelasRows.length > 0) {
          await tx.insert(parcelasCompra).values(parcelasRows);
        }
      }

      const existingServices = await tx.select({
        id: servicos.id,
        nome: servicos.nome,
        valorMensal: servicos.valorMensal,
        categoria: servicos.categoria,
        formaPagamento: servicos.formaPagamento,
        compraCartaoId: servicos.compraCartaoId,
      }).from(servicos).where(eq(servicos.userId, userId));
      const serviceById = new Map(existingServices.map((service) => [service.id, service] as const));

      let servicesCreatedCount = 0;
      let servicesLinkedCount = 0;
      const serviceRollbackActions: ServiceRollbackActionSnapshot[] = [];
      for (let index = 0; index < importItems.length; index += 1) {
        const item = importItems[index];
        if (!item || item.serviceAction.type === "none") continue;

        const createdCompra = createdRows[index];
        if (!createdCompra) {
          throw new ImportPipelineError(409, "Não foi possível vincular serviço à compra criada.");
        }

        const serviceAction = item.serviceAction;
        // Regra de negócio: cobrança no cartão NÃO equivale a recebimento da pessoa.
        // Este fluxo de importação só pode criar/vincular servico.compraCartaoId.
        // Nunca cria servico_pagamentos, não marca mês pago automaticamente
        // e não abate saldo de pessoa aqui.
        if (serviceAction.type === "create_new") {
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

          const [createdService] = await tx.insert(servicos).values({
            userId,
            nome: serviceAction.name,
            categoria: serviceAction.category,
            valorMensal,
            dataCobranca: serviceAction.billingDay,
            formaPagamento: "cartao",
            compraCartaoId: createdCompra.id,
            status: "ativo",
            iconeId: null,
          }).returning({
            id: servicos.id,
            nome: servicos.nome,
            valorMensal: servicos.valorMensal,
            categoria: servicos.categoria,
            formaPagamento: servicos.formaPagamento,
            compraCartaoId: servicos.compraCartaoId,
          });

          if (createdService) {
            existingServices.push(createdService);
            serviceById.set(createdService.id, createdService);
            serviceRollbackActions.push({
              itemId: item.id,
              action: "create_new",
              serviceId: createdService.id,
              compraCartaoId: createdCompra.id,
              previousCompraCartaoId: null,
              serviceCreatedByImport: true,
              createdServiceSnapshot: {
                nome: createdService.nome,
                categoria: createdService.categoria,
                valorMensal: createdService.valorMensal,
                dataCobranca: serviceAction.billingDay,
                formaPagamento: createdService.formaPagamento,
              },
              recordedAt: new Date().toISOString(),
            });
          }
          servicesCreatedCount += 1;
          continue;
        }

        if (serviceAction.type === "link_existing") {
          const targetService = serviceById.get(serviceAction.serviceId);
          if (!targetService) {
            throw new ImportPipelineError(404, "Serviço não encontrado para vínculo.");
          }

          if (
            targetService.compraCartaoId
            && targetService.compraCartaoId !== createdCompra.id
            && serviceAction.replaceExistingLink !== true
          ) {
            throw new ImportPipelineError(
              409,
              "Este serviço já está vinculado a outra compra. Confirme a substituição do vínculo.",
              { itemId: item.id, serviceId: serviceAction.serviceId },
            );
          }

          const [updatedService] = await tx.update(servicos).set({
            compraCartaoId: createdCompra.id,
          }).where(and(
            eq(servicos.id, serviceAction.serviceId),
            eq(servicos.userId, userId),
          )).returning({
            id: servicos.id,
            nome: servicos.nome,
            valorMensal: servicos.valorMensal,
            categoria: servicos.categoria,
            formaPagamento: servicos.formaPagamento,
            compraCartaoId: servicos.compraCartaoId,
          });

          if (!updatedService) {
            throw new ImportPipelineError(404, "Serviço não encontrado para vínculo.");
          }

          serviceById.set(updatedService.id, updatedService);
          serviceRollbackActions.push({
            itemId: item.id,
            action: "link_existing",
            serviceId: updatedService.id,
            compraCartaoId: createdCompra.id,
            previousCompraCartaoId: targetService.compraCartaoId ?? null,
            serviceCreatedByImport: false,
            recordedAt: new Date().toISOString(),
          });
          servicesLinkedCount += 1;
        }
      }

      const ids = createdRows.map((row) => row.id);
      const confirmedPayloadSnapshot: ImportConfirmedPayloadSnapshot = {
        items: candidateItems,
        serviceActions: serviceRollbackActions,
        reconcileActions: snapshot.reconcileActions ?? [],
      };

      const [updatedLog] = await tx.update(importLogs).set({
        status: "confirmed",
        confirmedPayload: serializeJson(confirmedPayloadSnapshot),
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
        servicesLinkedCount,
      };
    });

    return {
      importLogId: log.id,
      createdCount: transactionResult.ids.length,
      skippedCount: summary.skipItems,
      createdCompraIds: transactionResult.ids,
      summary: summarizeConfirmResult(
        candidateItems,
        transactionResult.ids.length,
        transactionResult.servicesCreatedCount,
        transactionResult.servicesLinkedCount,
        (snapshot.reconcileActions ?? []).length,
      ),
    };
  }

  async reconcilePurchase(
    userId: string,
    payload: ImportReconcilePurchaseBodyInput,
  ): Promise<ImportReconcilePurchaseResult> {
    const [existingCompra] = await db.select({
      id: comprasCartao.id,
      userId: comprasCartao.userId,
      cartaoId: comprasCartao.cartaoId,
      descricao: comprasCartao.descricao,
      valorTotal: comprasCartao.valorTotal,
      valorParcela: comprasCartao.valorParcela,
      parcelas: comprasCartao.parcelas,
      parcelaAtual: comprasCartao.parcelaAtual,
      dataCompra: comprasCartao.dataCompra,
      pessoaId: comprasCartao.pessoaId,
      statusPessoa: comprasCartao.statusPessoa,
      dataPagamentoPessoa: comprasCartao.dataPagamentoPessoa,
    }).from(comprasCartao).where(and(
      eq(comprasCartao.id, payload.existingCompraCartaoId),
      eq(comprasCartao.userId, userId),
    ));

    if (!existingCompra) {
      throw new ImportPipelineError(404, "Compra existente não encontrada para reconciliação.");
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
      eq(comprasCartao.cartaoId, existingCompra.cartaoId),
    ));
    const duplicateRowsById = new Map(duplicateRows.map((row) => [row.id, row] as const));

    const normalizedItem = normalizeImportItem(payload.importItem, 0, {
      duplicateRowsById,
      duplicateRows,
      cartaoId: existingCompra.cartaoId,
      mode: "confirm",
    });
    if (normalizedItem.status === "invalido") {
      throw new ImportPipelineError(400, "Item inválido não pode ser reconciliado com compra existente.");
    }
    if (normalizedItem.status === "duplicata_exata" && normalizedItem.forceImport !== true) {
      throw new ImportPipelineError(400, "Duplicata exata exige confirmação de forçar para reconciliar.");
    }

    const nextValorTotal = formatMoneyFixed(normalizedItem.valor);
    const nextValorParcela = formatMoneyFixed(normalizedItem.valorParcela);
    if (!nextValorTotal || !nextValorParcela) {
      throw new ImportPipelineError(400, "Valores inválidos para reconciliação.");
    }

    const previousValorTotal = parseMoney(existingCompra.valorTotal) ?? 0;
    const previousValorParcela = parseMoney(existingCompra.valorParcela) ?? 0;
    const valueChanged = Math.abs(previousValorParcela - normalizedItem.valorParcela) > 0.01
      || Math.abs(previousValorTotal - normalizedItem.valor) > 0.01;
    const parcelasChanged = existingCompra.parcelas !== normalizedItem.parcelas
      || existingCompra.parcelaAtual !== normalizedItem.parcelaAtual;
    const purchaseDateChanged = existingCompra.dataCompra !== normalizedItem.dataCompra;
    const shouldUpdateNameFromImport = payload.updateNameFromImport === true || payload.updateDescription === true;
    const descriptionChanged = shouldUpdateNameFromImport
      && existingCompra.descricao !== normalizedItem.descricao;
    const scheduleChanged = valueChanged || parcelasChanged || purchaseDateChanged;

    if (valueChanged && payload.confirmValueChange !== true) {
      throw new ImportPipelineError(
        409,
        "Essa ação atualizará valores da compra existente. Confirme explicitamente a alteração para continuar.",
        {
          previousValorParcela,
          nextValorParcela: normalizedItem.valorParcela,
          previousValorTotal,
          nextValorTotal: normalizedItem.valor,
        },
      );
    }

    const existingParcelas = await db.select({
      id: parcelasCompra.id,
      numero: parcelasCompra.numero,
      statusCartao: parcelasCompra.statusCartao,
      dataPagamentoCartao: parcelasCompra.dataPagamentoCartao,
      statusPessoa: parcelasCompra.statusPessoa,
      dataPagamentoPessoa: parcelasCompra.dataPagamentoPessoa,
      comprovantePath: parcelasCompra.comprovantePath,
      comprovanteNome: parcelasCompra.comprovanteNome,
      comprovanteMimeType: parcelasCompra.comprovanteMimeType,
      comprovanteTamanho: parcelasCompra.comprovanteTamanho,
      comprovanteEnviadoEm: parcelasCompra.comprovanteEnviadoEm,
    }).from(parcelasCompra).where(and(
      eq(parcelasCompra.compraCartaoId, existingCompra.id),
      eq(parcelasCompra.userId, userId),
    ));

    const protectedParcelas = existingParcelas.filter((row) => isParcelaProtectedForReconcile(row));
    if (scheduleChanged && protectedParcelas.length > 0) {
      throw new ImportPipelineError(
        409,
        "Essa compra possui parcelas pagas/comprovantes. Edite manualmente para evitar perda de dados.",
        {
          blockedByProtection: true,
          protectedParcelasCount: protectedParcelas.length,
        },
      );
    }

    const [cardCycle] = await db.select({
      diaVencimento: cartoes.diaVencimento,
      melhorDiaCompra: cartoes.melhorDiaCompra,
    }).from(cartoes).where(and(
      eq(cartoes.id, existingCompra.cartaoId),
      eq(cartoes.userId, userId),
    )).limit(1);

    const reconciled = await db.transaction(async (tx) => {
      const [updatedCompra] = await tx.update(comprasCartao).set({
        descricao: shouldUpdateNameFromImport ? normalizedItem.descricao : existingCompra.descricao,
        valorTotal: nextValorTotal,
        valorParcela: nextValorParcela,
        parcelas: normalizedItem.parcelas,
        parcelaAtual: normalizedItem.parcelaAtual,
        dataCompra: normalizedItem.dataCompra,
      }).where(and(
        eq(comprasCartao.id, existingCompra.id),
        eq(comprasCartao.userId, userId),
      )).returning({
        id: comprasCartao.id,
        dataCompra: comprasCartao.dataCompra,
      });

      if (!updatedCompra) {
        throw new ImportPipelineError(404, "Compra existente não encontrada para reconciliação.");
      }

      if (scheduleChanged) {
        const buildRows = this.getBuildParcelasCompraRows();
        const expectedSchedule = buildRows({
          id: updatedCompra.id,
          userId,
          cartaoId: existingCompra.cartaoId,
          parcelas: normalizedItem.parcelas,
          parcelaAtual: normalizedItem.parcelaAtual,
          valorParcela: nextValorParcela,
          dataCompra: normalizedItem.dataCompra,
          pessoaId: existingCompra.pessoaId,
          statusPessoa: existingCompra.statusPessoa,
          dataPagamentoPessoa: existingCompra.dataPagamentoPessoa,
          vencimentoFatura: normalizedItem.vencimentoFatura ?? null,
        }, {
          cardCycle: cardCycle ?? null,
        });
        const currentRows = await tx.select({
          id: parcelasCompra.id,
          numero: parcelasCompra.numero,
        }).from(parcelasCompra).where(and(
          eq(parcelasCompra.compraCartaoId, updatedCompra.id),
          eq(parcelasCompra.userId, userId),
        ));
        const rowsByNumero = new Map(currentRows.map((row) => [row.numero, row] as const));
        const expectedParcelas = Math.max(1, normalizedItem.parcelas);

        for (let numero = 1; numero <= expectedParcelas; numero += 1) {
          const existingRow = rowsByNumero.get(numero);
          const expectedParcela = expectedSchedule[numero - 1];
          const dataVencimento = expectedParcela?.dataVencimento;
          if (!dataVencimento) continue;
          if (existingRow) {
            await tx.update(parcelasCompra).set({
              valor: nextValorParcela,
              dataVencimento,
            }).where(and(
              eq(parcelasCompra.id, existingRow.id),
              eq(parcelasCompra.userId, userId),
            ));
            continue;
          }

          await tx.insert(parcelasCompra).values({
            userId,
            compraCartaoId: updatedCompra.id,
            numero,
            valor: nextValorParcela,
            dataVencimento,
            statusCartao: numero < normalizedItem.parcelaAtual ? "pago" : "pendente",
            dataPagamentoCartao: numero < normalizedItem.parcelaAtual ? normalizedItem.dataCompra : null,
            statusPessoa: null,
            dataPagamentoPessoa: null,
          });
        }

        const rowsToRemove = currentRows.filter((row) => row.numero > expectedParcelas);
        if (rowsToRemove.length > 0) {
          await tx.delete(parcelasCompra).where(and(
            eq(parcelasCompra.userId, userId),
            inArray(parcelasCompra.id, rowsToRemove.map((row) => row.id)),
          ));
        }
      }

      return updatedCompra;
    });

    const previousSnapshot: CompraReconcileSnapshot = {
      descricao: existingCompra.descricao,
      valorTotal: formatMoneyFixed(previousValorTotal) ?? existingCompra.valorTotal,
      valorParcela: formatMoneyFixed(previousValorParcela) ?? existingCompra.valorParcela,
      parcelas: existingCompra.parcelas,
      parcelaAtual: existingCompra.parcelaAtual,
      dataCompra: existingCompra.dataCompra,
      vencimentoFatura: null,
    };
    const appliedSnapshot: CompraReconcileSnapshot = {
      descricao: shouldUpdateNameFromImport ? normalizedItem.descricao : existingCompra.descricao,
      valorTotal: nextValorTotal,
      valorParcela: nextValorParcela,
      parcelas: normalizedItem.parcelas,
      parcelaAtual: normalizedItem.parcelaAtual,
      dataCompra: normalizedItem.dataCompra,
      vencimentoFatura: normalizedItem.vencimentoFatura ?? null,
    };

    if (payload.importLogId) {
      const [targetLog] = await db.select({
        id: importLogs.id,
        status: importLogs.status,
        previewPayload: importLogs.previewPayload,
      }).from(importLogs).where(and(
        eq(importLogs.id, payload.importLogId),
        eq(importLogs.userId, userId),
      ));

      if (!targetLog) {
        throw new ImportPipelineError(404, "Lote de importação não encontrado para registrar reconciliação.");
      }

      const previewSnapshot = parsePreviewPayloadSnapshot(targetLog.previewPayload);
      const existingActions = previewSnapshot.reconcileActions ?? [];
      const nextAction: ReconcileRollbackActionSnapshot = {
        itemId: payload.itemId ?? payload.importItem.id ?? existingCompra.id,
        action: "replace_existing",
        existingCompraCartaoId: existingCompra.id,
        updatedCompraCartaoId: reconciled.id,
        previousSnapshot,
        appliedSnapshot,
        valueChanged,
        parcelasChanged,
        purchaseDateChanged,
        descriptionChanged,
        updateNameFromImport: shouldUpdateNameFromImport,
        protectedParcelasCount: protectedParcelas.length,
        recordedAt: new Date().toISOString(),
      };

      const updatedActions = [
        ...existingActions.filter((action) => (
          !(action.itemId === nextAction.itemId && action.existingCompraCartaoId === nextAction.existingCompraCartaoId)
        )),
        nextAction,
      ];

      await db.update(importLogs).set({
        previewPayload: serializeJson({
          ...previewSnapshot,
          reconcileActions: updatedActions,
        }),
      }).where(and(
        eq(importLogs.id, targetLog.id),
        eq(importLogs.userId, userId),
      ));
    }

    return {
      existingCompraCartaoId: existingCompra.id,
      updatedCompraCartaoId: reconciled.id,
      updated: true,
      valueChanged,
      parcelasChanged: parcelasChanged || purchaseDateChanged,
      descriptionChanged,
      blockedByProtection: false,
      protectedParcelasCount: protectedParcelas.length,
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
        servicesRemovedCount: 0,
        servicesUnlinkedCount: 0,
        servicesRestoredCount: 0,
        serviceRollbackWarnings: [],
        alreadyRolledBack: true,
      };
    }

    if (log.status !== "confirmed") {
      throw new ImportPipelineError(409, "Only confirmed imports can be rolled back");
    }

    const requestedIds = deserializeJson<string[]>(log.createdCompraIds, []);
    const confirmedSnapshot = parseConfirmedPayloadSnapshot(log.confirmedPayload);
    const serviceActions = confirmedSnapshot.serviceActions;
    const reconcileActions = confirmedSnapshot.reconcileActions;
    const rollbackResult = await db.transaction(async (tx) => {
      let servicesRemovedCount = 0;
      let servicesUnlinkedCount = 0;
      let servicesRestoredCount = 0;
      const serviceRollbackWarnings: string[] = [];

      const pushWarning = (message: string) => {
        if (!serviceRollbackWarnings.includes(message)) {
          serviceRollbackWarnings.push(message);
        }
      };

      for (const action of reconcileActions) {
        const [targetCompra] = await tx.select({
          id: comprasCartao.id,
          cartaoId: comprasCartao.cartaoId,
          descricao: comprasCartao.descricao,
          valorTotal: comprasCartao.valorTotal,
          valorParcela: comprasCartao.valorParcela,
          parcelas: comprasCartao.parcelas,
          parcelaAtual: comprasCartao.parcelaAtual,
          dataCompra: comprasCartao.dataCompra,
        }).from(comprasCartao).where(and(
          eq(comprasCartao.id, action.updatedCompraCartaoId),
          eq(comprasCartao.userId, userId),
        ));

        if (!targetCompra) {
          pushWarning("Uma compra reconciliada não foi restaurada automaticamente por segurança.");
          continue;
        }

        const stillInAppliedState =
          targetCompra.descricao === action.appliedSnapshot.descricao
          && targetCompra.valorTotal === action.appliedSnapshot.valorTotal
          && targetCompra.valorParcela === action.appliedSnapshot.valorParcela
          && targetCompra.parcelas === action.appliedSnapshot.parcelas
          && targetCompra.parcelaAtual === action.appliedSnapshot.parcelaAtual
          && targetCompra.dataCompra === action.appliedSnapshot.dataCompra;

        if (!stillInAppliedState) {
          pushWarning("Uma compra reconciliada não foi restaurada automaticamente porque foi alterada após a importação.");
          continue;
        }

        const existingParcelas = await tx.select({
          id: parcelasCompra.id,
          numero: parcelasCompra.numero,
          statusCartao: parcelasCompra.statusCartao,
          dataPagamentoCartao: parcelasCompra.dataPagamentoCartao,
          statusPessoa: parcelasCompra.statusPessoa,
          dataPagamentoPessoa: parcelasCompra.dataPagamentoPessoa,
          comprovantePath: parcelasCompra.comprovantePath,
          comprovanteNome: parcelasCompra.comprovanteNome,
          comprovanteMimeType: parcelasCompra.comprovanteMimeType,
          comprovanteTamanho: parcelasCompra.comprovanteTamanho,
          comprovanteEnviadoEm: parcelasCompra.comprovanteEnviadoEm,
        }).from(parcelasCompra).where(and(
          eq(parcelasCompra.compraCartaoId, targetCompra.id),
          eq(parcelasCompra.userId, userId),
        ));

        const scheduleWasChanged = action.valueChanged || action.parcelasChanged || action.purchaseDateChanged;
        const protectedParcelas = existingParcelas.filter((row) => isParcelaProtectedForReconcile(row));
        if (scheduleWasChanged && protectedParcelas.length > 0) {
          pushWarning("Uma compra reconciliada não foi restaurada automaticamente porque possui parcelas pagas/comprovantes.");
          continue;
        }

        const [restoredCompra] = await tx.update(comprasCartao).set({
          descricao: action.previousSnapshot.descricao,
          valorTotal: action.previousSnapshot.valorTotal,
          valorParcela: action.previousSnapshot.valorParcela,
          parcelas: action.previousSnapshot.parcelas,
          parcelaAtual: action.previousSnapshot.parcelaAtual,
          dataCompra: action.previousSnapshot.dataCompra,
        }).where(and(
          eq(comprasCartao.id, targetCompra.id),
          eq(comprasCartao.userId, userId),
        )).returning({
          id: comprasCartao.id,
          dataCompra: comprasCartao.dataCompra,
        });

        if (!restoredCompra) {
          pushWarning("Uma compra reconciliada não foi restaurada automaticamente por segurança.");
          continue;
        }

        if (scheduleWasChanged) {
          const [cardCycle] = await tx.select({
            diaVencimento: cartoes.diaVencimento,
            melhorDiaCompra: cartoes.melhorDiaCompra,
          }).from(cartoes).where(and(
            eq(cartoes.id, targetCompra.cartaoId),
            eq(cartoes.userId, userId),
          )).limit(1);

          const buildRows = this.getBuildParcelasCompraRows();
          const expectedSchedule = buildRows({
            id: restoredCompra.id,
            userId,
            cartaoId: targetCompra.cartaoId,
            parcelas: action.previousSnapshot.parcelas,
            parcelaAtual: action.previousSnapshot.parcelaAtual,
            valorParcela: action.previousSnapshot.valorParcela,
            dataCompra: action.previousSnapshot.dataCompra,
            pessoaId: null,
            statusPessoa: null,
            dataPagamentoPessoa: null,
            vencimentoFatura: action.previousSnapshot.vencimentoFatura ?? null,
          }, {
            cardCycle: cardCycle ?? null,
          });
          const currentRows = await tx.select({
            id: parcelasCompra.id,
            numero: parcelasCompra.numero,
          }).from(parcelasCompra).where(and(
            eq(parcelasCompra.compraCartaoId, restoredCompra.id),
            eq(parcelasCompra.userId, userId),
          ));
          const rowsByNumero = new Map(currentRows.map((row) => [row.numero, row] as const));
          const expectedParcelas = Math.max(1, action.previousSnapshot.parcelas);
          const previousValorParcela = action.previousSnapshot.valorParcela;
          for (let numero = 1; numero <= expectedParcelas; numero += 1) {
            const existingRow = rowsByNumero.get(numero);
            const expectedParcela = expectedSchedule[numero - 1];
            const dataVencimento = expectedParcela?.dataVencimento;
            if (!dataVencimento) continue;
            if (existingRow) {
              await tx.update(parcelasCompra).set({
                valor: previousValorParcela,
                dataVencimento,
              }).where(and(
                eq(parcelasCompra.id, existingRow.id),
                eq(parcelasCompra.userId, userId),
              ));
              continue;
            }

            await tx.insert(parcelasCompra).values({
              userId,
              compraCartaoId: restoredCompra.id,
              numero,
              valor: previousValorParcela,
              dataVencimento,
              statusCartao: numero < action.previousSnapshot.parcelaAtual ? "pago" : "pendente",
              dataPagamentoCartao: numero < action.previousSnapshot.parcelaAtual ? action.previousSnapshot.dataCompra : null,
              statusPessoa: null,
              dataPagamentoPessoa: null,
            });
          }

          const rowsToRemove = currentRows.filter((row) => row.numero > expectedParcelas);
          if (rowsToRemove.length > 0) {
            await tx.delete(parcelasCompra).where(and(
              eq(parcelasCompra.userId, userId),
              inArray(parcelasCompra.id, rowsToRemove.map((row) => row.id)),
            ));
          }
        }
      }

      for (const action of serviceActions) {
        const [targetService] = await tx.select({
          id: servicos.id,
          nome: servicos.nome,
          categoria: servicos.categoria,
          valorMensal: servicos.valorMensal,
          dataCobranca: servicos.dataCobranca,
          formaPagamento: servicos.formaPagamento,
          compraCartaoId: servicos.compraCartaoId,
        }).from(servicos).where(and(
          eq(servicos.id, action.serviceId),
          eq(servicos.userId, userId),
        ));

        if (!targetService) {
          pushWarning("Um vínculo de serviço não foi restaurado automaticamente por segurança.");
          continue;
        }

        if (targetService.compraCartaoId !== action.compraCartaoId) {
          pushWarning("Um vínculo de serviço não foi restaurado automaticamente porque o serviço foi alterado depois da importação.");
          continue;
        }

        if (action.action === "link_existing") {
          if (action.previousCompraCartaoId) {
            const [previousCompra] = await tx.select({
              id: comprasCartao.id,
            }).from(comprasCartao).where(and(
              eq(comprasCartao.id, action.previousCompraCartaoId),
              eq(comprasCartao.userId, userId),
            ));

            if (!previousCompra) {
              pushWarning("Um vínculo de serviço não foi restaurado automaticamente por segurança.");
              continue;
            }
          }

          const [updatedService] = await tx.update(servicos).set({
            compraCartaoId: action.previousCompraCartaoId,
          }).where(and(
            eq(servicos.id, action.serviceId),
            eq(servicos.userId, userId),
            eq(servicos.compraCartaoId, action.compraCartaoId),
          )).returning({
            id: servicos.id,
          });

          if (!updatedService) {
            pushWarning("Um vínculo de serviço não foi restaurado automaticamente por segurança.");
            continue;
          }

          if (action.previousCompraCartaoId) {
            servicesRestoredCount += 1;
          } else {
            servicesUnlinkedCount += 1;
          }
          continue;
        }

        const servicePeopleRows = await tx.select({
          id: servicoPessoas.id,
        }).from(servicoPessoas).where(and(
          eq(servicoPessoas.userId, userId),
          eq(servicoPessoas.servicoId, action.serviceId),
        ));

        const servicoPessoaIds = servicePeopleRows.map((row) => row.id);
        const hasServicoPessoas = servicoPessoaIds.length > 0;
        const hasServicoPagamentos = servicoPessoaIds.length > 0
          ? (await tx.select({
            id: servicoPagamentos.id,
          }).from(servicoPagamentos).where(and(
            eq(servicoPagamentos.userId, userId),
            inArray(servicoPagamentos.servicoPessoaId, servicoPessoaIds),
          )).limit(1)).length > 0
          : false;

        const createdSnapshot = action.createdServiceSnapshot;
        const wasEditedAfterImport = createdSnapshot == null
          || targetService.nome !== createdSnapshot.nome
          || targetService.categoria !== createdSnapshot.categoria
          || targetService.valorMensal !== createdSnapshot.valorMensal
          || targetService.dataCobranca !== createdSnapshot.dataCobranca
          || targetService.formaPagamento !== createdSnapshot.formaPagamento;

        const canSafelyRemove =
          action.serviceCreatedByImport === true
          && !hasServicoPessoas
          && !hasServicoPagamentos
          && !wasEditedAfterImport;

        if (canSafelyRemove) {
          const [deletedService] = await tx.delete(servicos).where(and(
            eq(servicos.id, action.serviceId),
            eq(servicos.userId, userId),
            eq(servicos.compraCartaoId, action.compraCartaoId),
          )).returning({
            id: servicos.id,
          });

          if (!deletedService) {
            pushWarning("Um serviço criado pela importação não foi removido automaticamente por segurança.");
            continue;
          }

          servicesRemovedCount += 1;
          continue;
        }

        const [unlinkedService] = await tx.update(servicos).set({
          compraCartaoId: null,
        }).where(and(
          eq(servicos.id, action.serviceId),
          eq(servicos.userId, userId),
          eq(servicos.compraCartaoId, action.compraCartaoId),
        )).returning({
          id: servicos.id,
        });

        if (unlinkedService) {
          servicesUnlinkedCount += 1;
        } else {
          pushWarning("Um serviço criado pela importação não foi removido automaticamente por segurança.");
          continue;
        }

        if (hasServicoPagamentos) {
          pushWarning("Um serviço criado pela importação não foi removido automaticamente por segurança.");
        } else if (hasServicoPessoas) {
          pushWarning("Um serviço criado pela importação não foi removido automaticamente por segurança.");
        } else if (wasEditedAfterImport) {
          pushWarning("Um serviço criado pela importação não foi removido automaticamente porque foi alterado depois da importação.");
        } else {
          pushWarning("Um serviço criado pela importação não foi removido automaticamente por segurança.");
        }
      }

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
          servicesRemovedCount,
          servicesUnlinkedCount,
          servicesRestoredCount,
          serviceRollbackWarnings,
          rolledBackAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX"),
        }),
        rolledBackAt: new Date(),
      }).where(and(eq(importLogs.id, log.id), eq(importLogs.userId, userId))).returning({
        id: importLogs.id,
      });

      if (!updatedLog) {
        throw new ImportPipelineError(409, "Import log nao encontrado durante o rollback");
      }

      return {
        ids,
        servicesRemovedCount,
        servicesUnlinkedCount,
        servicesRestoredCount,
        serviceRollbackWarnings,
      };
    });

    return {
      importLogId: log.id,
      deletedCount: rollbackResult.ids.length,
      deletedCompraIds: rollbackResult.ids,
      servicesRemovedCount: rollbackResult.servicesRemovedCount,
      servicesUnlinkedCount: rollbackResult.servicesUnlinkedCount,
      servicesRestoredCount: rollbackResult.servicesRestoredCount,
      serviceRollbackWarnings: rollbackResult.serviceRollbackWarnings,
    };
  }

  async list(userId: string, limit = 20) {
    const safeLimit = clamp(limit, 1, 100);
    const rows = await db.select().from(importLogs)
      .where(eq(importLogs.userId, userId))
      .orderBy(desc(importLogs.createdAt))
      .limit(safeLimit);

    return rows.map((row) => {
      const rollbackPayload = deserializeJson<{
        servicesRemovedCount?: number;
        servicesUnlinkedCount?: number;
        servicesRestoredCount?: number;
        serviceRollbackWarnings?: string[];
      }>(row.rollbackPayload, {});

      return {
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
        rollbackServicesRemovedCount: rollbackPayload.servicesRemovedCount ?? 0,
        rollbackServicesUnlinkedCount: rollbackPayload.servicesUnlinkedCount ?? 0,
        rollbackServicesRestoredCount: rollbackPayload.servicesRestoredCount ?? 0,
        rollbackWarningsCount: Array.isArray(rollbackPayload.serviceRollbackWarnings)
          ? rollbackPayload.serviceRollbackWarnings.length
          : 0,
      };
    });
  }
}
