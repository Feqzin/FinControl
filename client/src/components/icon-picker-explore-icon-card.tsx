import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type IconPickerExploreIconCardProps = {
  name: string;
  imageUrl: string;
  categoryLabel: string;
  originLabel: string;
  packItemPublicCode?: string | null;
  authorLabel: string;
  availabilityLabel: string;
  availabilityVariant: "secondary" | "outline";
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
  packItemPublicCode,
  authorLabel,
  availabilityLabel,
  availabilityVariant,
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
      className="rounded-lg border p-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onOpenActions}
      onKeyDown={handleCardKeyDown}
    >
      <div className="flex items-center gap-2">
        <img
          src={imageUrl}
          alt={name}
          className="h-9 w-9 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {categoryLabel}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {originLabel}
          </p>
          {packItemPublicCode ? (
            <p className="truncate text-[10px] text-muted-foreground">
              ID: {packItemPublicCode}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{authorLabel}</span>
        <Badge variant={availabilityVariant} className="h-5 px-1.5 text-[10px]">
          {availabilityLabel}
        </Badge>
      </div>
      {showAddButton ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={addButtonDisabled}
            onClick={handleAddClick}
          >
            Adicionar este ícone
          </Button>
        </div>
      ) : null}
      {showOpenPackButton ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleOpenPackClick}
          >
            Abrir pack
          </Button>
        </div>
      ) : null}
    </div>
  );
}
