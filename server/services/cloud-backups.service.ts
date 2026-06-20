import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { ENV } from "../env";
import { toErrorLog, writeTechnicalLog } from "../logger";
import { SupabaseStorageServerClient } from "./supabase-storage.client";
import { pessoaSaldoMovimentacoes, userCloudBackups } from "@shared/schema";
import {
  type BackupImportMode,
  type BackupJsonModulesSelection,
  BackupJsonParseError,
  parseBackupJsonImportEnvelope,
} from "../../serverless/validators/backup-import.validators";
import { transformBackupForPersistence } from "../../serverless/services/backup-import-transform.service";
import { persistTransformedBackupImport } from "../../serverless/services/backup-import-persistence.service";
import {
  buildBackupRestorePreview,
  buildBackupRestoreSelectionPlan,
  type BackupRestorePreview,
} from "../../serverless/services/backup-restore-selection.service";
import type { BackupRestoreAction, BackupRestoreModuleKey } from "@shared/backup-restore-modules";

export type CloudBackupListItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  backupType: string;
  status: string;
  isEncrypted: boolean;
  createdAt: Date;
};

export type CloudBackupRestoreSummary = {
  modoImportacao: BackupImportMode;
  modulosAplicados: Record<BackupRestoreModuleKey, BackupRestoreAction>;
  avisos: string[];
  pessoasImportadas: number;
  cartoesImportados: number;
  dividasImportadas: number;
  comprasImportadas: number;
  servicosImportados: number;
  servicoPessoasImportados: number;
  servicoPagamentosImportados: number;
  saldoMovimentacoesImportados: number;
  metasImportadas: number;
};

export type CloudBackupRestoreRequest = {
  modo: BackupImportMode;
  modules?: BackupJsonModulesSelection;
};

export type CloudBackupDeleteRequest = {
  confirmationText?: string | null;
};

export type CloudBackupDeleteResult = {
  success: true;
  backupId: string;
  fileName: string;
};

type CloudBackupDownloadResult = {
  backup: CloudBackupListItem;
  fileName: string;
  content: Buffer;
};

type CloudBackupPayload = {
  exportadoEm: string;
  usuario: string | null;
  pessoas: unknown[];
  dividas: unknown[];
  cartoes: unknown[];
  compras: unknown[];
  parcelasCompra: unknown[];
  servicos: unknown[];
  servicoPessoas: unknown[];
  servicoPagamentos: unknown[];
  pessoaSaldoMovimentacoes: unknown[];
  metas: unknown[];
};

export class CloudBackupsServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const JSON_MIME_TYPE = "application/json";
const DEFAULT_MAX_BACKUP_BYTES = 8 * 1024 * 1024;

function resolveMaxBackupBytes(): number {
  const raw = process.env.CLOUD_BACKUP_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_BACKUP_BYTES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1024) return DEFAULT_MAX_BACKUP_BYTES;
  return parsed;
}

function clampLimit(limit: number): number {
  if (!Number.isInteger(limit)) return 20;
  return Math.max(1, Math.min(limit, 100));
}

function buildBackupFileName(now: Date): string {
  const timestamp = now.toISOString().replace(/[:]/g, "-");
  return `${timestamp}-backup.json`;
}

function toListItem(row: typeof userCloudBackups.$inferSelect): CloudBackupListItem {
  return {
    id: row.id,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    backupType: row.backupType,
    status: row.status,
    isEncrypted: row.isEncrypted,
    createdAt: row.createdAt,
  };
}

function isAuthStorageError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("jwt") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission") ||
    normalized.includes("invalid token");
}

function isMissingBucketError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("bucket") && normalized.includes("not found");
}

function mapUploadErrorToUserMessage(bucket: string, error: { message: string; statusCode?: number }): string {
  if (error.statusCode === 401 || error.statusCode === 403 || isAuthStorageError(error.message)) {
    return "Nao foi possivel autenticar no storage. Revise SUPABASE_SERVICE_ROLE_KEY no ambiente da Vercel.";
  }

  if (error.statusCode === 404 || isMissingBucketError(error.message)) {
    return `Bucket de backup nao encontrado (${bucket}). Configure CLOUD_BACKUP_BUCKET ou SUPABASE_STORAGE_BUCKET no Supabase Storage.`;
  }

  if (error.statusCode === 400) {
    return "Configuracao invalida do storage para backup cloud. Revise URL, bucket e credenciais do Supabase.";
  }

  return "Nao foi possivel salvar backup na nuvem. Verifique a configuracao do storage.";
}

