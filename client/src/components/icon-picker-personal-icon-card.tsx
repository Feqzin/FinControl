import { Check } from "lucide-react";

type IconPickerPersonalIconCardProps = {
  name: string;
  imageUrl: string;
  isSelected: boolean;
  isAutomationDisabled: boolean;
  onClick: () => void;
  testId: string;
  title: string;
  ariaLabel: string;
};

export function IconPickerPersonalIconCard({
  name,
  imageUrl,
  isSelected,
  isAutomationDisabled,
  onClick,
  testId,
  title,
  ariaLabel,
}: IconPickerPersonalIconCardProps) {
  return (
    <div
      className={`relative rounded-lg border p-2 transition-all ${
        isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        title={title}
        aria-label={ariaLabel}
        className="flex w-full flex-col items-center gap-1 rounded-md p-1 text-left transition-colors hover:bg-accent"
      >
        <div className="relative">
          <img
            src={imageUrl}
            alt={name}
            className={`h-10 w-10 rounded-xl object-cover transition ${
              isAutomationDisabled ? "opacity-50 grayscale saturate-0" : ""
            }`}
          />
          {isSelected ? (
            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
              <Check className="h-2.5 w-2.5 text-primary-foreground" />
            </div>
          ) : null}
        </div>
        <span
          className={`w-full truncate text-center text-[10px] leading-tight text-muted-foreground ${
            isAutomationDisabled ? "opacity-75" : ""
          }`}
          title={name}
        >
          {name}
        </span>
      </button>
    </div>
  );
}
