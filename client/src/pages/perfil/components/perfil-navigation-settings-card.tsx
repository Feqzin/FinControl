import { lazy, Suspense, useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useUIPreferences, type UsageMode } from "@/context/ui-preferences";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const usageModeItems: ReadonlyArray<{ value: UsageMode; title: string; description: string }> = [
  { value: "essencial", title: "Essencial", description: "Foco no básico, com fonte maior." },
  { value: "guiado", title: "Guiado", description: "Dicas contextuais quando úteis." },
  { value: "completo", title: "Completo", description: "Mais filtros e análises visíveis." },
  { value: "pro", title: "Pro", description: "Visão avançada para uso frequente." },
];

const manageablePages = [
  { title: "Pessoas", url: "/pessoas" }, { title: "Dívidas", url: "/dividas" },
  { title: "Cartões", url: "/cartoes" }, { title: "Renda", url: "/renda" },
  { title: "Patrimônio", url: "/patrimonio" }, { title: "Serviços", url: "/servicos" },
  { title: "Metas", url: "/metas" }, { title: "Calendário", url: "/calendario" },
  { title: "Previsão", url: "/previsao" }, { title: "Histórico", url: "/historico" },
  { title: "Simulador", url: "/simulador" }, { title: "Relatórios", url: "/relatorios" },
];

export function PerfilNavigationSettingsCard() {
  const { prefs, togglePage, setUsageMode } = useUIPreferences();
  const [pagesOpen, setPagesOpen] = useState(false);
  const currentMode = usageModeItems.find((item) => item.value === prefs.usageMode);

  return (
    <Card className="fintech-surface" data-testid="perfil-personalizar-navegacao">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Navegação</CardTitle>
        <p className="text-sm text-muted-foreground">Ajuste quanto conteúdo aparece no menu.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="select-usage-mode" className="text-sm font-medium">Modo de uso</label>
          <Select value={prefs.usageMode} onValueChange={(value) => setUsageMode(value as UsageMode)}>
            <SelectTrigger id="select-usage-mode" data-testid="select-usage-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              {usageModeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{currentMode?.description} Salvo neste dispositivo.</p>
        </div>

        <Collapsible open={pagesOpen} onOpenChange={setPagesOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between" data-testid="button-toggle-manage-pages">
              Telas do menu
              <ChevronDown className={`h-4 w-4 transition-transform ${pagesOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-3">
            <p className="text-xs text-muted-foreground">Oculte do menu as áreas que você não usa. Os dados continuam salvos.</p>
            <div className="rounded-lg border px-3">
              {manageablePages.map((page) => (
                <div key={page.url} className="flex min-h-11 items-center justify-between gap-3 border-b py-2 last:border-b-0">
                  <label htmlFor={`page-${page.url.slice(1)}`} className="flex-1 text-sm">{page.title}</label>
                  <Switch id={`page-${page.url.slice(1)}`}
                    checked={!prefs.hiddenPages.includes(page.url)}
                    onCheckedChange={() => togglePage(page.url)}
                    aria-label={`Mostrar ${page.title} no menu`} />
                </div>
              ))}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> Ocultar uma área não exclui seus dados.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <div className="border-t pt-4">
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <IconPicker mode="manage" triggerLabel="Biblioteca de ícones"
              triggerDescription="Upload, edição e exclusão"
              triggerTestId="button-open-global-icon-library" />
          </Suspense>
        </div>
      </CardContent>
    </Card>
  );
}
