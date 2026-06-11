import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type IconPickerEditDialogContentProps = {
  iconName: string;
  onIconNameChange: (value: string) => void;
  iconNameLabel: string;
  iconNamePlaceholder: string;
  iconNameAriaLabel: string;
  category: string;
  onCategoryChange: (value: string) => void;
  categoryLabel: string;
  categoryAriaLabel: string;
  categoryPlaceholder: string;
  categoryOptions: ReadonlyArray<{
    value: string;
    label: string;
  }>;
  keywords: string;
  onKeywordsChange: (value: string) => void;
  keywordsLabel: string;
  keywordsPlaceholder: string;
  keywordsAriaLabel: string;
  onCancel: () => void;
  cancelLabel: string;
  onSave: () => void;
  saveLabel: string;
  savePendingLabel: string;
  isSavePending: boolean;
};

export function IconPickerEditDialogContent({
  iconName,
  onIconNameChange,
  iconNameLabel,
  iconNamePlaceholder,
  iconNameAriaLabel,
  category,
  onCategoryChange,
  categoryLabel,
  categoryAriaLabel,
  categoryPlaceholder,
  categoryOptions,
  keywords,
  onKeywordsChange,
  keywordsLabel,
  keywordsPlaceholder,
  keywordsAriaLabel,
  onCancel,
  cancelLabel,
  onSave,
  saveLabel,
  savePendingLabel,
  isSavePending,
}: IconPickerEditDialogContentProps) {
  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">{iconNameLabel}</label>
          <Input
            value={iconName}
            onChange={(event) => onIconNameChange(event.target.value)}
            placeholder={iconNamePlaceholder}
            aria-label={iconNameAriaLabel}
            maxLength={120}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">{categoryLabel}</label>
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger aria-label={categoryAriaLabel}>
              <SelectValue placeholder={categoryPlaceholder} />
            </SelectTrigger>
            <SelectContent className="z-[90]">
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">{keywordsLabel}</label>
          <Input
            value={keywords}
            onChange={(event) => onKeywordsChange(event.target.value)}
            placeholder={keywordsPlaceholder}
            aria-label={keywordsAriaLabel}
            maxLength={500}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={onSave}
          disabled={isSavePending}
        >
          {isSavePending ? savePendingLabel : saveLabel}
        </Button>
      </div>
    </>
  );
}
