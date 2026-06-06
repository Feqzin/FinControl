import { Wallet } from "lucide-react";

type PessoasHistoryBalanceSummaryProps = {
  currentBalanceLabel: string;
  creditsLabel: string;
  debitsLabel: string;
};

export function PessoasHistoryBalanceSummary({
  currentBalanceLabel,
  creditsLabel,
  debitsLabel,
}: PessoasHistoryBalanceSummaryProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Saldo positivo da pessoa</h3>
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md bg-emerald-500/5 p-3">
          <p className="text-muted-foreground">Saldo atual</p>
          <p className="text-sm font-bold text-emerald-600">{currentBalanceLabel}</p>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <p className="text-muted-foreground">Créditos</p>
          <p className="text-sm font-bold">{creditsLabel}</p>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <p className="text-muted-foreground">Débitos</p>
          <p className="text-sm font-bold">{debitsLabel}</p>
        </div>
      </div>
    </>
  );
}
