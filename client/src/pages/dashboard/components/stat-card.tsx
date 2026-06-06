import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
  valueColor,
  tooltipLines,
  compact,
}: {
  title: string;
  value: string;
  icon: any;
  trend?: string;
  color: string;
  valueColor?: string;
  tooltipLines?: string[];
  compact?: boolean;
}) {
  const card = (
    <Card className={`hover-elevate rounded-2xl border border-border/60 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${compact ? "min-h-[96px]" : "min-h-[112px]"}`}>
      <CardContent className={`${compact ? "p-[14px] md:p-[18px]" : "p-[14px] md:p-[18px]"} h-full`}>
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground/85">
              {title}
            </p>
            <div
              className={`flex flex-shrink-0 items-center justify-center rounded-xl border border-black/5 shadow-sm ${compact ? "h-9 w-9" : "h-10 w-10"} ${color}`}
            >
              <Icon className={`${compact ? "h-4 w-4" : "h-[18px] w-[18px]"}`} />
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <p
              className={`fin-value-kpi leading-none tracking-tight ${valueColor || ""}`}
              title={value}
            >
              {value}
            </p>
            {trend ? (
              <p className="truncate text-[11px] leading-relaxed text-muted-foreground/75">
                {trend}
              </p>
            ) : (
              <div className="h-[16px]" aria-hidden="true" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!tooltipLines?.length) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[300px] p-3">
        <div className="space-y-1 text-xs">
          {tooltipLines.map((line, i) =>
            line.startsWith("---") ? <div key={i} className="border-t border-border my-1" /> : <div key={i}>{line}</div>,
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
