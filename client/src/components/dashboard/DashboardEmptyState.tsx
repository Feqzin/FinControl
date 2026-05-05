import type { LucideIcon } from "lucide-react";

type DashboardEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function DashboardEmptyState({ icon: Icon, title, description }: DashboardEmptyStateProps) {
  return (
    <div className="py-8 text-center text-muted-foreground">
      <Icon className="mx-auto mb-2 h-8 w-8 opacity-40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs">{description}</p>
    </div>
  );
}

