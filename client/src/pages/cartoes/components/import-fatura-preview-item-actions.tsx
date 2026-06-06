import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImportFaturaPreviewItemActionsProps = {
  editAriaLabel: string;
  editTitle: string;
  editTestId: string;
  onEdit: () => void;
  removeAriaLabel: string;
  removeTitle: string;
  removeTestId: string;
  onRemove: () => void;
};

export function ImportFaturaPreviewItemActions({
  editAriaLabel,
  editTitle,
  editTestId,
  onEdit,
  removeAriaLabel,
  removeTitle,
  removeTestId,
  onRemove,
}: ImportFaturaPreviewItemActionsProps) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="mt-0.5 h-7 w-7 flex-shrink-0 sm:mt-0"
        aria-label={editAriaLabel}
        title={editTitle}
        onClick={onEdit}
        data-testid={editTestId}
      >
        <Pencil className="w-3 h-3 text-muted-foreground" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="mt-0.5 h-7 w-7 flex-shrink-0 sm:mt-0"
        aria-label={removeAriaLabel}
        title={removeTitle}
        onClick={onRemove}
        data-testid={removeTestId}
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </Button>
    </div>
  );
}
