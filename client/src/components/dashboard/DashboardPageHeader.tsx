import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2 } from "lucide-react";

type DashboardSectionStatus = {
  isLoading: boolean;
  isError: boolean;
  message: string | null;
};

type DashboardPageHeaderProps = {
  title: string;
  subtitle: string;
  selectedMonth: string;
  monthOptions: Array<{ value: string; label: string }>;
  onMonthChange: (value: string) => void;
  settingsContent: ReactNode;
  showAdvancedResources: boolean;
  scoreStatus: DashboardSectionStatus;
  score: { valor: number; classificacao: string };
  scoreBarColor: string;
  scoreLabelColor: string;
};

function HeaderScoreError({ message }: { message: string | null }) {
  return (
    <div className="w-full rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300 lg:w-[280px]">
      <p className="font-medium">Não foi possível carregar score.</p>
      {message ? <p className="mt-1 opacity-90">{message}</p> : null}
    </div>
  );
}

export function DashboardPageHeader({
  title,
  subtitle,
  selectedMonth,
  monthOptions,
  onMonthChange,
  settingsContent,
  showAdvancedResources,
  scoreStatus,
  score,
  scoreBarColor,
  scoreLabelColor,
}: DashboardPageHeaderProps) {
  return (
    <div className="fintech-page-header border border-border/60 bg-card/95 shadow-sm">
      <div className="fintech-page-header-row gap-4">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-start">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground/90">{subtitle}</p>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label="Personalizar painel"
                title="Personalizar Painel"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Personalizar Painel</DialogTitle>
                <DialogDescription className="sr-only">
                  Ajuste as opções rápidas e preferências exibidas no topo do dashboard.
                </DialogDescription>
              </DialogHeader>
              {settingsContent}
            </DialogContent>
          </Dialog>
        </div>

        <div className="fintech-actions-wrap w-full lg:w-auto">
          <Select value={selectedMonth} onValueChange={onMonthChange}>
            <SelectTrigger className="h-9 w-full min-w-0 rounded-xl text-sm lg:w-[210px]" data-testid="select-month">
              <SelectValue placeholder="Selecionar mês" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showAdvancedResources &&
            (scoreStatus.isLoading ? (
              <Skeleton className="h-12 w-full rounded-xl lg:w-[220px]" />
            ) : scoreStatus.isError ? (
              <HeaderScoreError message={scoreStatus.message} />
            ) : (
              <div
                className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-background px-3 py-2 sm:px-4 lg:w-auto lg:min-w-[220px]"
                data-testid="score-financeiro"
              >
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Score financeiro</span>
                    <span className={`text-xs font-bold ${scoreLabelColor}`}>{score.classificacao}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor}`} style={{ width: `${score.valor}%` }} />
                    </div>
                    <span className={`text-sm font-bold ${scoreLabelColor}`}>{score.valor}</span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
