import { Button } from "@/components/ui/button";

type IconPickerEmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestId?: string;
};

export function IconPickerEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionTestId,
}: IconPickerEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <p>{title}</p>
      {description ? (
        <p className="mt-1 text-xs">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          type="button"
          size="sm"
          className="mt-3"
          variant="outline"
          onClick={onAction}
          data-testid={actionTestId}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
