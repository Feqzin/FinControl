type PerfilPlanUsageCardItem = {
  label: string;
  value: string;
  remainingLabel: string;
};

type PerfilPlanUsageCardProps = {
  title: string;
  items: readonly PerfilPlanUsageCardItem[];
  showError: boolean;
  errorText: string;
};

export function PerfilPlanUsageCard({
  title,
  items,
  showError,
  errorText,
}: PerfilPlanUsageCardProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="fintech-grid-fluid-260">
        {items.map((item) => (
          <div key={item.label} className="fintech-stat-card">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.remainingLabel}</p>
          </div>
        ))}
      </div>
      {showError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          {errorText}
        </p>
      )}
    </div>
  );
}
