import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  formatInvoiceMonthLong,
  formatInvoiceMonthShort,
  getInvoiceMonthStatus,
  getVisibleInvoiceMonths,
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
  const visibleMonths = useMemo(
    () => Array.from(
      new Set([
        ...getVisibleInvoiceMonths({
          selectedMonth: currentInvoiceMonth,
          currentMonth: currentInvoiceMonth,
          availableMonths: invoiceMonthOptions.map((option) => option.value),
          previousCount: 1,
          nextCount: 2,
        }),
        invoiceMonth,
      ]),
    ).sort(),
    [currentInvoiceMonth, invoiceMonth, invoiceMonthOptions],
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
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={cartoesTab} onValueChange={(value) => onTabChange(value as CartoesTab)}>
          <TabsList className="mobile-tabs-scroll h-10 w-full justify-start rounded-2xl border border-border/60 bg-muted/25 p-1">
            <TabsTrigger value="resumo" data-testid="tab-cartoes-resumo">Resumo</TabsTrigger>
            <TabsTrigger value="compras" data-testid="tab-cartoes-compras">Compras</TabsTrigger>
          </TabsList>
        </Tabs>

        {showSearch ? (
          <div className="relative w-full max-w-md min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={compraSearch}
              onChange={(event) => onCompraSearchChange(event.target.value)}
              placeholder="Buscar compra, cartão, valor ou data"
              className="h-10 rounded-2xl border-border/60 bg-background/80 pl-9 shadow-sm"
              data-testid="input-cartoes-busca-compras"
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-[22px] border border-border/60 bg-card/80 p-2 shadow-sm">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl border-border/60 bg-background/80"
            onClick={() => handleStepMonth(-1)}
            disabled={!canGoPrevious}
            aria-label="Ir para fatura do mês anterior"
            title="Mês anterior"
            data-testid="button-cartoes-invoice-month-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="mobile-tabs-scroll flex-1">
            <div className="flex min-w-max items-stretch gap-1.5">
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
                      "min-w-[70px] rounded-2xl border px-2.5 py-1.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      getChipClasses(status, selected),
                    )}
                    aria-label={`Selecionar fatura de ${longLabel} (${statusLabel})`}
                    title={`${longLabel} (${statusLabel})`}
                    aria-pressed={selected}
                    data-testid={`chip-cartoes-invoice-month-${monthKey}`}
                  >
                    <p className="text-sm font-semibold leading-none">{shortLabel}</p>
                    <p className="mt-1 text-[11px] leading-none opacity-80">{statusLabel}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl border-border/60 bg-background/80"
            onClick={() => handleStepMonth(1)}
            disabled={!canGoNext}
            aria-label="Ir para fatura do próximo mês"
            title="Próximo mês"
            data-testid="button-cartoes-invoice-month-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
