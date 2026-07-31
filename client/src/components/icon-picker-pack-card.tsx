import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconPickerPackRating } from "@/components/icon-picker-pack-rating";
import { Package2 } from "lucide-react";

type IconPickerPackCardProps = {
  name: string;
  matchHint?: string | null;
  coverImageUrl?: string | null;
  categoryLabel: string;
  iconsCountLabel: string;
  authorLabel: string;
  statusLabel: string;
  statusVariant: "secondary" | "outline";
  ratingAverage?: number | null;
  ratingCount?: number;
  ratingSummaryLabel: string;
  installCountLabel: string;
  addActionLabel: string;
  addButtonVariant: "default" | "outline";
  addDisabled: boolean;
  onOpenDetails: () => void;
  onAddPack: () => void;
  onOpenActions: () => void;
  onOpenAuthorProfile?: () => void;
};

export function IconPickerPackCard({
  name,
  matchHint,
  coverImageUrl,
  categoryLabel,
  iconsCountLabel,
  authorLabel,
  statusLabel,
  statusVariant,
  ratingAverage,
  ratingCount,
  ratingSummaryLabel,
  installCountLabel,
  addActionLabel,
  addButtonVariant,
  addDisabled,
  onOpenDetails,
  onAddPack,
  onOpenActions,
  onOpenAuthorProfile,
}: IconPickerPackCardProps) {
  const handleAddPackClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onAddPack();
  };

  const handleOpenActionsClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenActions();
  };

  const handleOpenAuthorProfileClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenAuthorProfile?.();
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onOpenDetails();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="group h-full rounded-2xl border border-border/70 bg-background/95 p-3 text-left shadow-sm transition-all duration-200 hover:border-border hover:bg-accent/15 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onOpenDetails}
      onKeyDown={handleCardKeyDown}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/15 shadow-sm">
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt={name}
              loading="lazy"
              decoding="async"
              className="h-9 w-9 rounded-xl object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Package2 className="h-5 w-5" />
              <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none">
                {name.trim().charAt(0) || "P"}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="text-[11px] text-muted-foreground">
                {categoryLabel} · {iconsCountLabel}
              </p>
            </div>
            <Badge variant={statusVariant} className="rounded-full px-2.5 py-0.5 text-[10px]">
              {statusLabel}
            </Badge>
          </div>
          {onOpenAuthorProfile ? (
            <button
              type="button"
              onClick={handleOpenAuthorProfileClick}
              className="truncate text-left text-[11px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {authorLabel}
            </button>
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">{authorLabel}</p>
          )}
        </div>
      </div>
      {matchHint ? (
        <p className="mt-2 text-[11px] text-primary/80">
          {matchHint}
        </p>
      ) : null}

      <div className="mt-3 rounded-xl border border-border/60 bg-muted/[0.14] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <IconPickerPackRating
            averageRating={ratingAverage}
            ratingCount={ratingCount}
            size="sm"
          />
          <p className="text-[11px] font-medium text-foreground">{ratingSummaryLabel}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{installCountLabel}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={addButtonVariant}
          disabled={addDisabled}
          onClick={handleAddPackClick}
          className="h-8 flex-1 rounded-xl px-3 text-[11px] font-medium"
        >
          {addActionLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpenActionsClick}
          className="h-8 rounded-xl px-3 text-[11px]"
        >
          Ações
        </Button>
      </div>
    </div>
  );
}
