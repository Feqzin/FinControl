import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UsageMode } from "@/context/ui-preferences";

type PerfilUsageModeCardItem = {
  value: UsageMode;
  title: string;
  description: string;
};

type PerfilUsageModeCardProps = {
  isVisible: boolean;
  title: string;
  introText: string;
  usageMode: UsageMode;
  onUsageModeChange: (value: UsageMode) => void;
  currentModeDescription: string;
  items: readonly PerfilUsageModeCardItem[];
};

export function PerfilUsageModeCard({
  isVisible,
  title,
  introText,
  usageMode,
  onUsageModeChange,
  currentModeDescription,
  items,
}: PerfilUsageModeCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="w-4 h-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {introText}
        </p>
        <Select
          value={usageMode}
          onValueChange={(value) => onUsageModeChange(value as UsageMode)}
        >
          <SelectTrigger data-testid="select-usage-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="fintech-surface-subtle p-3 text-xs text-muted-foreground">
          {currentModeDescription}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.value}
              className={`rounded-md border p-2 text-xs ${usageMode === item.value ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20"}`}
            >
              <p className="font-semibold">{item.title}</p>
              <p className="text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
