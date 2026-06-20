import { apiRequest } from "@/lib/queryClient";
import type {
  BackupRestoreAction,
  BackupRestoreMode,
  BackupRestoreModuleKey,
} from "@shared/backup-restore-modules";

export type CloudBackupItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  backupType: "manual" | string;
  status: "completed" | "failed" | string;
  isEncrypted: boolean;
  createdAt: string;
};

export type CloudBackupRestoreMode = BackupRestoreMode;

export type CloudBackupRestoreModulesSelection = Partial<Record<BackupRestoreModuleKey, BackupRestoreAction>>;

export type CloudBackupRestorePreview = {
  backupInfo: {
    fileName: string | null;
    createdAt: string | null;
    sizeBytes: number | null;
    version: string | null;
  };
  modules: Array<{
    key: string;
    label: string;
    count: number;
    foundInBackup: boolean;
    canMerge: boolean;
    canReplace: boolean;
    activeCount: number | null;
    removedCount: number | null;
    warnings: string[];
  }>;
  warnings: string[];
};

export type CloudBackupRestoreResult = {
  backupId: string;
  modoImportacao: CloudBackupRestoreMode;
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

export type CloudBackupDeleteResult = {
  success: true;
  backupId: string;
  fileName: string;
};

export async function createCloudBackup(): Promise<CloudBackupItem> {
  const res = await apiRequest("POST", "/api/backups/cloud");
  const payload = await res.json() as { backup: CloudBackupItem };
  return payload.backup;
}

export async function listCloudBackups(limit = 20): Promise<CloudBackupItem[]> {
  const res = await apiRequest("GET", `/api/backups/cloud?limit=${limit}`);
  const payload = await res.json() as { backups: CloudBackupItem[] };
  return payload.backups;
}

export async function restoreCloudBackup(
  backupId: string,
  modo: CloudBackupRestoreMode,
  modules?: CloudBackupRestoreModulesSelection,
): Promise<CloudBackupRestoreResult> {
  const res = await apiRequest("POST", `/api/backups/cloud/${backupId}/restore`, {
    modo,
    modules,
  });
  return res.json() as Promise<CloudBackupRestoreResult>;
}

export async function previewCloudBackup(backupId: string): Promise<CloudBackupRestorePreview> {
  const res = await apiRequest("POST", `/api/backups/cloud/${backupId}/preview`);
  return res.json() as Promise<CloudBackupRestorePreview>;
}

export async function downloadCloudBackup(backupId: string): Promise<Blob> {
  const res = await fetch(`/api/backups/cloud/${backupId}/download`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  return res.blob();
}

export async function deleteCloudBackup(
  backupId: string,
  confirmationText: string,
): Promise<CloudBackupDeleteResult> {
  const res = await apiRequest("POST", `/api/backups/cloud/${backupId}/delete`, {
    confirmationText,
  });
  return res.json() as Promise<CloudBackupDeleteResult>;
}
