type IconPickerPackSelectIconCardProps = {
  imageUrl: string;
  name: string;
  categoryLabel: string;
  isSelected: boolean;
  onClick: () => void;
};

export function IconPickerPackSelectIconCard({
  imageUrl,
  name,
  categoryLabel,
  isSelected,
  onClick,
}: IconPickerPackSelectIconCardProps) {
  return (
    <button
      type="button"
      className={`rounded-lg border p-2 text-left transition-colors ${
        isSelected ? "border-primary ring-1 ring-primary/30" : "border-border hover:bg-accent"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <img
          src={imageUrl}
          alt={name}
          className="h-8 w-8 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {categoryLabel}
          </p>
        </div>
      </div>
    </button>
  );
}
