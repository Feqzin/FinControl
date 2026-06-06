import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ImportFaturaPreviewHeaderProps = {
  detectedCount: number;
  onMarkAll: () => void;
  onIgnoreAll: () => void;
  importVencimento: string;
  onImportVencimentoChange: (value: string) => void;
  onApplyVencimentoToAll: () => void;
  isApplyVencimentoDisabled: boolean;
};

export function ImportFaturaPreviewHeader({
  detectedCount,
  onMarkAll,
  onIgnoreAll,
  importVencimento,
  onImportVencimentoChange,
  onApplyVencimentoToAll,
  isApplyVencimentoDisabled,
}: ImportFaturaPreviewHeaderProps) {
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold">{detectedCount} compra(s) detectada(s)</p>
        <div className="flex w-full flex-wrap gap-1 sm:w-auto sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onMarkAll}
          >
            Marcar todas
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onIgnoreAll}
          >
            Ignorar todas
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Label className="text-xs sm:flex-shrink-0">Vencimento da fatura (opcional):</Label>
        <Input
          type="date"
          className="h-8 text-xs sm:h-7 sm:flex-1"
          value={importVencimento}
          onChange={(event) => onImportVencimentoChange(event.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs sm:h-7 sm:flex-shrink-0"
          onClick={onApplyVencimentoToAll}
          disabled={isApplyVencimentoDisabled}
        >
          Aplicar a todos
        </Button>
      </div>
    </>
  );
}
