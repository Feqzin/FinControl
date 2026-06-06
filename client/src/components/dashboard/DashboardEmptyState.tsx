import type { LucideIcon } from "lucide-react";

type DashboardEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function DashboardEmptyState({ icon: Icon, title, description }: DashboardEmptyStateProps) {
  return (
    <div className="flex min-h-[152px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/[0.18] px-5 py-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-background shadow-sm">
        <Icon className="h-5 w-5 text-muted-foreground/70" />
      </div>
      <div className="max-w-[250px] space-y-1">
        <p className="text-sm font-semibold text-foreground/90">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
