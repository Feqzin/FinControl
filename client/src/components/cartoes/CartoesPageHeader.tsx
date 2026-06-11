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
      className="rounded-[24px] px-4 py-4 sm:px-5 sm:py-5"
      title={title}
      subtitle={subtitle}
      rowClassName="gap-3 xl:items-center"
      contentClassName="space-y-1.5"
      titleClassName="text-[1.7rem] sm:text-[1.95rem]"
      subtitleClassName="max-w-xl text-sm leading-5 sm:text-[15px]"
      actionsClassName="w-full md:w-auto"
      actions={actions}
    />
  );
}
