import { AlertTriangle, CreditCard, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CartaoInsightItem = {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
};

type CartoesInsightsProps = {
  items: CartaoInsightItem[];
};

export function CartoesInsights({ items }: CartoesInsightsProps) {
  if (items.length === 0) return null;

  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Insights de cartões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const isCritical = item.severity === "critical";
          const isWarning = item.severity === "warning";
          const Icon = isCritical ? AlertTriangle : CreditCard;
          const className = isCritical
            ? "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300"
            : isWarning
              ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
              : "border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-300";

          return (
            <div key={item.id} className={`flex items-start gap-3 rounded-lg border p-3 ${className}`}>
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{item.title}</p>
                <p className="mt-0.5 text-xs opacity-90">{item.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

