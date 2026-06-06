import { Badge } from "@/components/ui/badge";

type PerfilPlanStatusCardProps = {
  title: string;
  description: string;
  tone: "default" | "secondary" | "destructive";
  premiumAtivoNaUi: boolean;
};

export function PerfilPlanStatusCard({
  title,
  description,
  tone,
  premiumAtivoNaUi,
}: PerfilPlanStatusCardProps) {
  return (
    <div className="fintech-surface-subtle flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant={tone}>
        {premiumAtivoNaUi ? "Premium" : "Free"}
      </Badge>
    </div>
  );
}
