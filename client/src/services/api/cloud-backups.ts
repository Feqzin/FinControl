import { apiRequest } from "@/lib/queryClient";

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

export type CloudBackupRestoreMode = "merge" | "replace";

export type CloudBackupRestoreResult = {
  backupId: string;
  modoImportacao: CloudBackupRestoreMode;
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
): Promise<CloudBackupRestoreResult> {
  const res = await apiRequest("POST", `/api/backups/cloud/${backupId}/restore`, { modo });
  return res.json() as Promise<CloudBackupRestoreResult>;
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
