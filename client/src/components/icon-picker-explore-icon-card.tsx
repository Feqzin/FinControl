import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type IconPickerExploreIconCardProps = {
  name: string;
  imageUrl: string;
  categoryLabel: string;
  originLabel: string;
  packSummaryLabel?: string | null;
  packItemPublicCode?: string | null;
  authorLabel: string;
  availabilityLabel: string;
  availabilityVariant: "secondary" | "outline";
  packAvailabilityLabel?: string | null;
  packAvailabilityVariant?: "secondary" | "outline";
  showAddButton: boolean;
  addButtonDisabled: boolean;
  showOpenPackButton: boolean;
  onOpenActions: () => void;
  onAddIcon: () => void | Promise<void>;
  onOpenPack: () => void;
};

export function IconPickerExploreIconCard({
  name,
  imageUrl,
  categoryLabel,
  originLabel,
  packSummaryLabel,
  packItemPublicCode,
  authorLabel,
  availabilityLabel,
  availabilityVariant,
  packAvailabilityLabel,
  packAvailabilityVariant = "outline",
  showAddButton,
  addButtonDisabled,
  showOpenPackButton,
  onOpenActions,
  onAddIcon,
  onOpenPack,
}: IconPickerExploreIconCardProps) {
  const handleAddClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await onAddIcon();
  };

  const handleOpenPackClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenPack();
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onOpenActions();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-2xl border border-border/60 bg-background/80 p-3 text-left shadow-sm transition-colors hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onOpenActions}
      onKeyDown={handleCardKeyDown}
    >
      <div className="flex items-start gap-3">
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-11 w-11 rounded-xl border border-border/50 object-cover shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {categoryLabel}
          </p>
          <p className="truncate text-[11px] font-medium text-foreground/80">
            {originLabel}
          </p>
          {packSummaryLabel ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {packSummaryLabel}
            </p>
          ) : null}
          {packItemPublicCode ? (
            <p className="truncate text-[10px] text-muted-foreground">
              ID: {packItemPublicCode}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={availabilityVariant} className="h-5 rounded-full px-2 text-[10px]">
          {availabilityLabel}
        </Badge>
        {packAvailabilityLabel ? (
          <Badge variant={packAvailabilityVariant} className="h-5 rounded-full px-2 text-[10px]">
            {packAvailabilityLabel}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        <span>{authorLabel}</span>
      </div>

      {showAddButton ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-xl"
            disabled={addButtonDisabled}
            onClick={handleAddClick}
          >
            Adicionar apenas este ícone
          </Button>
        </div>
      ) : null}
      {showOpenPackButton ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-xl"
            onClick={handleOpenPackClick}
          >
            Abrir pack
          </Button>
        </div>
      ) : null}
    </div>
  );
}
