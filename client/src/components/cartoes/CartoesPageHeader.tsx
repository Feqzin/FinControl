import type { ReactNode } from "react";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";

type CartoesPageHeaderProps = {
  title: string;
  subtitle: string;
  actions: ReactNode;
};

export function CartoesPageHeader({ title, subtitle, actions }: CartoesPageHeaderProps) {
  return (
    <FintechPageHeader
      title={title}
      subtitle={subtitle}
      actions={actions}
    />
  );
}
