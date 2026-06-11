import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type IconPickerPackDetailIconCardProps = {
  imageUrl: string;
  name: string;
  categoryLabel: string;
  publicCode?: string | null;
  availabilityLabel: string;
  availabilityVariant: "secondary" | "outline";
  showAddButton: boolean;
  addDisabled: boolean;
  onOpenActions: () => void;
  onAddIcon: () => Promise<void> | void;
};

export function IconPickerPackDetailIconCard({
  imageUrl,
  name,
  categoryLabel,
  publicCode,
  availabilityLabel,
  availabilityVariant,
  showAddButton,
  addDisabled,
  onOpenActions,
  onAddIcon,
}: IconPickerPackDetailIconCardProps) {
  const handleAddIconClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await onAddIcon();
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
          className="h-8 w-8 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {categoryLabel}
          </p>
          {publicCode ? (
            <p className="truncate text-[10px] text-muted-foreground">
              ID: {publicCode}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <Badge variant={availabilityVariant} className="w-fit px-1.5 text-[10px]">
          {availabilityLabel}
        </Badge>
        {showAddButton ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={addDisabled}
            onClick={handleAddIconClick}
          >
            Adicionar este ícone
          </Button>
        ) : null}
      </div>
    </div>
  );
}
