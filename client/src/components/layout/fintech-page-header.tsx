import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FintechPageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
  rowClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  badgesClassName?: string;
  actionsClassName?: string;
};

export function FintechPageHeader({
  title,
  subtitle,
  eyebrow,
  badges,
  actions,
  className,
  rowClassName,
  contentClassName,
  titleClassName,
  subtitleClassName,
  badgesClassName,
  actionsClassName,
}: FintechPageHeaderProps) {
  return (
    <div className={cn("fintech-page-header shadow-sm backdrop-blur", className)}>
      <div className={cn("fintech-page-header-row", rowClassName)}>
        <div className={cn("min-w-0 flex-1 space-y-2.5 sm:space-y-3", contentClassName)}>
          {eyebrow}
          <div className="space-y-1.5 sm:space-y-2">
            <h1 className={cn("fintech-page-title", titleClassName)}>{title}</h1>
            {subtitle ? (
              <p className={cn("fintech-page-subtitle max-w-2xl text-muted-foreground/90", subtitleClassName)}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {badges ? (
            <div className={cn("flex flex-wrap items-center gap-1.5 pt-0 text-[11px] sm:gap-2", badgesClassName)}>
              {badges}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className={cn(actionsClassName ?? "fintech-page-actions")}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
