import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IconPickerSelectMeta } from "@/components/icon-picker";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

type CardIconPickerFieldProps = {
  name: string;
  value: string | null;
  onChange: (nextIconId: string | null) => void;
  onSelectMeta: (meta: IconPickerSelectMeta) => void;
  manualSelection: boolean;
  autoAppliedByKeyword: boolean;
  showMediumSuggestion: boolean;
  mediumSuggestionLabel: string;
  onUseMediumSuggestion: () => void;
};

export function CardIconPickerField({
  name,
  value,
  onChange,
  onSelectMeta,
  manualSelection,
  autoAppliedByKeyword,
  showMediumSuggestion,
  mediumSuggestionLabel,
  onUseMediumSuggestion,
}: CardIconPickerFieldProps) {
  return (
    <div className="space-y-2">
      <Suspense fallback={<Skeleton className="h-14 w-full" />}>
        <IconPicker
          value={value}
          name={name}
          autoApplySuggestion={false}
          onChange={onChange}
          onSelectMeta={onSelectMeta}
          size="md"
        />
      </Suspense>
      {manualSelection ? (
        <p className="text-xs text-muted-foreground">Ícone manual selecionado.</p>
      ) : autoAppliedByKeyword ? (
        <p className="text-xs text-emerald-600">Ícone aplicado automaticamente por palavra-chave.</p>
      ) : null}
      {showMediumSuggestion ? (
        <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          <p>
            Ícone sugerido: {mediumSuggestionLabel}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="h-auto px-0 text-xs"
            onClick={onUseMediumSuggestion}
          >
            Usar este ícone
          </Button>
        </div>
      ) : null}
    </div>
  );
}
