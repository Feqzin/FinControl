import type { ChangeEventHandler, ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PerfilBackupImportCardProps = {
  inputRef: Ref<HTMLInputElement>;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
  onImport: () => void;
  inputDisabled: boolean;
  importDisabled: boolean;
  buttonContent: ReactNode;
};

export function PerfilBackupImportCard({
  inputRef,
  onFileChange,
  onImport,
  inputDisabled,
  importDisabled,
  buttonContent,
}: PerfilBackupImportCardProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <h3 className="text-sm font-semibold">Substituir por arquivo</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Importe um backup JSON salvo no seu dispositivo.
      </p>
      <div className="mt-3 space-y-2">
        <Input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={onFileChange}
          disabled={inputDisabled}
          data-testid="input-import-backup"
        />
        <Button
          onClick={onImport}
          disabled={importDisabled}
          data-testid="button-import-backup"
          className="w-full touch-feedback"
        >
          {buttonContent}
        </Button>
      </div>
    </div>
  );
}
