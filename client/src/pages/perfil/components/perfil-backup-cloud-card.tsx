import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cloud } from "lucide-react";
import type { CloudBackupItem } from "@/services/api/cloud-backups";

type CloudBackupCardState = "loading" | "error" | "empty" | "ready";

type CloudBackupCardItem = {
  backup: CloudBackupItem;
  metaLabel: string;
  statusVariant: "default" | "destructive";
  restoreLabel: string;
  restoreDisabled: boolean;
};

type PerfilBackupCloudCardProps = {
  backupNuvemLiberado: boolean;
  premiumBadgeVariant: "default" | "secondary";
  premiumBadgeLabel: string;
  createBackupLabel: string;
  createBackupDisabled: boolean;
  restoreLatestLabel: string;
  restoreLatestDisabled: boolean;
  showSavedBackups: boolean;
  cloudBackupsState: CloudBackupCardState;
  cloudBackupItems: CloudBackupCardItem[];
  onCreateBackup: () => void;
  onRestoreLatest: () => void;
  onRestoreBackup: (backup: CloudBackupItem) => void;
};

export function PerfilBackupCloudCard({
  backupNuvemLiberado,
  premiumBadgeVariant,
  premiumBadgeLabel,
  createBackupLabel,
  createBackupDisabled,
  restoreLatestLabel,
  restoreLatestDisabled,
  showSavedBackups,
  cloudBackupsState,
  cloudBackupItems,
  onCreateBackup,
  onRestoreLatest,
  onRestoreBackup,
}: PerfilBackupCloudCardProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Cloud className="w-4 h-4 text-primary" />
          Backup na nuvem
        </h3>
        <Badge variant={premiumBadgeVariant}>
          {premiumBadgeLabel}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Salve e restaure backups privados na nuvem.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          className="w-full touch-feedback"
          onClick={onCreateBackup}
          disabled={createBackupDisabled}
          data-testid="button-cloud-backup-premium"
        >
          {createBackupLabel}
        </Button>
        <Button
          className="w-full touch-feedback"
          onClick={onRestoreLatest}
          disabled={restoreLatestDisabled}
          data-testid="button-cloud-restore-latest"
        >
          {restoreLatestLabel}
        </Button>
      </div>

      {showSavedBackups && (
        <div className="mt-4 rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Backups salvos na nuvem
          </p>
          <div className="mt-2 space-y-2">
            {cloudBackupsState === "loading" ? (
              <p className="text-sm text-muted-foreground">Carregando backups...</p>
            ) : cloudBackupsState === "error" ? (
              <p className="text-sm text-red-700">
                Nao foi possivel carregar backups na nuvem agora.
              </p>
            ) : cloudBackupsState === "empty" ? (
              <p className="text-sm text-muted-foreground">
                Nenhum backup na nuvem salvo ainda.
              </p>
            ) : (
              cloudBackupItems.map((item) => (
                <div
                  key={item.backup.id}
                  className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.backup.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.metaLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Badge variant={item.statusVariant}>
                      {item.backup.status}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRestoreBackup(item.backup)}
                      disabled={item.restoreDisabled}
                      data-testid={`button-cloud-restore-${item.backup.id}`}
                    >
                      {item.restoreLabel}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
