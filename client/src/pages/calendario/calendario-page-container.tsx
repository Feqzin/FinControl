import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DashboardOverviewResponse } from "@shared/financial";
import type { Meta, Parcela } from "@shared/schema";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Landmark, Receipt, Repeat, Target } from "lucide-react";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import { FintechLoadingPageHeader, FintechLoadingSurface } from "@/components/layout/fintech-loading-shell";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechSurfaceCard, FintechSurfaceIconChip, FintechSurfaceInset } from "@/components/layout/fintech-surface-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import {
  buildFinancialCalendarDayMap,
  buildFinancialCalendarEvents,
  type FinancialCalendarEvent,
  type FinancialCalendarEventGroup,
} from "@/lib/financial-calendar";
import { cn } from "@/lib/utils";
import { fetchDashboardOverview } from "@/services/api/dashboard";
import { formatCurrencyBRL } from "@/utils/formatters";

type EventVisual = {
  label: string;
  Icon: typeof CalendarDays;
  chipClassName: string;
  badgeClassName: string;
};

const EVENT_VISUALS: Record<FinancialCalendarEventGroup, EventVisual> = {
  cartao: {
    label: "Cartão",
    Icon: CreditCard,
    chipClassName: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    badgeClassName: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  servico: {
    label: "Serviço",
    Icon: Repeat,
    chipClassName: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    badgeClassName: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  divida: {
    label: "Dívida",
    Icon: Receipt,
    chipClassName: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    badgeClassName: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  renda: {
    label: "Renda",
    Icon: Landmark,
    chipClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  meta: {
    label: "Meta",
    Icon: Target,
    chipClassName: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    badgeClassName: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
};

function getDirectionTotals(events: FinancialCalendarEvent[]) {
  return events.reduce(
    (acc, event) => {
      const amount = event.amount ?? 0;
      if (event.direction === "entrada") acc.entrada += amount;
      if (event.direction === "saida") acc.saida += amount;
      return acc;
    },
    { entrada: 0, saida: 0 },
  );
}

function buildMonthGrid(monthDate: Date): Date[] {
  const start = startOfWeek(startOfMonth(monthDate), { locale: ptBR });
  const end = endOfWeek(endOfMonth(monthDate), { locale: ptBR });
  const days: Date[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }

  return days;
}

function buildWeekdayLabels(monthDate: Date): string[] {
  const start = startOfWeek(monthDate, { locale: ptBR });
  return Array.from({ length: 7 }, (_, index) =>
    format(addDays(start, index), "EEE", { locale: ptBR })
      .replace(".", "")
      .slice(0, 3)
      .toUpperCase(),
  );
}

function formatMonthTitle(monthDate: Date): string {
  const label = format(monthDate, "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatSelectedDayLabel(value: string): string {
  const label = format(parseISO(value), "EEEE, d 'de' MMMM", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDayPill(value: string): string {
  return format(parseISO(value), "d 'de' MMM", { locale: ptBR });
}

function EventRow({ event, formatAmount }: { event: FinancialCalendarEvent; formatAmount: (value: number) => string }) {
  const visual = EVENT_VISUALS[event.group];

  return (
    <div className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <FintechSurfaceIconChip size="sm" className={visual.chipClassName}>
          <visual.Icon className="h-4 w-4" />
        </FintechSurfaceIconChip>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-foreground break-words">{event.title}</p>
              {event.subtitle ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground break-words">{event.subtitle}</p>
              ) : null}
            </div>
            {typeof event.amount === "number" ? (
              <p
                className={cn(
                  "text-sm font-semibold [overflow-wrap:anywhere] sm:shrink-0",
                  event.direction === "entrada" ? "text-emerald-600" : event.direction === "saida" ? "text-rose-600" : "text-foreground",
                )}
              >
                {formatAmount(event.amount)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("rounded-full px-2.5 text-[10px]", visual.badgeClassName)}>
              {visual.label}
            </Badge>
            {event.statusLabel ? (
              <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-2.5 text-[10px]">
                {event.statusLabel}
              </Badge>
            ) : null}
            {event.secondaryStatusLabel ? (
              <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-2.5 text-[10px]">
                {event.secondaryStatusLabel}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarioPageContainer() {
  const { visible } = useValuesVisibility();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const overviewQuery = useQuery<DashboardOverviewResponse>({
    queryKey: ["/api/dashboard/overview", selectedMonth],
    queryFn: () => fetchDashboardOverview(selectedMonth),
  });
  const parcelasQuery = useQuery<Parcela[]>({ queryKey: ["/api/parcelas"] });
  const metasQuery = useQuery<Meta[]>({ queryKey: ["/api/metas"] });

  const isLoading = overviewQuery.isLoading || parcelasQuery.isLoading || metasQuery.isLoading;
  const error = overviewQuery.error ?? parcelasQuery.error ?? metasQuery.error;

  const monthDate = useMemo(() => parseISO(`${selectedMonth}-01`), [selectedMonth]);
  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const weekDayLabels = useMemo(() => buildWeekdayLabels(monthDate), [monthDate]);

  const events = useMemo(() => {
    if (!overviewQuery.data) return [];

    return buildFinancialCalendarEvents({
      monthReference: selectedMonth,
      cartoes: overviewQuery.data.cartoes,
      compras: overviewQuery.data.compras,
      parcelasCompra: overviewQuery.data.parcelasCompra,
      cartaoFaturaPagamentos: overviewQuery.data.cartaoFaturaPagamentos,
      dividas: overviewQuery.data.dividas,
      parcelas: parcelasQuery.data ?? [],
      pessoas: overviewQuery.data.pessoas,
      servicos: overviewQuery.data.servicos,
      rendas: overviewQuery.data.rendas,
      metas: metasQuery.data ?? [],
    });
  }, [metasQuery.data, overviewQuery.data, parcelasQuery.data, selectedMonth]);

  const eventsByDay = useMemo(() => buildFinancialCalendarDayMap(events), [events]);
  const orderedDayEntries = useMemo(
    () => Array.from(eventsByDay.entries()).sort(([left], [right]) => left.localeCompare(right)),
    [eventsByDay],
  );

  const firstSelectableDate = orderedDayEntries[0]?.[0] ?? `${selectedMonth}-01`;

  useEffect(() => {
    setSelectedDate((current) => (
      current.startsWith(selectedMonth) ? current : firstSelectableDate
    ));
  }, [firstSelectableDate, selectedMonth]);

  const selectedDayEvents = eventsByDay.get(selectedDate) ?? [];
  const monthTotals = useMemo(() => getDirectionTotals(events), [events]);
  const selectedDayTotals = useMemo(() => getDirectionTotals(selectedDayEvents), [selectedDayEvents]);

  const formatAmount = (value: number) => maskValue(formatCurrencyBRL(value), visible);

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack max-w-7xl" data-testid="calendario-page">
        <FintechLoadingPageHeader
          titleWidth="w-72"
          subtitleWidth="w-96 max-w-full"
          actions={(
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Skeleton className="h-11 w-full rounded-2xl bg-muted/65 sm:w-28" />
              <Skeleton className="h-11 w-full rounded-2xl bg-muted/65 sm:w-40" />
            </div>
          )}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <FintechLoadingSurface>
            <div className="space-y-4">
              <Skeleton className="h-6 w-52 rounded-full bg-muted/65" />
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 rounded-2xl bg-muted/65" />
                ))}
              </div>
            </div>
          </FintechLoadingSurface>

          <FintechLoadingSurface>
            <div className="space-y-3">
              <Skeleton className="h-6 w-48 rounded-full bg-muted/65" />
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-2xl bg-muted/65" />
              ))}
            </div>
          </FintechLoadingSurface>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-page-shell app-section-stack max-w-6xl" data-testid="calendario-page">
        <FintechPageHeader
          title="Calendário financeiro"
          subtitle="Não foi possível carregar os compromissos financeiros deste mês."
        />
        <FintechEmptyState
          icon={<CalendarDays className="h-5 w-5 text-muted-foreground/70" />}
          title="Falha ao carregar o calendário"
          description={error instanceof Error ? error.message : "Tente novamente em instantes."}
          action={(
            <Button onClick={() => {
              void overviewQuery.refetch();
              void parcelasQuery.refetch();
              void metasQuery.refetch();
            }}
            >
              Recarregar
            </Button>
          )}
        />
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack max-w-7xl" data-testid="calendario-page">
      <FintechPageHeader
        eyebrow={(
          <Badge variant="outline" className="w-fit rounded-full border-border/60 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
            Planejamento mensal
          </Badge>
        )}
        title="Calendário Financeiro"
        subtitle="Veja por dia as entradas previstas, saídas, faturas, parcelas, serviços e prazos relevantes do mês."
        badges={(
          <>
            <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium shadow-sm">
              {events.length} {events.length === 1 ? "evento no mês" : "eventos no mês"}
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm dark:text-emerald-300">
              Entradas {formatAmount(monthTotals.entrada)}
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700 shadow-sm dark:text-rose-300">
              Saídas {formatAmount(monthTotals.saida)}
            </Badge>
          </>
        )}
        actionsClassName="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end"
        actions={(
          <>
            <Button
              variant="outline"
              className="h-10 rounded-2xl px-3 shadow-sm"
              onClick={() => setSelectedMonth(format(addMonths(monthDate, -1), "yyyy-MM"))}
            >
              <ChevronLeft className="h-4 w-4" />
              Mês anterior
            </Button>
            <div className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/60 bg-background/80 px-4 text-sm font-semibold shadow-sm">
              {formatMonthTitle(monthDate)}
            </div>
            <Button
              variant="outline"
              className="h-10 rounded-2xl px-3 shadow-sm"
              onClick={() => setSelectedMonth(format(addMonths(monthDate, 1), "yyyy-MM"))}
            >
              Próximo mês
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      />

      <FintechSurfaceInset className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <span>Faturas usam a mesma competência da tela Cartões.</span>
        <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
        <span>Serviços vinculados ao cartão entram apenas na fatura, sem duplicidade.</span>
      </FintechSurfaceInset>

      {events.length === 0 ? (
        <FintechEmptyState
          icon={<CalendarDays className="h-5 w-5 text-muted-foreground/70" />}
          title="Nenhum compromisso encontrado neste mês"
          description="Quando existirem entradas, saídas, faturas, serviços ou prazos no período, eles aparecerão aqui por dia."
        />
      ) : (
        <>
          <div className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
            <FintechSurfaceCard className="overflow-hidden">
              <div className="border-b border-border/60 px-5 py-4">
                <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {weekDayLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 p-4">
                {monthGrid.map((day) => {
                  const isoDay = format(day, "yyyy-MM-dd");
                  const dayEvents = eventsByDay.get(isoDay) ?? [];
                  const dayTotals = getDirectionTotals(dayEvents);
                  const uniqueGroups = Array.from(new Set(dayEvents.map((event) => event.group))).slice(0, 4);
                  const isSelected = selectedDate === isoDay;
                  const isOutside = !isSameMonth(day, monthDate);

                  return (
                    <button
                      key={isoDay}
                      type="button"
                      onClick={() => setSelectedDate(isoDay)}
                      className={cn(
                        "min-h-[126px] rounded-2xl border px-3 py-3 text-left shadow-sm transition-all duration-200",
                        isSelected
                          ? "border-primary/35 bg-primary/[0.06] ring-1 ring-primary/25"
                          : "border-border/50 bg-background/80 hover:border-primary/20 hover:bg-muted/20",
                        isOutside && "opacity-55",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                            isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground",
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {dayEvents.length > 0 ? (
                          <span className="rounded-full border border-border/60 bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                            {dayEvents.length}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {uniqueGroups.map((group) => (
                          <span
                            key={`${isoDay}-${group}`}
                            className={cn("h-2.5 w-2.5 rounded-full", EVENT_VISUALS[group].chipClassName)}
                          />
                        ))}
                      </div>

                      {dayEvents.length > 0 ? (
                        <div className="mt-4 space-y-1.5">
                          {dayTotals.entrada > 0 ? (
                            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              <ArrowUpRight className="h-3 w-3" />
                              {formatAmount(dayTotals.entrada)}
                            </div>
                          ) : null}
                          {dayTotals.saida > 0 ? (
                            <div className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                              <ArrowDownRight className="h-3 w-3" />
                              {formatAmount(dayTotals.saida)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-6 text-[11px] text-muted-foreground">Sem eventos</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </FintechSurfaceCard>

            <FintechSurfaceCard>
              <div className="border-b border-border/60 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Dia selecionado</p>
                    <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                      {formatSelectedDayLabel(selectedDate)}
                    </h2>
                  </div>
                  <Badge variant="secondary" className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs shadow-sm">
                    {selectedDayEvents.length} {selectedDayEvents.length === 1 ? "evento" : "eventos"}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <FintechSurfaceInset className="p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Entradas</p>
                    <p className="mt-2 text-sm font-semibold text-emerald-600">{formatAmount(selectedDayTotals.entrada)}</p>
                  </FintechSurfaceInset>
                  <FintechSurfaceInset className="p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Saídas</p>
                    <p className="mt-2 text-sm font-semibold text-rose-600">{formatAmount(selectedDayTotals.saida)}</p>
                  </FintechSurfaceInset>
                </div>
              </div>

              <ScrollArea className="h-[min(68vh,760px)]">
                <div className="space-y-3 p-4">
                  {selectedDayEvents.length === 0 ? (
                    <FintechEmptyState
                      icon={<CalendarDays className="h-5 w-5 text-muted-foreground/70" />}
                      title="Nenhum evento neste dia"
                      description="Selecione outro dia do mês para ver os compromissos e previsões."
                      size="compact"
                      className="bg-background/70"
                    />
                  ) : (
                    selectedDayEvents.map((event) => (
                      <EventRow key={event.id} event={event} formatAmount={formatAmount} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </FintechSurfaceCard>
          </div>

          <div className="space-y-4 xl:hidden">
            {orderedDayEntries.map(([dayKey, dayEvents]) => {
              const dayTotals = getDirectionTotals(dayEvents);

              return (
                <FintechSurfaceCard key={dayKey}>
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-tight text-foreground">{formatDayPill(dayKey)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dayEvents.length} {dayEvents.length === 1 ? "evento" : "eventos"} no dia
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {dayTotals.entrada > 0 ? (
                          <Badge variant="secondary" className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            + {formatAmount(dayTotals.entrada)}
                          </Badge>
                        ) : null}
                        {dayTotals.saida > 0 ? (
                          <Badge variant="secondary" className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                            - {formatAmount(dayTotals.saida)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {dayEvents.map((event) => (
                        <EventRow key={event.id} event={event} formatAmount={formatAmount} />
                      ))}
                    </div>
                  </CardContent>
                </FintechSurfaceCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
