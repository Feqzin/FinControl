import {
  BarChart3, CalendarDays, ChevronDown, ChevronUp, CreditCard, History,
  PiggyBank, Plus, Receipt, Repeat, Settings2, Target, Users, Wallet, X, Calculator, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUIPreferences } from "@/context/ui-preferences";
import { DASHBOARD_SHORTCUT_OPTIONS, MAX_DASHBOARD_SHORTCUTS } from "@shared/dashboard-shortcuts";

const icons: Record<string, typeof Users> = {
  "/pessoas": Users, "/dividas": Receipt, "/cartoes": CreditCard, "/renda": Wallet,
  "/patrimonio": PiggyBank, "/servicos": Repeat, "/metas": Target,
  "/calendario": CalendarDays, "/previsao": Calendar, "/historico": History,
  "/simulador": Calculator, "/relatorios": BarChart3,
};

export function DashboardShortcutSettings({ compact = false }: { compact?: boolean }) {
  const { prefs, setDashboardQuickActions, shortcutsSyncStatus } = useUIPreferences();
  const selected = prefs.dashboardQuickActions;
  const available = DASHBOARD_SHORTCUT_OPTIONS.filter(({ url }) => !selected.includes(url));

  const move = (index: number, direction: number) => {
    const next = [...selected];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setDashboardQuickActions(next);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size={compact ? "icon" : "default"}
          aria-label="Personalizar atalhos" data-testid="button-customize-quick-actions">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {!compact && <span className="ml-2">Personalizar atalhos</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos do Painel</DialogTitle>
          <DialogDescription>Escolha até {MAX_DASHBOARD_SHORTCUTS} áreas. Remova todos para ocultar os atalhos do Painel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {selected.map((url, index) => {
            const option = DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url);
            if (!option) return null;
            return (
              <div key={url} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{option.title}</span>
                <Button type="button" variant="ghost" size="icon" disabled={index === 0}
                  aria-label={`Mover ${option.title} para cima`} onClick={() => move(index, -1)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={index === selected.length - 1}
                  aria-label={`Mover ${option.title} para baixo`} onClick={() => move(index, 1)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${option.title}`}
                  onClick={() => setDashboardQuickActions(selected.filter((item) => item !== url))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {selected.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atalho no Painel.</p>}
        </div>
        {selected.length < MAX_DASHBOARD_SHORTCUTS && available.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Adicionar</p>
            <div className="flex flex-wrap gap-2">
              {available.map(({ title, url }) => (
                <Button key={url} type="button" variant="outline" size="sm"
                  onClick={() => setDashboardQuickActions([...selected, url])}>
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{title}
                </Button>
              ))}
            </div>
          </div>
        )}
        <p role="status" className="text-xs text-muted-foreground">
          {shortcutsSyncStatus === "loading" ? "Salvando na sua conta…"
            : shortcutsSyncStatus === "error" ? "Sem conexão com a conta. Os atalhos estão salvos neste navegador; altere um atalho para tentar novamente."
              : "Salvo na sua conta."}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardQuickActions({ onNavigate }: { onNavigate: (url: string) => void }) {
  const { prefs } = useUIPreferences();
  if (prefs.dashboardQuickActions.length === 0) return null;

  return (
    <section aria-label="Acesso rápido" data-testid="essencial-atalhos-uteis">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Acesso rápido</h2>
        <DashboardShortcutSettings compact />
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
