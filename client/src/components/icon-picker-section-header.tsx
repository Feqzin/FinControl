import type { ReactNode } from "react";

type IconPickerSectionHeaderProps = {
  children: ReactNode;
  className?: string;
};

export function IconPickerSectionHeader({
  children,
  className,
}: IconPickerSectionHeaderProps) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground${className ? ` ${className}` : ""}`}>
      {children}
    </p>
  );
}
