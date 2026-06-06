import { Button } from "@/components/ui/button";

type IconPickerManagePersonalCoreActionsProps = {
  onUseIcon: () => void;
  useIconLabel: string;
  showEditInformationButton: boolean;
  onEditInformation: () => void;
  editInformationLabel: string;
  onToggleAutomation: () => Promise<void> | void;
  toggleAutomationLabel: string;
  isToggleAutomationDisabled: boolean;
  onRemoveIcon: () => void;
  removeIconLabel: string;
};

export function IconPickerManagePersonalCoreActions({
  onUseIcon,
  useIconLabel,
  showEditInformationButton,
  onEditInformation,
  editInformationLabel,
  onToggleAutomation,
  toggleAutomationLabel,
  isToggleAutomationDisabled,
  onRemoveIcon,
  removeIconLabel,
}: IconPickerManagePersonalCoreActionsProps) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        onClick={onUseIcon}
      >
        {useIconLabel}
      </Button>
      {showEditInformationButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={onEditInformation}
        >
          {editInformationLabel}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        disabled={isToggleAutomationDisabled}
        onClick={onToggleAutomation}
      >
        {toggleAutomationLabel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        className="w-full justify-start"
        onClick={onRemoveIcon}
      >
        {removeIconLabel}
      </Button>
    </>
  );
}
