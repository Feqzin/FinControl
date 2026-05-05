import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type CartaoCardProps = {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  testId?: string;
};

export function CartaoCard({
  header,
  children,
  className = "",
  contentClassName = "",
  testId,
}: CartaoCardProps) {
  return (
    <Card className={`fintech-surface desktop-hover-lift ${className}`.trim()} data-testid={testId}>
      {header ? <CardHeader className="pb-2">{header}</CardHeader> : null}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

