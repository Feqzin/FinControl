import type { PagamentoTimelineEvent } from "@/services/api/pessoas";

export type TimelineStatusVisual = {
  label: string;
  dotClassName: string;
  textClassName: string;
  badgeClassName: string;
};

export type TimelineLayoutItem = {
  event: PagamentoTimelineEvent;
  x: number;
  key: string;
  timestamp: number;
};

const DEFAULT_LAYOUT = {
  minWidth: 720,
  paddingX: 48,
  spacingPx: 140,
};

function toSafeTimestamp(isoDate: string): number {
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getTimelineEventKey(event: Pick<PagamentoTimelineEvent, "sourceType" | "sourceId">): string {
  return `${event.sourceType}:${event.sourceId}`;
}

export function getTimelineStatusVisual(status: PagamentoTimelineEvent["status"]): TimelineStatusVisual {
  if (status === "pago") {
    return {
      label: "Pago",
      dotClassName: "bg-emerald-500",
      textClassName: "text-emerald-700 dark:text-emerald-400",
      badgeClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }

  if (status === "pendente") {
    return {
      label: "Pendente",
      dotClassName: "bg-amber-500",
      textClassName: "text-amber-700 dark:text-amber-400",
      badgeClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    };
  }

  return {
    label: "Vencido",
    dotClassName: "bg-red-500",
    textClassName: "text-red-700 dark:text-red-400",
    badgeClassName: "bg-red-500/10 text-red-700 dark:text-red-400",
  };
}

export function toTimelineDateLabel(event: PagamentoTimelineEvent): string {
  return event.status === "pago" ? "Pagamento" : "Vencimento";
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function getTimelineCanvasWidth(
  eventsCount: number,
  options?: Partial<typeof DEFAULT_LAYOUT>,
): number {
  const config = { ...DEFAULT_LAYOUT, ...(options ?? {}) };
  if (eventsCount <= 1) return config.minWidth;
  const bySpacing = config.paddingX * 2 + (eventsCount - 1) * config.spacingPx;
  return Math.max(config.minWidth, bySpacing);
}

export function buildTimelineLayout(
  events: PagamentoTimelineEvent[],
  options?: Partial<typeof DEFAULT_LAYOUT>,
): {
  width: number;
  items: TimelineLayoutItem[];
} {
  const config = { ...DEFAULT_LAYOUT, ...(options ?? {}) };
  if (events.length === 0) {
    return { width: config.minWidth, items: [] };
  }

  const sorted = [...events]
    .map((event) => ({
      event,
      timestamp: toSafeTimestamp(event.dataEvento),
      key: getTimelineEventKey(event),
    }))
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.key.localeCompare(b.key);
    });

  const width = getTimelineCanvasWidth(sorted.length, config);
  const startX = config.paddingX;
  const endX = width - config.paddingX;
  const range = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;

  const items = sorted.map((row, index) => {
    if (sorted.length === 1) {
      return { ...row, x: width / 2 };
    }

    if (range <= 0) {
      const ratio = index / (sorted.length - 1);
      return { ...row, x: startX + ratio * (endX - startX) };
    }

    const ratio = (row.timestamp - sorted[0].timestamp) / range;
    return { ...row, x: startX + ratio * (endX - startX) };
  });

  return { width, items };
}

export function findSelectedTimelineEvent(
  events: PagamentoTimelineEvent[],
  selectedKey: string | null,
): PagamentoTimelineEvent | null {
  if (!selectedKey) return null;
  return events.find((event) => getTimelineEventKey(event) === selectedKey) ?? null;
}
