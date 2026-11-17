import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUIPreferences } from "@/context/ui-preferences";
import { DASHBOARD_SHORTCUT_OPTIONS, MAX_DASHBOARD_SHORTCUTS } from "@shared/dashboard-shortcuts";

export function PerfilShortcutsCard() {
  const { prefs, setDashboardQuickActions, shortcutsSyncStatus } = useUIPreferences();
  const selected = prefs.dashboardQuickActions;
  const available = DASHBOARD_SHORTCUT_OPTIONS.filter(({ url }) => !selected.includes(url));
  return (
    <Card className="fintech-surface" data-testid="perfil-personalizar-atalhos">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atalhos do Painel</CardTitle>
        <p className="text-sm text-muted-foreground">
          Escolha quais atalhos aparecem no Painel. Para mudar a ordem, arraste os botões na tela inicial.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2" aria-label="Atalhos selecionados">
          {selected.map((url) => {
            const option = DASHBOARD_SHORTCUT_OPTIONS.find((item) => item.url === url);
            if (!option) return null;
            return (
              <div key={url} className="flex min-h-14 items-center gap-2 rounded-xl border bg-card px-4 py-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{option.title}</span>
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
            <Select value="" onValueChange={(url) => setDashboardQuickActions([...selected, url])}>
              <SelectTrigger aria-label="Escolher atalho para adicionar"><SelectValue placeholder="Escolher área..." /></SelectTrigger>
              <SelectContent>
                {available.map(({ title, url }) => <SelectItem key={url} value={url}>{title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <p role="status" className="text-xs text-muted-foreground">
          {shortcutsSyncStatus === "loading" ? "Salvando na sua conta…"
            : shortcutsSyncStatus === "error" ? "Sem conexão com a conta. A escolha ficou salva neste navegador; altere um atalho para tentar novamente."
              : "Escolhas salvas na sua conta."}
        </p>
      </CardContent>
    </Card>
  );
}
