import { Repeat, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { title: "Pessoas", url: "/pessoas", icon: Users, testId: "quick-action-pessoas" },
  { title: "Renda", url: "/renda", icon: Wallet, testId: "quick-action-renda" },
  { title: "Serviços", url: "/servicos", icon: Repeat, testId: "quick-action-servicos" },
];

export function DashboardQuickActions({
  hiddenPages,
  onNavigate,
}: {
  hiddenPages: string[];
  onNavigate: (url: string) => void;
}) {
  const visibleActions = actions.filter((action) => !hiddenPages.includes(action.url));
  if (visibleActions.length === 0) return null;

  return (
    <section aria-label="Acesso rápido" data-testid="essencial-atalhos-uteis">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Acesso rápido</h2>
      <div className="grid grid-cols-3 gap-2">
        {visibleActions.map((action) => (
          <Button
            key={action.url}
            type="button"
            variant="outline"
            className="h-auto min-h-16 flex-col gap-1.5 rounded-xl px-2 py-3 text-center"
            onClick={() => onNavigate(action.url)}
            data-testid={action.testId}
          >
            <action.icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs sm:text-sm">{action.title}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
