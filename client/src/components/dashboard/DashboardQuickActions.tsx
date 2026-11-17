import {
  BarChart3, CalendarDays, CreditCard, History,
  PiggyBank, Receipt, Repeat, Settings2, Target, Users, Wallet, Calculator, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useUIPreferences } from "@/context/ui-preferences";
import { DASHBOARD_SHORTCUT_OPTIONS } from "@shared/dashboard-shortcuts";

const icons: Record<string, typeof Users> = {
  "/pessoas": Users, "/dividas": Receipt, "/cartoes": CreditCard, "/renda": Wallet,
  "/patrimonio": PiggyBank, "/servicos": Repeat, "/metas": Target,
  "/calendario": CalendarDays, "/previsao": Calendar, "/historico": History,
  "/simulador": Calculator, "/relatorios": BarChart3,
};

export function DashboardQuickActions({ onNavigate }: { onNavigate: (url: string) => void }) {
  const { prefs } = useUIPreferences();
  if (prefs.dashboardQuickActions.length === 0) return null;

  return (
    <section aria-label="Acesso rápido" data-testid="essencial-atalhos-uteis">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Acesso rápido</h2>
        <Button asChild type="button" variant="ghost" size="icon" data-testid="button-customize-quick-actions">
          <Link href="/perfil?aba=personalizacao" aria-label="Personalizar atalhos no Perfil" title="Personalizar atalhos no Perfil">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {prefs.dashboardQuickActions.map((url) => {
          const action = DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url);
          if (!action) return null;
          const Icon = icons[url];
          return (
            <Button key={url} type="button" variant="outline"
              className="h-auto min-h-16 flex-col gap-1.5 rounded-xl px-2 py-3 text-center"
              onClick={() => onNavigate(url)} data-testid={`quick-action-${url.slice(1)}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs sm:text-sm">{action.title}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
