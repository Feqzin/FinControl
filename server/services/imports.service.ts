import { and, desc, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "../db";
import { cartoes, comprasCartao, importLogs, parcelasCompra, type InsertCompraCartao } from "@shared/schema";
import { formatMoneyFixed, multiply, parseMoney } from "../../utils/money";
import { buildParcelasCompraRows } from "./parcelas-compra-materialization";
import type {
  ImportAction,
  ImportConfirmBodyInput,
  ImportPreviewBodyInput,
  ImportPreviewItemInput,
} from "../validators/import.validators";

type ConfidenceLevel = "alta" | "media" | "baixa";
type CanonicalImportItemStatus = "novo" | "duplicata_exata" | "possivel_duplicata" | "invalido";
type DuplicateProbeRow = {
  id: string;
  descricao: string;
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
  alreadyConfirmed?: boolean;
};

type ImportRollbackResult = {
  importLogId: string;
  deletedCount: number;
  deletedCompraIds: string[];
  alreadyRolledBack?: boolean;
};

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

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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
  valorParcela: number | null;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
}, duplicateRow: DuplicateProbeRow | null): boolean {
  if (!duplicateRow) return false;

  const descricaoMatch = normalizeComparableText(item.descricao) === normalizeComparableText(duplicateRow.descricao);
  const valorParcelaMatch = valuesAreEqualWithinTolerance(item.valorParcela, toNumericMoney(duplicateRow.valorParcela));
  const parcelasMatch = item.parcelas === duplicateRow.parcelas;
  const parcelaAtualMatch = item.parcelaAtual === duplicateRow.parcelaAtual;
  const dataCompraMatch = item.dataCompra === duplicateRow.dataCompra;

  return descricaoMatch && valorParcelaMatch && parcelasMatch && parcelaAtualMatch && dataCompraMatch;
}

function computeCanonicalStatus(input: {
  canImport: boolean;
  duplicateId: string | null;
  duplicateRow: DuplicateProbeRow | null;
  descricao: string;
  valorParcela: number | null;
  parcelas: number;
  parcelaAtual: number;
  dataCompra: string;
}): CanonicalImportItemStatus {
  if (!input.canImport) return "invalido";
  if (!input.duplicateId) return "novo";

  if (
    isExactDuplicateMatch(
      {
        descricao: input.descricao,
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
  const duplicateId = parseDuplicateId(input);
  const duplicateRow = duplicateId ? (options?.duplicateRowsById?.get(duplicateId) ?? null) : null;
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

  const status = computeCanonicalStatus({
    canImport,
    duplicateId,
    duplicateRow,
    descricao,
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
    parcelasRestantes: Math.max(0, parcelas - parcelaAtual + 1),
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
  };
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

function toCompraInsert(userId: string, cartaoId: string, item: ImportPreviewItem): InsertCompraCartao {
  return {
    userId,
    cartaoId,
    descricao: item.descricao,
    valorTotal: formatMoneyFixed(item.valor) ?? "0.00",
    parcelas: item.parcelas,
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

    const duplicateIds = Array.from(
      new Set(
        payload.items
          .map((item) => parseDuplicateId(item))
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );
    const duplicateRows = duplicateIds.length > 0
      ? await db.select({
        id: comprasCartao.id,
        descricao: comprasCartao.descricao,
        valorParcela: comprasCartao.valorParcela,
        parcelas: comprasCartao.parcelas,
        parcelaAtual: comprasCartao.parcelaAtual,
        dataCompra: comprasCartao.dataCompra,
        cartaoId: comprasCartao.cartaoId,
      }).from(comprasCartao).where(and(
        eq(comprasCartao.userId, userId),
        inArray(comprasCartao.id, duplicateIds),
      ))
      : [];
    const duplicateRowsById = new Map(duplicateRows.map((row) => [row.id, row] as const));

    const previewItems = payload.items.map((item, index) => normalizeImportItem(item, index, {
      duplicateRowsById,
      mode: "preview",
    }));
    const summary = summarizePreview(previewItems);
    const snapshot: ImportPreviewPayloadSnapshot = { items: previewItems, summary };

    const [log] = await db.insert(importLogs).values({
      userId,
      cartaoId: payload.cartaoId,
      sourceType: payload.sourceType,
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
      return {
        importLogId: log.id,
        createdCount: existingIds.length,
        skippedCount: log.skippedItems,
        createdCompraIds: existingIds,
        alreadyConfirmed: true,
      };
    }

    const snapshot = deserializeJson<ImportPreviewPayloadSnapshot>(log.previewPayload, { items: [], summary: summarizePreview([]) });
    const sourceItems = payload.items ?? snapshot.items;
    const duplicateIds = Array.from(
      new Set(
        sourceItems
          .map((item) => parseDuplicateId(item))
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );
    const duplicateRows = duplicateIds.length > 0
      ? await db.select({
        id: comprasCartao.id,
        descricao: comprasCartao.descricao,
        valorParcela: comprasCartao.valorParcela,
        parcelas: comprasCartao.parcelas,
        parcelaAtual: comprasCartao.parcelaAtual,
        dataCompra: comprasCartao.dataCompra,
        cartaoId: comprasCartao.cartaoId,
      }).from(comprasCartao).where(and(
        eq(comprasCartao.userId, userId),
        inArray(comprasCartao.id, duplicateIds),
      ))
      : [];
    const duplicateRowsById = new Map(duplicateRows.map((row) => [row.id, row] as const));

    const candidateItems = sourceItems.map((item, index) => normalizeImportItem(item, index, {
      duplicateRowsById,
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

    const rowsToInsert = importItems.map((item) => toCompraInsert(userId, log.cartaoId, item));

    const summary = summarizePreview(candidateItems);
    const createdCompraIds = await db.transaction(async (tx) => {
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

      return ids;
    });

    return {
      importLogId: log.id,
      createdCount: createdCompraIds.length,
      skippedCount: summary.skipItems,
      createdCompraIds,
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
