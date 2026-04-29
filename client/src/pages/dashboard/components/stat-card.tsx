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
    <Card className={`hover-elevate rounded-2xl border-border/60 bg-card/95 ${compact ? "min-h-[96px]" : "min-h-[112px]"}`}>
      <CardContent className={`${compact ? "p-[14px] md:p-[18px]" : "p-[14px] md:p-[18px]"} h-full`}>
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <p className="truncate text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <p
              className={`fin-value-kpi ${valueColor || ""}`}
              title={value}
            >
              {value}
            </p>
            {trend && <p className="truncate text-[12px] text-muted-foreground">{trend}</p>}
          </div>
          <div
            className={`flex items-center justify-center ${compact ? "h-9 w-9" : "h-10 w-10"} rounded-xl flex-shrink-0 ${color}`}
          >
            <Icon className={`${compact ? "w-4 h-4" : "w-5 h-5"}`} />
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
