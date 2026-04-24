import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { ENV } from "../env.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";
import { SupabaseStorageServerClient } from "./supabase-storage.client.js";
import { userCloudBackups } from "../../shared/schema.js";

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
      pessoaSaldoMovimentacoes,
      metas,
    ] = await Promise.all([
      storage.getPessoas(userId),
      storage.getDividas(userId),
      storage.getCartoes(userId),
      storage.getComprasCartao(userId),
      storage.getParcelasCompraByUser(userId),
      storage.getServicos(userId),
      storage.getServicoPessoas(userId),
      storage.getServicoPagamentos(userId),
      storage.getPessoaSaldoMovimentacoes(userId),
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
      pessoaSaldoMovimentacoes,
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
}
