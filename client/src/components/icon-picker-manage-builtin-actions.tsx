import { Button } from "@/components/ui/button";

type IconPickerManageBuiltinActionsProps = {
  onUseIcon: () => void;
  onToggleAutomation: () => void;
  useIconLabel: string;
  toggleAutomationLabel: string;
  isToggleAutomationDisabled: boolean;
};

export function IconPickerManageBuiltinActions({
  onUseIcon,
  onToggleAutomation,
  useIconLabel,
  toggleAutomationLabel,
  isToggleAutomationDisabled,
}: IconPickerManageBuiltinActionsProps) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
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
