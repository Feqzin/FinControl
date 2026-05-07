import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/pages/dashboard/components/stat-card";

type DashboardSectionStatus = {
  isLoading: boolean;
  isError: boolean;
  message: string | null;
};

type SummaryCardConfig = {
  id: string;
  title: string;
  value: string;
  icon: any;
  trend?: string;
  color: string;
  valueColor?: string;
  tooltipLines?: string[];
};

type DashboardSummaryCardsProps = {
  status: DashboardSectionStatus;
  cards: SummaryCardConfig[];
  hiddenCardIds: string[];
  compact: boolean;
};

function SummaryCardsError({ message }: { message: string | null }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
      <p className="font-medium">Não foi possível carregar esta seção agora.</p>
      {message ? <p className="mt-1 text-xs opacity-90">{message}</p> : null}
    </div>
  );
}

export function DashboardSummaryCards({ status, cards, hiddenCardIds, compact }: DashboardSummaryCardsProps) {
  const gridClass = compact
    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5";

  if (status.isLoading) {
    return (
      <div className={gridClass}>
        {[1, 2, 3, 4, 5].map((idx) => (
          <Skeleton key={idx} className="h-[84px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (status.isError) {
    return <SummaryCardsError message={status.message} />;
  }

  return (
    <div className={gridClass}>
      {cards
        .filter((card) => !hiddenCardIds.includes(card.id))
        .map((card) => (
          <StatCard
            key={card.id}
            title={card.title}
            value={card.value}
            icon={card.icon}
            trend={card.trend}
            color={card.color}
            valueColor={card.valueColor}
            tooltipLines={card.tooltipLines}
            compact
          />
        ))}
    </div>
  );
}
