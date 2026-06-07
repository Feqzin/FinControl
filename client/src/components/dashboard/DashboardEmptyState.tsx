import type { LucideIcon } from "lucide-react";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";

type DashboardEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function DashboardEmptyState({ icon: Icon, title, description }: DashboardEmptyStateProps) {
  return (
    <FintechEmptyState
      icon={<Icon className="h-5 w-5 text-muted-foreground/70" />}
      title={title}
      description={description}
      size="compact"
      className="min-h-[152px] bg-muted/[0.18] px-5 py-8 shadow-none"
      contentClassName="max-w-[250px]"
      titleClassName="text-sm text-foreground/90 sm:text-sm"
      descriptionClassName="text-xs leading-relaxed sm:text-xs"
      iconWrapClassName="border-black/5"
    />
  );
}
