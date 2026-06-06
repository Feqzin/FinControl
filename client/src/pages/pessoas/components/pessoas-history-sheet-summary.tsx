import { Plus, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type PessoasHistorySheetSummaryProps = {
  title: string;
  personName: string;
  consolidatedPendingLabel: string;
  statusLabel: string;
  statusVariant: "outline" | "secondary";
  positiveBalanceLabel: string;
  pendingInstallmentsLabel: string;
  overdueInstallmentsLabel: string;
  onOpenNewDivida: () => void;
  onOpenSaldo: () => void;
};

export function PessoasHistorySheetSummary({
  title,
  personName,
  consolidatedPendingLabel,
  statusLabel,
  statusVariant,
  positiveBalanceLabel,
  pendingInstallmentsLabel,
  overdueInstallmentsLabel,
  onOpenNewDivida,
  onOpenSaldo,
}: PessoasHistorySheetSummaryProps) {
  return (
    <>
      <SheetHeader className="mb-4 border-b border-border/50 pb-2">
        <SheetTitle className="text-base sm:text-lg">{title}</SheetTitle>
        <SheetDescription className="sr-only">
          Consulte o resumo, as pendências, o saldo, os serviços e o histórico financeiro da pessoa selecionada.
        </SheetDescription>
      </SheetHeader>

      <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{personName}</p>
            <p className="text-xs text-muted-foreground">
              Total pendente consolidado: {consolidatedPendingLabel}
            </p>
          </div>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-emerald-500/5 p-2.5">
            <p className="text-muted-foreground">Saldo positivo</p>
            <p className="font-semibold text-emerald-600">{positiveBalanceLabel}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Parcelas pendentes</p>
            <p className="font-semibold">{pendingInstallmentsLabel}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Parcelas vencidas</p>
            <p className="font-semibold text-red-600">{overdueInstallmentsLabel}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onOpenNewDivida}
            data-testid="button-quick-add-divida-history"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Nova dívida
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenSaldo}
            data-testid="button-quick-open-saldo-history"
          >
            <Wallet className="w-3.5 h-3.5 mr-1" /> Saldo
          </Button>
        </div>
      </div>
    </>
  );
}
