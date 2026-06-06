import { Button } from "@/components/ui/button";

type IconPickerManagePackActionsProps = {
  sourceLabel: string;
  publicCode?: string | null;
  summaryLabel: string;
  onViewDetails: () => void;
  viewDetailsLabel: string;
  onAddPack: () => void;
  addPackLabel: string;
  addPackVariant: "default" | "outline";
  isAddPackDisabled: boolean;
  showUnpublishButton: boolean;
  onUnpublishPack: () => Promise<void> | void;
  unpublishLabel: string;
  isUnpublishDisabled: boolean;
};

export function IconPickerManagePackActions({
  sourceLabel,
  publicCode,
  summaryLabel,
  onViewDetails,
  viewDetailsLabel,
  onAddPack,
  addPackLabel,
  addPackVariant,
  isAddPackDisabled,
  showUnpublishButton,
  onUnpublishPack,
  unpublishLabel,
  isUnpublishDisabled,
}: IconPickerManagePackActionsProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {sourceLabel}
      </p>
      {publicCode ? (
        <p className="text-xs text-muted-foreground">
          ID do pack: {publicCode}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {summaryLabel}
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        onClick={onViewDetails}
      >
        {viewDetailsLabel}
      </Button>
      <Button
        type="button"
        variant={addPackVariant}
        className="w-full justify-start"
        disabled={isAddPackDisabled}
        onClick={onAddPack}
      >
        {addPackLabel}
      </Button>
      {showUnpublishButton ? (
        <Button
          type="button"
          variant="destructive"
          className="w-full justify-start"
          disabled={isUnpublishDisabled}
          onClick={onUnpublishPack}
        >
          {unpublishLabel}
        </Button>
      ) : null}
    </div>
  );
}