function mapDownloadErrorToUserMessage(error: { message: string; statusCode?: number }): {
  status: number;
  message: string;
} {
  if (error.statusCode === 404) {
    return {
      status: 404,
      message: "Arquivo de backup nao encontrado no storage.",
    };
  }

  if (error.statusCode === 401 || error.statusCode === 403 || isAuthStorageError(error.message)) {
    return {
      status: 503,
      message: "Nao foi possivel autenticar no storage para baixar o backup.",
    };
  }

  return {
    status: 503,
    message: "Falha temporaria ao baixar backup na nuvem.",
  };
}

function mapDeleteErrorToUserMessage(error: { message: string; statusCode?: number }): {
  status: number;
  message: string;
} {
  if (error.statusCode === 401 || error.statusCode === 403 || isAuthStorageError(error.message)) {
    return {
      status: 503,
      message: "Nao foi possivel autenticar no storage para excluir o backup.",
    };
  }

  return {
    status: 503,
    message: "Falha temporaria ao excluir backup na nuvem.",
  };
}

function isTransformValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const normalized = error.message.toLowerCase();
  return normalized.startsWith("registro invalido")
    || normalized.startsWith("campo obrigatorio invalido")
    || normalized.startsWith("campo invalido")
    || normalized.startsWith("relacionamento invalido");
}

export class CloudBackupsService {
  private readonly storageClient?: SupabaseStorageServerClient;

  constructor(storageClient?: SupabaseStorageServerClient) {
    this.storageClient = storageClient;
  }

  private resolveStorageClient(): SupabaseStorageServerClient {
    if (this.storageClient) return this.storageClient;
    try {
      return new SupabaseStorageServerClient(ENV.supabase.cloudBackupBucket, {
        autoCreateBucketIfMissing: true,
      });
    } catch {
      throw new CloudBackupsServiceError(
        503,
        "Backup na nuvem indisponivel: configuracao de storage pendente no servidor.",
      );
    }
  }

  private async getBackupRow(userId: string, backupId: string): Promise<typeof userCloudBackups.$inferSelect> {
    const [row] = await db.select().from(userCloudBackups)
      .where(and(eq(userCloudBackups.userId, userId), eq(userCloudBackups.id, backupId)))
      .limit(1);

    if (!row) {
      throw new CloudBackupsServiceError(404, "Backup na nuvem nao encontrado.");
    }

    return row;
  }

