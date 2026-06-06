import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";

type IconPickerPackCardProps = {
  name: string;
  matchHint?: string | null;
  categorySummary: string;
  authorLabel: string;
  publicCode?: string | null;
  addActionLabel: string;
  addButtonVariant: "default" | "outline";
  addDisabled: boolean;
  onOpenDetails: () => void;
  onAddPack: () => void;
  onOpenActions: () => void;
};

export function IconPickerPackCard({
  name,
  matchHint,
  categorySummary,
  authorLabel,
  publicCode,
  addActionLabel,
  addButtonVariant,
  addDisabled,
  onOpenDetails,
  onAddPack,
  onOpenActions,
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

  return (
    <button
      type="button"
      className="rounded-lg border p-3 text-left transition-colors hover:bg-accent"
      onClick={onOpenDetails}
    >
      <p className="text-sm font-medium">{name}</p>
      {matchHint ? (
        <p className="text-xs text-muted-foreground">
          {matchHint}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">{categorySummary}</p>
      <p className="text-xs text-muted-foreground">{authorLabel}</p>
      {publicCode ? (
        <p className="text-xs text-muted-foreground">
          ID do pack: {publicCode}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={addButtonVariant}
          disabled={addDisabled}
          onClick={handleAddPackClick}
        >
          {addActionLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpenActionsClick}
        >
          Ações
        </Button>
      </div>
    </button>
  );
}
