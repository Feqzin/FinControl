import { Badge } from "@/components/ui/badge";

type IconPickerManageExploreInfoProps = {
  previewImageUrl: string;
  previewAlt: string;
  availabilityLabel: string;
  availabilityVariant: "secondary" | "outline";
  packAvailabilityLabel?: string | null;
  packAvailabilityVariant?: "secondary" | "outline";
  sourceLabel: string;
  packOriginLabel: string;
  categoryLabel: string;
  packIconsCountLabel?: string | null;
  publicCodeLabel?: string | null;
};

export function IconPickerManageExploreInfo({
  previewImageUrl,
  previewAlt,
  availabilityLabel,
  availabilityVariant,
  packAvailabilityLabel,
  packAvailabilityVariant = "outline",
  sourceLabel,
  packOriginLabel,
  categoryLabel,
  packIconsCountLabel,
  publicCodeLabel,
}: IconPickerManageExploreInfoProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-border/60 bg-background/80 shadow-sm">
          <img
            src={previewImageUrl}
            alt={previewAlt}
            loading="lazy"
            decoding="async"
            className="h-16 w-16 rounded-2xl object-cover"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={availabilityVariant} className="rounded-full px-2.5 py-0.5 text-[10px]">
          {availabilityLabel}
        </Badge>
        {packAvailabilityLabel ? (
          <Badge variant={packAvailabilityVariant} className="rounded-full px-2.5 py-0.5 text-[10px]">
            {packAvailabilityLabel}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Origem</p>
          <p className="mt-1 text-sm text-foreground">
            {packOriginLabel}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categoria</p>
          <p className="mt-1 text-sm text-foreground">
            {categoryLabel}
          </p>
        </div>
        {packIconsCountLabel ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pack</p>
            <p className="mt-1 text-sm text-foreground">
              {packIconsCountLabel}
            </p>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {sourceLabel}
      </p>
      {publicCodeLabel ? (
        <p className="text-xs text-muted-foreground">
          {publicCodeLabel}
        </p>
      ) : null}
    </div>
  );
}
