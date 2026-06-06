import { Button } from "@/components/ui/button";

type IconPickerManageExploreActionsProps = {
  showAddIconButton: boolean;
  onAddIcon: () => Promise<void> | void;
  addIconLabel: string;
  isAddIconDisabled: boolean;
  showOpenPackButton: boolean;
  onOpenPack: () => void;
  openPackLabel: string;
  showManageInLibraryButton: boolean;
  onManageInLibrary: () => void;
  manageInLibraryLabel: string;
  showUseIconButton: boolean;
  onUseIcon: () => Promise<void> | void;
  useIconLabel: string;
};

export function IconPickerManageExploreActions({
  showAddIconButton,
  onAddIcon,
  addIconLabel,
  isAddIconDisabled,
  showOpenPackButton,
  onOpenPack,
  openPackLabel,
  showManageInLibraryButton,
  onManageInLibrary,
  manageInLibraryLabel,
  showUseIconButton,
  onUseIcon,
  useIconLabel,
}: IconPickerManageExploreActionsProps) {
  return (
    <>
      {showAddIconButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          disabled={isAddIconDisabled}
          onClick={onAddIcon}
        >
          {addIconLabel}
        </Button>
      ) : null}

      {showOpenPackButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={onOpenPack}
        >
          {openPackLabel}
        </Button>
      ) : null}

      {showManageInLibraryButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={onManageInLibrary}
        >
          {manageInLibraryLabel}
        </Button>
      ) : null}

      {showUseIconButton ? (
        <Button
          type="button"
          className="w-full justify-start"
          onClick={onUseIcon}
        >
          {useIconLabel}
        </Button>
      ) : null}
    </>
  );
}
