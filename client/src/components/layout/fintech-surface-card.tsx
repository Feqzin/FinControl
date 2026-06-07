import * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FintechSurfaceTone = "default" | "primary" | "warning" | "success";

const cardToneClassName: Record<FintechSurfaceTone, string> = {
  default: "border-border/60 bg-card/95",
  primary: "border-primary/15 bg-primary/[0.05]",
  warning: "border-amber-500/20 bg-amber-500/5",
  success: "border-emerald-500/20 bg-emerald-500/5",
};

const insetToneClassName: Record<FintechSurfaceTone, string> = {
  default: "border-border/50 bg-background/80",
  primary: "border-primary/15 bg-primary/[0.05]",
  warning: "border-amber-500/20 bg-amber-500/[0.06]",
  success: "border-emerald-500/20 bg-emerald-500/[0.06]",
};

type FintechSurfaceCardProps = React.ComponentPropsWithoutRef<typeof Card> & {
  tone?: FintechSurfaceTone;
  interactive?: boolean;
};

type FintechSurfaceInsetProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: FintechSurfaceTone;
  interactive?: boolean;
};

type FintechSurfaceIconChipProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: "xs" | "sm" | "md" | "lg";
};

const iconSizeClassName = {
  xs: "h-9 w-9 rounded-xl",
  sm: "h-10 w-10 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-12 w-12 rounded-2xl",
} as const;

export const FintechSurfaceCard = React.forwardRef<HTMLDivElement, FintechSurfaceCardProps>(
  ({ className, tone = "default", interactive = false, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn(
        "rounded-[26px] border shadow-sm",
        cardToneClassName[tone],
        interactive && "desktop-hover-lift touch-feedback transition-all duration-200",
        className,
      )}
      {...props}
    />
  ),
);

FintechSurfaceCard.displayName = "FintechSurfaceCard";

export const FintechSurfaceInset = React.forwardRef<HTMLDivElement, FintechSurfaceInsetProps>(
  ({ className, tone = "default", interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border shadow-sm",
        insetToneClassName[tone],
        interactive && "desktop-hover-lift touch-feedback transition-all duration-200",
        className,
      )}
      {...props}
    />
  ),
);

FintechSurfaceInset.displayName = "FintechSurfaceInset";

export const FintechSurfaceIconChip = React.forwardRef<HTMLDivElement, FintechSurfaceIconChipProps>(
  ({ className, size = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 items-center justify-center border shadow-sm",
        iconSizeClassName[size],
        className,
      )}
      {...props}
    />
  ),
);

FintechSurfaceIconChip.displayName = "FintechSurfaceIconChip";
