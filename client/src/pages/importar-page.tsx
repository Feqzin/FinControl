import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function ImportarPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/dividas?importar=texto", { replace: true });
  }, [setLocation]);

  return (
    <div className="app-page-shell app-section-stack max-w-2xl" data-testid="importar-redirect-page">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Redirecionando importação</h1>
        <p className="text-sm text-muted-foreground">
          A importação por texto agora fica na aba Dívidas.
        </p>
      </div>
      <Skeleton className="h-24 w-full" />
      <p className="text-sm text-muted-foreground">
        Se não redirecionar automaticamente, use{" "}
        <Link href="/dividas?importar=texto" className="text-primary underline underline-offset-4">
          abrir em Dívidas
        </Link>
        .
      </p>
    </div>
  );
}

