import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FintechEmptyStateProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: "default" | "compact";
  className?: string;
  contentClassName?: string;
  iconWrapClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionWrapClassName?: string;
  testId?: string;
};

export function FintechEmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
  className,
  contentClassName,
  iconWrapClassName,
  titleClassName,
  descriptionClassName,
  actionWrapClassName,
  testId,
}: FintechEmptyStateProps) {
  const isCompact = size === "compact";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border/60 bg-card/95 text-center shadow-sm",
        isCompact ? "px-5 py-8 sm:px-6 sm:py-10" : "px-6 py-12 sm:px-8 sm:py-14",
        className,
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "mx-auto flex items-center justify-center border border-border/60 bg-background/80 shadow-sm",
          isCompact ? "h-12 w-12 rounded-2xl" : "h-16 w-16 rounded-3xl",
          iconWrapClassName,
        )}
      >
        {icon}
      </div>

      <div className={cn("mx-auto mt-5 space-y-2", isCompact ? "max-w-sm" : "max-w-md", contentClassName)}>
        <p
          className={cn(
            "font-semibold tracking-tight text-foreground",
            isCompact ? "text-sm sm:text-base" : "text-lg sm:text-xl",
            titleClassName,
          )}
        >
          {title}
        </p>
        {description ? (
          <p
            className={cn(
              "text-muted-foreground",
              isCompact ? "text-xs leading-relaxed sm:text-sm" : "text-sm leading-6",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className={cn("mt-5", actionWrapClassName)}>{action}</div> : null}
    </div>
  );
}
