import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type IconPickerPackRatingProps = {
  averageRating?: number | null;
  ratingCount?: number;
  userRating?: number | null;
  hoveredRating?: number | null;
  interactive?: boolean;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  onHoverChange?: (rating: number | null) => void;
  onRate?: (rating: number) => void;
};

const STAR_SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-4.5 w-4.5",
} as const;

function resolveStarFillPercent(index: number, averageRating: number | null | undefined): number {
  const safeAverage = Math.max(0, Math.min(5, Number(averageRating) || 0));
  const raw = Math.max(0, Math.min(1, safeAverage - (index - 1)));
  return Math.round(raw * 100);
}

export function IconPickerPackRating({
  averageRating = null,
  ratingCount = 0,
  userRating = null,
  hoveredRating = null,
  interactive = false,
  size = "sm",
  className,
  disabled = false,
  onHoverChange,
  onRate,
}: IconPickerPackRatingProps) {
  const starSizeClassName = STAR_SIZES[size];
  const effectiveInteractiveRating = interactive
    ? Math.max(0, Math.min(5, Number(hoveredRating ?? userRating) || 0))
    : 0;
  const isEmpty = Math.max(0, Number(ratingCount) || 0) <= 0 && !interactive;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, index) => {
          const starIndex = index + 1;
          const fillPercent = interactive
            ? (effectiveInteractiveRating >= starIndex ? 100 : 0)
            : resolveStarFillPercent(starIndex, averageRating);

          if (interactive) {
            return (
              <button
                key={starIndex}
                type="button"
                disabled={disabled}
                className="rounded-sm p-0.5 text-amber-500 transition-transform hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                aria-label={`Avaliar com ${starIndex} ${starIndex === 1 ? "estrela" : "estrelas"}`}
                onMouseEnter={() => onHoverChange?.(starIndex)}
                onMouseLeave={() => onHoverChange?.(null)}
                onFocus={() => onHoverChange?.(starIndex)}
                onBlur={() => onHoverChange?.(null)}
                onClick={() => onRate?.(starIndex)}
              >
                <Star
                  className={cn(starSizeClassName, fillPercent > 0 ? "fill-amber-400 text-amber-500" : "text-muted-foreground/60")}
                />
              </button>
            );
          }

          return (
            <span
              key={starIndex}
              className="relative inline-flex"
              aria-hidden="true"
            >
              <Star className={cn(starSizeClassName, isEmpty ? "text-muted-foreground/35" : "text-amber-500/40")} />
              {fillPercent > 0 ? (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fillPercent}%` }}
                >
                  <Star className={cn(starSizeClassName, "fill-amber-400 text-amber-500")} />
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
