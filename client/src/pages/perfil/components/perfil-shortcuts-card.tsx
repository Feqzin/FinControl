import { useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUIPreferences } from "@/context/ui-preferences";
import { DASHBOARD_SHORTCUT_OPTIONS, MAX_DASHBOARD_SHORTCUTS } from "@shared/dashboard-shortcuts";

type DragState = { url: string; x: number; y: number; overUrl: string | null };

export function PerfilShortcutsCard() {
  const { prefs, setDashboardQuickActions, shortcutsSyncStatus } = useUIPreferences();
  const selected = prefs.dashboardQuickActions;
  const available = DASHBOARD_SHORTCUT_OPTIONS.filter(({ url }) => !selected.includes(url));
  const [drag, setDrag] = useState<DragState | null>(null);

  const moveTo = (fromUrl: string, toUrl: string) => {
    if (fromUrl === toUrl) return;
    const from = selected.indexOf(fromUrl);
    const to = selected.indexOf(toUrl);
    if (from < 0 || to < 0) return;
    const next = [...selected];
    next.splice(from, 1);
    next.splice(to, 0, fromUrl);
    setDashboardQuickActions(next);
  };

  const targetAt = (event: ReactPointerEvent<HTMLElement>) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    return target?.closest<HTMLElement>("[data-shortcut-url]")?.dataset.shortcutUrl ?? null;
  };

  const startDrag = (url: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ url, x: event.clientX, y: event.clientY, overUrl: null });
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((current) => current && ({
      ...current,
      x: event.clientX,
      y: event.clientY,
      overUrl: targetAt(event),
    }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag) {
      const destination = targetAt(event);
      if (destination) moveTo(drag.url, destination);
    }
    setDrag(null);
  };

  const handleArrow = (url: string, event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const index = selected.indexOf(url);
    if (index + direction >= 0 && index + direction < selected.length) {
      moveTo(url, selected[index + direction]);
    }
  };

  return (
    <Card className="fintech-surface" data-testid="perfil-personalizar-atalhos">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atalhos do Painel</CardTitle>
        <p className="text-sm text-muted-foreground">
          Segure e arraste um atalho para outra posição. Use o X para retirar da tela inicial.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2" aria-label="Ordem dos atalhos">
          {selected.map((url) => {
            const option = DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url);
            if (!option) return null;
            return (
              <div key={url} data-shortcut-url={url}
                className={`flex items-center gap-2 rounded-xl border bg-card p-2 transition-colors ${drag?.overUrl === url && drag.url !== url ? "border-primary ring-2 ring-primary/50" : "border-border"} ${drag?.url === url ? "opacity-50" : ""}`}>
                <button type="button"
                  className="flex min-h-11 min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-3 rounded-lg px-2 text-left text-sm font-medium active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Arrastar ${option.title} para reordenar. Use as setas para cima e para baixo no teclado.`}
                  onPointerDown={(event) => startDrag(url, event)}
                  onPointerMove={continueDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(event) => handleArrow(url, event)}>
                  <GripVertical className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>{option.title}</span>
                </button>
                <Button type="button" variant="ghost" size="icon"
                  aria-label={`Remover ${option.title} dos atalhos`}
                  onClick={() => setDashboardQuickActions(selected.filter((item) => item !== url))}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {selected.length === 0 && (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum atalho no Painel. Adicione uma área abaixo quando quiser.
            </p>
          )}
        </div>

        {selected.length < MAX_DASHBOARD_SHORTCUTS && available.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Adicionar atalho <span className="font-normal text-muted-foreground">({selected.length}/{MAX_DASHBOARD_SHORTCUTS})</span></p>
            <div className="flex flex-wrap gap-2">
              {available.map(({ title, url }) => (
                <Button key={url} type="button" variant="outline" size="sm"
                  onClick={() => setDashboardQuickActions([...selected, url])}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{title}
                </Button>
              ))}
            </div>
          </div>
        )}

        <p role="status" className="text-xs text-muted-foreground">
          {shortcutsSyncStatus === "loading" ? "Salvando na sua conta…"
            : shortcutsSyncStatus === "error" ? "Sem conexão com a conta. A escolha ficou salva neste navegador; altere um atalho para tentar novamente."
              : "Ordem e escolhas salvas na sua conta."}
        </p>
        <p className="sr-only" aria-live="polite">Ordem atual: {selected.map((url) => DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url)?.title).join(", ")}</p>
      </CardContent>
      {drag && (
        <div className="pointer-events-none fixed z-[100] rounded-lg border border-primary bg-card px-4 py-2 text-sm font-medium shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden="true">
          {DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === drag.url)?.title}
        </div>
      )}
    </Card>
  );
}
