import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type FintechLoadingTone = "card" | "inset" | "muted";

type FintechLoadingSurfaceProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: FintechLoadingTone;
};

type FintechLoadingLine = {
  width: string;
  height?: string;
  className?: string;
};

type FintechLoadingTextBlockProps = {
  lines: FintechLoadingLine[];
  className?: string;
};

type FintechLoadingActionClusterProps = {
  widths: string[];
  className?: string;
  itemClassName?: string;
};

type FintechLoadingPageHeaderProps = {
  className?: string;
  contentClassName?: string;
  actions?: ReactNode;
  titleWidth?: string;
  subtitleWidth?: string;
  eyebrowWidth?: string;
  showEyebrow?: boolean;
};

type FintechLoadingMetricCardProps = {
  className?: string;
  titleWidth?: string;
  valueWidth?: string;
  detailWidth?: string;
  iconSizeClassName?: string;
  compact?: boolean;
  tone?: FintechLoadingTone;
};

type FintechLoadingListItemProps = {
  className?: string;
  titleWidth?: string;
  subtitleWidth?: string;
  trailingWidth?: string;
  iconSizeClassName?: string;
  tone?: FintechLoadingTone;
  compact?: boolean;
  showSubtitle?: boolean;
  showTrailing?: boolean;
};

const toneClassName: Record<FintechLoadingTone, string> = {
  card: "border-border/60 bg-card/95",
  inset: "border-border/50 bg-background/80",
  muted: "border-border/55 bg-muted/[0.16]",
};

export function FintechLoadingSurface({
  children,
  className,
  contentClassName,
  tone = "card",
}: FintechLoadingSurfaceProps) {
  return (
    <div className={cn("rounded-[26px] border shadow-sm", toneClassName[tone], className)}>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

export function FintechLoadingTextBlock({
  lines,
  className,
}: FintechLoadingTextBlockProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {lines.map((line, index) => (
        <Skeleton
          key={`${line.width}-${line.height ?? "h-4"}-${index}`}
          className={cn(line.height ?? "h-4", line.width, "rounded-full bg-muted/65", line.className)}
        />
      ))}
    </div>
  );
}

export function FintechLoadingActionCluster({
  widths,
  className,
  itemClassName,
}: FintechLoadingActionClusterProps) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:w-auto", className)}>
      {widths.map((width, index) => (
        <Skeleton
          key={`${width}-${index}`}
          className={cn("h-11 rounded-2xl bg-muted/65", width, itemClassName)}
        />
      ))}
    </div>
  );
}

export function FintechLoadingPageHeader({
  className,
  contentClassName,
  actions,
  titleWidth = "w-56",
  subtitleWidth = "w-80 max-w-full",
  eyebrowWidth = "w-24",
  showEyebrow = true,
}: FintechLoadingPageHeaderProps) {
  return (
    <FintechLoadingSurface className={cn("rounded-[28px] backdrop-blur", className)}>
      <div className="flex flex-col gap-5 p-6 xl:flex-row xl:items-start xl:justify-between">
        <FintechLoadingTextBlock
          className={cn("space-y-3", contentClassName)}
          lines={[
            ...(showEyebrow ? [{ width: eyebrowWidth, height: "h-4" }] : []),
            { width: titleWidth, height: "h-10", className: "rounded-xl bg-muted/70" },
            { width: subtitleWidth, height: "h-4" },
          ]}
        />
        {actions ? <div className="w-full xl:w-auto">{actions}</div> : null}
      </div>
    </FintechLoadingSurface>
  );
}

export function FintechLoadingMetricCard({
  className,
  titleWidth = "w-24",
  valueWidth = "w-28",
  detailWidth,
  iconSizeClassName = "h-11 w-11",
  compact = false,
  tone = "card",
}: FintechLoadingMetricCardProps) {
  return (
    <FintechLoadingSurface className={className} tone={tone}>
      <div className={cn("space-y-4 p-5", compact && "p-[14px] md:p-[18px]")}>
        <div className="flex items-start justify-between gap-3">
          <FintechLoadingTextBlock lines={[{ width: titleWidth, height: "h-4" }]} />
          <Skeleton className={cn(iconSizeClassName, "shrink-0 rounded-2xl bg-muted/70")} />
        </div>
        <FintechLoadingTextBlock
          lines={[
            { width: valueWidth, height: "h-8", className: "rounded-xl bg-muted/75" },
            ...(detailWidth ? [{ width: detailWidth, height: "h-3", className: "bg-muted/60" }] : []),
          ]}
          className="space-y-2"
        />
      </div>
    </FintechLoadingSurface>
  );
}

export function FintechLoadingListItem({
  className,
  titleWidth = "w-32",
  subtitleWidth = "w-24",
  trailingWidth = "w-20",
  iconSizeClassName = "h-10 w-10",
  tone = "muted",
  compact = false,
  showSubtitle = true,
  showTrailing = true,
}: FintechLoadingListItemProps) {
  return (
    <FintechLoadingSurface className={className} tone={tone}>
      <div className={cn("flex items-start gap-3 p-4", compact && "p-3")}>
        <Skeleton className={cn(iconSizeClassName, "shrink-0 rounded-2xl bg-muted/70")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <FintechLoadingTextBlock
              className="min-w-0 flex-1"
              lines={[
                { width: titleWidth, height: compact ? "h-3" : "h-4" },
                ...(showSubtitle ? [{ width: subtitleWidth, height: compact ? "h-3" : "h-3" }] : []),
              ]}
            />
            {showTrailing ? (
              <Skeleton
                className={cn(
                  compact ? "h-4" : "h-4",
                  trailingWidth,
                  "shrink-0 rounded-full bg-muted/65",
                )}
              />
            ) : null}
          </div>
        </div>
      </div>
    </FintechLoadingSurface>
  );
}
