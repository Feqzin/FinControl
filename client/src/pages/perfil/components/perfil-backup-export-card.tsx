import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type PerfilBackupExportCardProps = {
  onExport: () => void;
};

export function PerfilBackupExportCard({ onExport }: PerfilBackupExportCardProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <h3 className="text-sm font-semibold">Exportar dados</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Baixe uma cópia local dos seus dados em JSON.
      </p>
      <Button
        variant="outline"
        onClick={onExport}
        data-testid="button-export"
        className="mt-3 w-full touch-feedback sm:w-auto"
      >
        <Download className="w-4 h-4 mr-2" /> Exportar dados (JSON)
      </Button>
    </div>
  );
}
