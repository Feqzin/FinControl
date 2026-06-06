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
      rowClassName="items-start gap-4 xl:flex-col 2xl:flex-row 2xl:items-start"
      contentClassName="space-y-2"
      titleClassName="sm:text-[2rem]"
      actionsClassName="w-full 2xl:w-auto"
      actions={actions}
    />
  );
}
