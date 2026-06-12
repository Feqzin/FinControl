import { Button } from "@/components/ui/button";

type IconPickerManageBuiltinActionsProps = {
  onUseIcon: () => void;
  onToggleAutomation: () => void;
  useIconLabel: string;
  isUseIconDisabled: boolean;
  toggleAutomationLabel: string;
  isToggleAutomationDisabled: boolean;
};

export function IconPickerManageBuiltinActions({
  onUseIcon,
  onToggleAutomation,
  useIconLabel,
  isUseIconDisabled,
  toggleAutomationLabel,
  isToggleAutomationDisabled,
}: IconPickerManageBuiltinActionsProps) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        disabled={isUseIconDisabled}
        onClick={onUseIcon}
      >
        {useIconLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        disabled={isToggleAutomationDisabled}
        onClick={onToggleAutomation}
      >
        {toggleAutomationLabel}
      </Button>
    </div>
  );
}
