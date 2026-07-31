import { CalendarClock, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
      className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2"
      data-testid={testId}
    >
      <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
      <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">{formatCurrency(amount)}</span>
        {" "}em serviços previstos
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Explicação dos serviços previstos"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs">
          Esta previsão afeta o limite estimado, mas não faz parte do saldo pagável da fatura.
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 flex-shrink-0 px-2 text-xs"
        onClick={onOpenServices}
        aria-label="Ver serviços previstos"
      >
        Ver
      </Button>
    </div>
  );
}
