import {
  BarChart3, CalendarDays, CreditCard, History,
  PiggyBank, Receipt, Repeat, Pencil, Check, X, Plus, Target, Users, Wallet, Calculator, Calendar, GripVertical,
} from "lucide-react";
import { useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUIPreferences } from "@/context/ui-preferences";
import { DASHBOARD_SHORTCUT_OPTIONS, MAX_DASHBOARD_SHORTCUTS, moveDashboardShortcut } from "@shared/dashboard-shortcuts";

const icons: Record<string, typeof Users> = {
  "/pessoas": Users, "/dividas": Receipt, "/cartoes": CreditCard, "/renda": Wallet,
  "/patrimonio": PiggyBank, "/servicos": Repeat, "/metas": Target,
  "/calendario": CalendarDays, "/previsao": Calendar, "/historico": History,
  "/simulador": Calculator, "/relatorios": BarChart3,
};

export function DashboardQuickActions({ onNavigate }: { onNavigate: (url: string) => void }) {
  const { prefs, setDashboardQuickActions, isEssentialMode } = useUIPreferences();
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<{ url: string; x: number; y: number; overUrl: string | null } | null>(null);

  const targetAt = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    return target?.closest<HTMLElement>("[data-quick-action-url]")?.dataset.quickActionUrl ?? null;
  };

  const onDragStart = (url: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ url, x: event.clientX, y: event.clientY, overUrl: null });
  };

  const onDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((current) => current && ({
      ...current, x: event.clientX, y: event.clientY, overUrl: targetAt(event),
    }));
  };

  const onDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const destination = targetAt(event);
    if (editing && drag && destination && drag.url !== destination) {
      setDashboardQuickActions(moveDashboardShortcut(prefs.dashboardQuickActions, drag.url, destination));
    }
    setDrag(null);
  };

  const onArrowKey = (url: string, event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
    if (!editing || !delta) return;
    event.preventDefault();
    const index = prefs.dashboardQuickActions.indexOf(url);
    const neighbor = prefs.dashboardQuickActions[index + delta];
    if (neighbor) setDashboardQuickActions(moveDashboardShortcut(prefs.dashboardQuickActions, url, neighbor));
  };

  return (
    <section aria-label="Atalhos do painel" data-testid="essencial-atalhos-uteis" onKeyDown={event => { if (event.key === "Escape") { setEditing(false); setDrag(null); } }}>
      <div className="mb-2 flex min-h-9 flex-wrap items-center justify-end gap-2">
        {editing && <p className="mr-auto text-xs text-muted-foreground">Arraste pelo ícone para organizar os atalhos.</p>}
        {editing && <Popover>
          <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={prefs.dashboardQuickActions.length >= MAX_DASHBOARD_SHORTCUTS}><Plus className="mr-1 h-4 w-4" />Adicionar atalho</Button></PopoverTrigger>
          <PopoverContent align="end" className="max-h-[60dvh] w-64 overflow-y-auto rounded-xl p-2">
            <p className="px-2 py-2 text-xs text-muted-foreground">Escolha até {MAX_DASHBOARD_SHORTCUTS} atalhos.</p>
            {DASHBOARD_SHORTCUT_OPTIONS.filter(option => !prefs.dashboardQuickActions.includes(option.url)).map(option => <Button key={option.url} type="button" variant="ghost" className="w-full justify-start" disabled={prefs.dashboardQuickActions.length >= MAX_DASHBOARD_SHORTCUTS} onClick={() => setDashboardQuickActions([...prefs.dashboardQuickActions, option.url])}>{option.title}</Button>)}
          </PopoverContent>
        </Popover>}
        <Button type="button" variant={editing ? "outline" : "ghost"} size={editing ? "sm" : "icon"} className="rounded-xl" data-testid="button-customize-quick-actions" aria-label={editing ? "Concluir edição dos atalhos" : "Editar atalhos"} title={editing ? "Concluir edição" : "Editar atalhos"} aria-pressed={editing} onClick={() => { setEditing(value => !value); setDrag(null); }}>
          {editing ? <><Check className="mr-1 h-4 w-4" />Concluir</> : <Pencil className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {prefs.dashboardQuickActions.map((url) => {
          const action = DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url);
          if (!action) return null;
          const Icon = icons[url];
          return (
            <div key={url} data-quick-action-url={url}
              className={`relative rounded-xl border bg-card transition-colors ${isEssentialMode ? "essential-surface" : ""} ${drag?.overUrl === url && drag.url !== url ? "border-primary ring-2 ring-primary/50" : "border-border"} ${drag?.url === url ? "opacity-50" : ""}`}>
              <Button type="button" variant="ghost"
                className={`h-auto min-h-16 w-full flex-col gap-2 rounded-xl ${editing ? "px-10" : "px-4"} py-4 text-center ${isEssentialMode ? "essential-shortcut" : ""}`}
                onClick={() => { if (!editing) onNavigate(url); }} aria-disabled={editing} tabIndex={editing ? -1 : 0} data-testid={`quick-action-${url.slice(1)}`}>
                <span className={isEssentialMode ? "essential-icon" : ""}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="text-sm font-medium">{action.title}</span>
              </Button>
              {editing && <button type="button"
                className="absolute left-0 top-0 flex h-full w-10 cursor-grab touch-none items-center justify-center rounded-l-xl text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Arrastar ${action.title} para reordenar. Use as setas do teclado.`}
                onPointerDown={(event) => onDragStart(url, event)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => onArrowKey(url, event)}>
                <GripVertical className="h-5 w-5" aria-hidden="true" />
              </button>}
              {editing && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive" aria-label={`Remover atalho ${action.title}`} title={`Remover ${action.title}`} onClick={() => setDashboardQuickActions(prefs.dashboardQuickActions.filter(item => item !== url))}><X className="h-4 w-4" /></Button>}
            </div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">Ordem atual: {prefs.dashboardQuickActions.map((url) => DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url)?.title).join(", ")}</p>
      {drag && (
        <div className="pointer-events-none fixed z-[100] rounded-lg border border-primary bg-card px-4 py-2 text-sm font-medium shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden="true">
          {DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === drag.url)?.title}
        </div>
      )}
    </section>
  );
}
