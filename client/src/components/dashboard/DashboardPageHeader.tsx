import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechLoadingSurface } from "@/components/layout/fintech-loading-shell";
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
    <FintechPageHeader
      title={title}
      subtitle={subtitle}
      rowClassName="items-start gap-4 xl:items-start"
      contentClassName="space-y-1.5"
      titleClassName="sm:text-[2rem]"
      actionsClassName="w-full xl:w-auto"
      actions={(
        <div className="w-full xl:w-auto">
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(210px,220px)_auto] xl:items-start">
            <Select value={selectedMonth} onValueChange={onMonthChange}>
              <SelectTrigger
                className="h-10 w-full min-w-0 rounded-xl border-border/70 bg-background/95 text-sm shadow-sm"
                data-testid="select-month"
              >
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

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 w-full rounded-xl border-border/70 bg-background/95 px-3 shadow-sm sm:w-10 sm:px-0"
                  aria-label="Personalizar painel"
                  title="Personalizar Painel"
                >
                  <Settings2 className="h-4 w-4" />
                  <span className="ml-2 text-sm font-medium sm:hidden">Personalizar</span>
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

          {showAdvancedResources &&
            (scoreStatus.isLoading ? (
              <FintechLoadingSurface tone="inset" className="mt-2 w-full rounded-2xl xl:max-w-[280px]">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-24 rounded-full bg-muted/65" />
                  <Skeleton className="h-3 w-14 rounded-full bg-muted/55" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 flex-1 rounded-full bg-muted/60" />
                  <Skeleton className="h-5 w-10 rounded-md bg-muted/65" />
                </div>
              </FintechLoadingSurface>
            ) : scoreStatus.isError ? (
              <div className="mt-2 xl:max-w-[280px]">
                <HeaderScoreError message={scoreStatus.message} />
              </div>
            ) : (
              <div
                className="mt-2 flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/50 bg-background/95 px-3.5 py-3 shadow-sm sm:px-4 xl:max-w-[280px]"
                data-testid="score-financeiro"
              >
                <div className="flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Score financeiro
                    </span>
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
      )}
    />
  );
}
