import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProjectedServicesNoticeProps = {
  amount: number;
  formatCurrency: (value: number) => string;
  onOpenServices: () => void;
  testId?: string;
};

export function ProjectedServicesNotice({
  amount,
  formatCurrency,
  onOpenServices,
  testId,
}: ProjectedServicesNoticeProps) {
  if (amount <= 0) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
      data-testid={testId}
    >
      <div className="flex min-w-0 items-start gap-2">
        <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Serviços previstos: {formatCurrency(amount)}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Previsão separada; não faz parte do saldo pagável da fatura.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-200"
        onClick={onOpenServices}
      >
        Ver serviços
      </Button>
    </div>
  );
}
