import { Badge } from "@/components/ui/badge";

type IconPickerManageExploreInfoProps = {
  showInLibraryBadge: boolean;
  inLibraryLabel: string;
  sourceLabel: string;
  packOriginLabel: string;
  categoryLabel: string;
  publicCodeLabel?: string | null;
};

export function IconPickerManageExploreInfo({
  showInLibraryBadge,
  inLibraryLabel,
  sourceLabel,
  packOriginLabel,
  categoryLabel,
  publicCodeLabel,
}: IconPickerManageExploreInfoProps) {
  return (
    <>
      {showInLibraryBadge ? (
        <Badge variant="secondary" className="w-fit">
          {inLibraryLabel}
        </Badge>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {sourceLabel}
      </p>
      <p className="text-xs text-muted-foreground">
        {packOriginLabel}
      </p>
      <p className="text-xs text-muted-foreground">
        {categoryLabel}
      </p>
      {publicCodeLabel ? (
        <p className="text-xs text-muted-foreground">
          {publicCodeLabel}
        </p>
      ) : null}
    </>
  );
}