  async createManualBackup(userId: string): Promise<CloudBackupListItem> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new CloudBackupsServiceError(404, "Usuario nao encontrado para gerar backup.");
    }

    const [
      pessoas,
      dividas,
      cartoes,
      compras,
      parcelasCompra,
      servicos,
      servicoPessoas,
      servicoPagamentos,
      pessoaSaldoMovimentacoesRows,
      metas,
    ] = await Promise.all([
      storage.getPessoas(userId),
      storage.getDividasByStatus(userId, "all"),
      storage.getCartoes(userId),
      storage.getComprasCartao(userId),
      storage.getParcelasCompraByUser(userId),
      storage.getServicos(userId),
      storage.getServicoPessoas(userId),
      storage.getServicoPagamentos(userId),
      db.select().from(pessoaSaldoMovimentacoes).where(eq(pessoaSaldoMovimentacoes.userId, userId)),
      storage.getMetas(userId),
    ]);

    const payload: CloudBackupPayload = {
      exportadoEm: new Date().toISOString(),
      usuario: user.username,
      pessoas,
      dividas,
      cartoes,
      compras,
      parcelasCompra,
      servicos,
      servicoPessoas,
      servicoPagamentos,
      pessoaSaldoMovimentacoes: pessoaSaldoMovimentacoesRows,
      metas,
    };

    const serialized = JSON.stringify(payload, null, 2);
    const content = Buffer.from(serialized, "utf8");
    const sizeBytes = content.byteLength;
    const maxBackupBytes = resolveMaxBackupBytes();
    if (sizeBytes > maxBackupBytes) {
      throw new CloudBackupsServiceError(
        413,
        "Backup muito grande para salvar na nuvem. Reduza os dados ou aumente o limite configurado.",
      );
    }

    const sha256 = createHash("sha256").update(content).digest("hex");
    const now = new Date();
    const fileName = buildBackupFileName(now);
    const filePath = `${userId}/${fileName}`;
    const storageClient = this.resolveStorageClient();

    let uploadResult;
    try {
      uploadResult = await storageClient.uploadObject(filePath, content, JSON_MIME_TYPE);
    } catch (error) {
      writeTechnicalLog({
        event: "cloud_backup.create.upload_exception",
        source: "cloud-backups.service",
        level: "error",
        data: {
          userId,
          bucket: storageClient.getBucket(),
          filePath,
          error: toErrorLog(error),
        },
      });
      throw new CloudBackupsServiceError(503, "Falha temporaria ao salvar backup na nuvem.");
    }

    if (uploadResult.error) {
      writeTechnicalLog({
        event: "cloud_backup.create.upload_failed",
        source: "cloud-backups.service",
        level: "error",
        data: {
          userId,
          bucket: storageClient.getBucket(),
          filePath,
          statusCode: uploadResult.error.statusCode ?? null,
          providerMessage: uploadResult.error.message,
        },
      });
      throw new CloudBackupsServiceError(
        503,
        mapUploadErrorToUserMessage(storageClient.getBucket(), uploadResult.error),
      );
    }

    const [created] = await db.insert(userCloudBackups).values({
      userId,
      filePath,
      fileName,
      sizeBytes,
      sha256,
      backupType: "manual",
      status: "completed",
      isEncrypted: false,
    }).returning();

    return toListItem(created);
  }

  async listByUser(userId: string, limit = 20): Promise<CloudBackupListItem[]> {
    const rows = await db.select().from(userCloudBackups)
      .where(eq(userCloudBackups.userId, userId))
      .orderBy(desc(userCloudBackups.createdAt))
      .limit(clampLimit(limit));

    return rows.map(toListItem);
  }

  async downloadById(userId: string, backupId: string): Promise<CloudBackupDownloadResult> {
    const backupRow = await this.getBackupRow(userId, backupId);
    const storageClient = this.resolveStorageClient();

    let downloadResult;
    try {
      downloadResult = await storageClient.downloadObject(backupRow.filePath);
    } catch (error) {
      writeTechnicalLog({
        event: "cloud_backup.download.exception",
        source: "cloud-backups.service",
        level: "error",
        data: {
          userId,
          backupId,
          bucket: storageClient.getBucket(),
          filePath: backupRow.filePath,
          error: toErrorLog(error),
        },
      });
      throw new CloudBackupsServiceError(503, "Falha temporaria ao baixar backup na nuvem.");
    }

    if (downloadResult.error || !downloadResult.data) {
      if (downloadResult.error) {
        writeTechnicalLog({
          event: "cloud_backup.download.failed",
          source: "cloud-backups.service",
          level: "error",
          data: {
            userId,
            backupId,
            bucket: storageClient.getBucket(),
            filePath: backupRow.filePath,
            statusCode: downloadResult.error.statusCode ?? null,
            providerMessage: downloadResult.error.message,
          },
        });

        const mapped = mapDownloadErrorToUserMessage(downloadResult.error);
        throw new CloudBackupsServiceError(mapped.status, mapped.message);
      }

      throw new CloudBackupsServiceError(500, "Falha ao ler o arquivo do backup na nuvem.");
    }

    return {
      backup: toListItem(backupRow),
      fileName: backupRow.fileName,
      content: downloadResult.data,
    };
  }

  async deleteById(
    userId: string,
    backupId: string,
    request: CloudBackupDeleteRequest,
  ): Promise<CloudBackupDeleteResult> {
    const backupRow = await this.getBackupRow(userId, backupId);
    const confirmationText = typeof request.confirmationText === "string"
      ? request.confirmationText.trim()
      : "";

    if (confirmationText !== backupRow.fileName) {
      throw new CloudBackupsServiceError(
        400,
        "Digite o nome exato do arquivo para confirmar a exclusão do backup.",
      );
    }

    const storageClient = this.resolveStorageClient();
    let removeResult;
    try {
      removeResult = await storageClient.removeObject(backupRow.filePath);
    } catch (error) {
      writeTechnicalLog({
        event: "cloud_backup.delete.exception",
        source: "cloud-backups.service",
        level: "error",
        data: {
          userId,
          backupId,
          bucket: storageClient.getBucket(),
          filePath: backupRow.filePath,
          error: toErrorLog(error),
        },
      });
      throw new CloudBackupsServiceError(503, "Falha temporaria ao excluir backup na nuvem.");
    }
    if (removeResult.error) {
      writeTechnicalLog({
        event: "cloud_backup.delete.failed",
        source: "cloud-backups.service",
        level: "error",
        data: {
          userId,
          backupId,
          bucket: storageClient.getBucket(),
          filePath: backupRow.filePath,
          statusCode: removeResult.error.statusCode ?? null,
          providerMessage: removeResult.error.message,
        },
      });

      const mapped = mapDeleteErrorToUserMessage(removeResult.error);
      throw new CloudBackupsServiceError(mapped.status, mapped.message);
    }

    await db.delete(userCloudBackups).where(and(
      eq(userCloudBackups.userId, userId),
      eq(userCloudBackups.id, backupId),
    ));

    writeTechnicalLog({
      event: "cloud_backup.delete.applied",
      source: "cloud-backups.service",
      level: "info",
      data: {
        userId,
        backupId,
        fileName: backupRow.fileName,
      },
    });

    return {
      success: true,
      backupId,
      fileName: backupRow.fileName,
    };
  }

  async previewById(userId: string, backupId: string): Promise<BackupRestorePreview> {
    const downloaded = await this.downloadById(userId, backupId);

    try {
      const envelope = parseBackupJsonImportEnvelope(downloaded.content.toString("utf8"));
      const preview = buildBackupRestorePreview({
        envelope,
        fileName: downloaded.fileName,
        sizeBytes: downloaded.content.byteLength,
        createdAt: downloaded.backup.createdAt.toISOString(),
      });

      writeTechnicalLog({
        event: "backup.restore.preview",
        source: "cloud-backups.service",
        level: "info",
        data: {
          userId,
          backupId,
          fileName: downloaded.fileName,
          modules: preview.modules.map((module) => ({
            key: module.key,
            count: module.count,
            foundInBackup: module.foundInBackup,
          })),
        },
      });

      return preview;
    } catch (error) {
      if (error instanceof BackupJsonParseError) {
        throw new CloudBackupsServiceError(
          400,
          `Arquivo de backup na nuvem invalido: ${error.message}`,
        );
      }
      throw error;
    }
  }

  async restoreById(
    userId: string,
    backupId: string,
    restoreRequest: CloudBackupRestoreRequest,
  ): Promise<CloudBackupRestoreSummary> {
    const modo = restoreRequest.modo;
    const downloaded = await this.downloadById(userId, backupId);

    let envelope;
    try {
      envelope = parseBackupJsonImportEnvelope(downloaded.content.toString("utf8"));
    } catch (error) {
      if (error instanceof BackupJsonParseError) {
        throw new CloudBackupsServiceError(
          400,
          `Arquivo de backup na nuvem invalido: ${error.message}`,
        );
      }
      throw error;
    }

    const plan = buildBackupRestoreSelectionPlan({
      mode: modo,
      modules: restoreRequest.modules,
      envelope,
    });

    if (plan.errors.length > 0) {
      throw new CloudBackupsServiceError(400, plan.errors[0]);
    }

    let transformed;
    try {
      transformed = transformBackupForPersistence(envelope.backup, userId);
    } catch (error) {
      if (isTransformValidationError(error)) {
        throw new CloudBackupsServiceError(400, error instanceof Error ? error.message : "Registro invalido no backup.");
      }
      throw error;
    }

    const persisted = await persistTransformedBackupImport(transformed, {
      modo,
      moduleActions: plan.effectiveActions,
      userId,
    });

    writeTechnicalLog({
      event: "backup.restore.applied",
      source: "cloud-backups.service",
      level: "info",
      data: {
        userId,
        backupId,
        mode: modo,
        modules: plan.effectiveActions,
        warnings: plan.warnings,
        counts: {
          pessoas: persisted.pessoasInseridas,
          cartoes: persisted.cartoesInseridos,
          dividas: persisted.dividasInseridas,
          compras: persisted.comprasInseridas,
          parcelasCompra: persisted.parcelasCompraInseridas,
          servicos: persisted.servicosInseridos,
          servicoPessoas: persisted.servicoPessoasInseridas,
          servicoPagamentos: persisted.servicoPagamentosInseridos,
          pessoaSaldoMovimentacoes: persisted.saldoMovimentacoesInseridas,
          metas: persisted.metasInseridas,
        },
      },
    });

    return {
      modoImportacao: modo,
      modulosAplicados: plan.effectiveActions,
      avisos: plan.warnings,
      pessoasImportadas: persisted.pessoasInseridas,
      cartoesImportados: persisted.cartoesInseridos,
      dividasImportadas: persisted.dividasInseridas,
      comprasImportadas: persisted.comprasInseridas,
      servicosImportados: persisted.servicosInseridos,
      servicoPessoasImportados: persisted.servicoPessoasInseridas,
      servicoPagamentosImportados: persisted.servicoPagamentosInseridos,
      saldoMovimentacoesImportados: persisted.saldoMovimentacoesInseridas,
      metasImportadas: persisted.metasInseridas,
    };
  }
}
