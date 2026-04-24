import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { ENV } from "../env";
import { SupabaseStorageServerClient } from "./supabase-storage.client";
import { pessoaSaldoMovimentacoes, userCloudBackups } from "@shared/schema";

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

export class CloudBackupsService {
  private readonly storageClient?: SupabaseStorageServerClient;

  constructor(storageClient?: SupabaseStorageServerClient) {
    this.storageClient = storageClient;
  }

  private resolveStorageClient(): SupabaseStorageServerClient {
    if (this.storageClient) return this.storageClient;
    try {
      return new SupabaseStorageServerClient(ENV.supabase.cloudBackupBucket);
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
      pessoaSaldoMovimentacoesRows,
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
    } catch {
      throw new CloudBackupsServiceError(503, "Falha temporaria ao salvar backup na nuvem.");
    }
    if (uploadResult.error) {
      throw new CloudBackupsServiceError(
        503,
        "Nao foi possivel salvar backup na nuvem. Verifique a configuracao do storage.",
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
