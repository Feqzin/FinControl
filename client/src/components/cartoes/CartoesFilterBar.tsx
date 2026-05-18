import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  formatInvoiceMonthLong,
  formatInvoiceMonthShort,
  getInvoiceMonthStatus,
  getVisibleInvoiceMonths,
  groupInvoiceMonthsByYear,
} from "./invoice-month-selector.utils";

type CartoesTab = "resumo" | "compras";
type InvoiceMonthOption = { value: string; label: string };

type CartoesFilterBarProps = {
  cartoesTab: CartoesTab;
  onTabChange: (tab: CartoesTab) => void;
  compraSearch: string;
  onCompraSearchChange: (value: string) => void;
  showSearch: boolean;
  invoiceMonth: string;
  invoiceMonthOptions: InvoiceMonthOption[];
  currentInvoiceMonth: string;
  onInvoiceMonthChange: (value: string) => void;
};

export function CartoesFilterBar({
  cartoesTab,
  onTabChange,
  compraSearch,
  onCompraSearchChange,
  showSearch,
  invoiceMonth,
  invoiceMonthOptions,
  currentInvoiceMonth,
  onInvoiceMonthChange,
}: CartoesFilterBarProps) {
  const [openMoreMonths, setOpenMoreMonths] = useState(false);
  const visibleMonths = useMemo(
    () => getVisibleInvoiceMonths({
      selectedMonth: invoiceMonth,
      currentMonth: currentInvoiceMonth,
      availableMonths: invoiceMonthOptions.map((option) => option.value),
      previousCount: 2,
      nextCount: 3,
    }),
    [currentInvoiceMonth, invoiceMonth, invoiceMonthOptions],
  );

  const expandedMonthGroups = useMemo(
    () => groupInvoiceMonthsByYear(invoiceMonthOptions.map((option) => option.value)),
    [invoiceMonthOptions],
  );
  const availableMonthsSortedAsc = useMemo(
    () => Array.from(new Set(invoiceMonthOptions.map((option) => option.value))).sort(),
    [invoiceMonthOptions],
  );
  const currentMonthIndex = availableMonthsSortedAsc.indexOf(invoiceMonth);
  const canGoPrevious = currentMonthIndex > 0;
  const canGoNext = currentMonthIndex >= 0 && currentMonthIndex < availableMonthsSortedAsc.length - 1;

  const handleStepMonth = (step: -1 | 1) => {
    const currentIndex = availableMonthsSortedAsc.indexOf(invoiceMonth);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = currentIndex + step;
    if (targetIndex < 0 || targetIndex >= availableMonthsSortedAsc.length) return;

    const targetMonth = availableMonthsSortedAsc[targetIndex];
    if (!targetMonth) return;
    onInvoiceMonthChange(targetMonth);
  };

  const getStatusLabel = (status: ReturnType<typeof getInvoiceMonthStatus>): string => {
    if (status === "atual") return "Atual";
    if (status === "futura") return "Futura";
    return "Fechada";
  };

  const getChipClasses = (status: ReturnType<typeof getInvoiceMonthStatus>, selected: boolean): string => {
    if (selected) {
      if (status === "atual") return "border-primary bg-primary/10 text-primary shadow-sm";
      if (status === "futura") return "border-indigo-300 bg-indigo-100 text-indigo-700 shadow-sm";
      return "border-slate-300 bg-slate-200 text-slate-800 shadow-sm";
    }

    if (status === "atual") return "border-primary/30 bg-primary/5 text-primary/90 hover:bg-primary/10";
    if (status === "futura") return "border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100";
    return "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50";
  };

  return (
    <div className="space-y-3">
      <Tabs value={cartoesTab} onValueChange={(value) => onTabChange(value as CartoesTab)}>
        <TabsList className="mobile-tabs-scroll w-full justify-start bg-muted/30">
          <TabsTrigger value="resumo" data-testid="tab-cartoes-resumo">Resumo</TabsTrigger>
          <TabsTrigger value="compras" data-testid="tab-cartoes-compras">Compras</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
        <div className="w-full">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Mês da fatura</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => handleStepMonth(-1)}
              disabled={!canGoPrevious}
              aria-label="Ir para fatura do mês anterior"
              title="Mês anterior"
              data-testid="button-cartoes-invoice-month-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="mobile-tabs-scroll flex-1">
              <div className="flex min-w-max items-stretch gap-2 py-0.5">
                {visibleMonths.map((monthKey) => {
                  const status = getInvoiceMonthStatus(monthKey, currentInvoiceMonth);
                  const statusLabel = getStatusLabel(status);
                  const selected = monthKey === invoiceMonth;
                  const longLabel = formatInvoiceMonthLong(monthKey);
                  const shortLabel = formatInvoiceMonthShort(monthKey, currentInvoiceMonth);

                  return (
                    <button
                      key={monthKey}
                      type="button"
                      onClick={() => onInvoiceMonthChange(monthKey)}
                      className={cn(
                        "min-w-[72px] rounded-lg border px-2 py-1 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        getChipClasses(status, selected),
                      )}
                      aria-label={`Selecionar fatura de ${longLabel} (${statusLabel})`}
                      title={`${longLabel} (${statusLabel})`}
                      aria-pressed={selected}
                      data-testid={`chip-cartoes-invoice-month-${monthKey}`}
                    >
                      <p className="text-sm font-semibold leading-none">{shortLabel}</p>
                      <p className="mt-1 text-[11px] leading-none">{statusLabel}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => handleStepMonth(1)}
              disabled={!canGoNext}
              aria-label="Ir para fatura do próximo mês"
              title="Próximo mês"
              data-testid="button-cartoes-invoice-month-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-end">
            <Popover open={openMoreMonths} onOpenChange={setOpenMoreMonths}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  data-testid="button-cartoes-invoice-month-more"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Mais meses
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="border-b px-3 py-2">
                  <p className="text-xs font-medium text-foreground">Escolha outra fatura</p>
                  <p className="text-[11px] text-muted-foreground">Meses agrupados por ano</p>
                </div>
                <ScrollArea className="max-h-72">
                  <div className="space-y-3 p-2.5">
                    {expandedMonthGroups.map((group) => (
                      <section key={group.year} aria-label={`Ano ${group.year}`}>
                        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.year}
                        </p>
                        <div className="space-y-1">
                          {group.months.map((monthKey) => {
                            const selected = monthKey === invoiceMonth;
                            const status = getInvoiceMonthStatus(monthKey, currentInvoiceMonth);
                            const statusLabel = getStatusLabel(status);
                            const longLabel = formatInvoiceMonthLong(monthKey);

                            return (
                              <button
                                key={monthKey}
                                type="button"
                                onClick={() => {
                                  onInvoiceMonthChange(monthKey);
                                  setOpenMoreMonths(false);
                                }}
                                className={cn(
                                  "w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                  selected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-background hover:bg-muted/40",
                                )}
                                aria-label={`Selecionar fatura de ${longLabel} (${statusLabel})`}
                                data-testid={`option-cartoes-invoice-month-${monthKey}`}
                              >
                                <p className="font-medium leading-none">{longLabel}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground leading-none">{statusLabel}</p>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {showSearch ? (
        <div className="relative w-full max-w-md min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={compraSearch}
            onChange={(event) => onCompraSearchChange(event.target.value)}
            placeholder="Buscar compra, cartão, valor ou data"
            className="pl-9"
            data-testid="input-cartoes-busca-compras"
          />
        </div>
      ) : null}
    </div>
  );
}
