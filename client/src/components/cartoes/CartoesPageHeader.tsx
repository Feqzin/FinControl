import type { ReactNode } from "react";

type CartoesPageHeaderProps = {
  title: string;
  subtitle: string;
  actions: ReactNode;
};

export function CartoesPageHeader({ title, subtitle, actions }: CartoesPageHeaderProps) {
  return (
    <div className="fintech-page-header border border-border/60 bg-card/95 shadow-sm">
      <div className="fintech-page-header-row items-start gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="fintech-page-title">{title}</h1>
          <p className="fintech-page-subtitle">{subtitle}</p>
        </div>
        <div className="fintech-page-actions">{actions}</div>
      </div>
    </div>
  );
}

