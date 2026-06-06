type PerfilPageHeaderProps = {
  title: string;
  subtitle: string;
};

export function PerfilPageHeader({ title, subtitle }: PerfilPageHeaderProps) {
  return (
    <div className="fintech-page-header">
      <div className="space-y-1">
        <h1 className="fintech-page-title">{title}</h1>
        <p className="fintech-page-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}
