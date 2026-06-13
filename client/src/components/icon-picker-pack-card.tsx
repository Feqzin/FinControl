import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type IconPickerPackCardProps = {
  name: string;
  matchHint?: string | null;
  categorySummary: string;
  authorLabel: string;
  publicCode?: string | null;
  statusLabel: string;
  statusVariant: "secondary" | "outline";
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
  statusLabel,
  statusVariant,
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
      className="rounded-lg border p-3 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onOpenDetails}
      onKeyDown={handleCardKeyDown}
    >
      <p className="text-sm font-medium">{name}</p>
      <div className="mt-2">
        <Badge variant={statusVariant} className="rounded-full px-2.5 text-[10px]">
          {statusLabel}
        </Badge>
      </div>
      {matchHint ? (
        <p className="mt-2 text-xs text-muted-foreground">
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
    </div>
  );
}
