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
    <Card className={`hover-elevate ${compact ? "min-h-[84px]" : "min-h-[104px]"}`}>
      <CardContent className={`${compact ? "p-3.5" : "p-5"} h-full`}>
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className={`${compact ? "text-lg" : "text-xl"} font-bold tracking-tight truncate ${valueColor || ""}`} title={value}>
              {value}
            </p>
            {trend && !compact && <p className="text-xs text-muted-foreground truncate">{trend}</p>}
          </div>
          <div
            className={`flex items-center justify-center ${compact ? "w-8 h-8" : "w-10 h-10"} rounded-md flex-shrink-0 ${color}`}
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
