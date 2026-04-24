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
