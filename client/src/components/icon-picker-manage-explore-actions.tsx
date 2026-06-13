import { Button } from "@/components/ui/button";

type IconPickerManageExploreActionsProps = {
  showUseIconButton: boolean;
  onUseIcon: () => Promise<void> | void;
  useIconLabel: string;
  showAddIconButton: boolean;
  onAddIcon: () => Promise<void> | void;
  addIconLabel: string;
  isAddIconDisabled: boolean;
  showOpenPackButton: boolean;
  onOpenPack: () => void;
  openPackLabel: string;
  showAddPackButton: boolean;
  onAddPack: () => Promise<void> | void;
  addPackLabel: string;
  isAddPackDisabled: boolean;
  showManageInLibraryButton: boolean;
  onManageInLibrary: () => void;
  manageInLibraryLabel: string;
};

export function IconPickerManageExploreActions({
  showUseIconButton,
  onUseIcon,
  useIconLabel,
  showAddIconButton,
  onAddIcon,
  addIconLabel,
  isAddIconDisabled,
  showOpenPackButton,
  onOpenPack,
  openPackLabel,
  showAddPackButton,
  onAddPack,
  addPackLabel,
  isAddPackDisabled,
  showManageInLibraryButton,
  onManageInLibrary,
  manageInLibraryLabel,
}: IconPickerManageExploreActionsProps) {
  return (
    <>
      {showUseIconButton ? (
        <Button
          type="button"
          className="w-full justify-start"
          onClick={onUseIcon}
        >
          {useIconLabel}
        </Button>
      ) : null}

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

      {showAddPackButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          disabled={isAddPackDisabled}
          onClick={onAddPack}
        >
          {addPackLabel}
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
    </>
  );
}
