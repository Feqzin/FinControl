import { useLocation, Link } from "wouter";
import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useUIPreferences, type UsageMode } from "@/context/ui-preferences";
import {
  LayoutDashboard, Users, Receipt, CreditCard, Calendar,
  BarChart3, Repeat, LogOut, Target, History, Calculator,
  Sun, Moon, UserCircle, Wallet, PiggyBank, Settings2, AlertCircle,
  ChevronDown, Check, Sparkles,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const mainItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Pessoas", url: "/pessoas", icon: Users },
  { title: "Dívidas", url: "/dividas", icon: Receipt },
  { title: "Cartões", url: "/cartoes", icon: CreditCard },
  { title: "Renda", url: "/renda", icon: Wallet },
  { title: "Patrimônio", url: "/patrimonio", icon: PiggyBank },
  { title: "Serviços", url: "/servicos", icon: Repeat },
];

const planejamentoItems = [
  { title: "Metas", url: "/metas", icon: Target },
  { title: "Previsão", url: "/previsao", icon: Calendar },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Simulador", url: "/simulador", icon: Calculator },
];

const ferramentasItems = [
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Perfil", url: "/perfil", icon: UserCircle },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { prefs, togglePage, setUsageMode } = useUIPreferences();
  const [personalizarOpen, setPersonalizarOpen] = useState(false);
  const [showManagePages, setShowManagePages] = useState(false);
  const [showUsageMode, setShowUsageMode] = useState(false);

  const usageModeItems: ReadonlyArray<{ value: UsageMode; title: string; description: string }> = [
    { value: "essencial", title: "Essencial", description: "Simples, fonte maior e foco no básico." },
    { value: "guiado", title: "Guiado", description: "Equilíbrio com dicas contextuais." },
    { value: "completo", title: "Completo", description: "Todos os filtros e análises visíveis." },
    { value: "pro", title: "Pro", description: "Experiência avançada, foco total em produtividade." },
  ];

  const usageModeSummary = {
    essencial: "Modo Essencial ativo: foco em pagar, receber e saldo, com leitura facilitada.",
    guiado: "Modo Guiado ativo: interface equilibrada com dicas e contexto.",
    completo: "Modo Completo ativo: todos os recursos e análises visíveis.",
    pro: "Modo Pro ativo: máxima visibilidade para análise avançada.",
  } satisfies Record<UsageMode, string>;

  const filteredMainItems = mainItems.filter(item => item.url === "/" || !prefs.hiddenPages.includes(item.url));
  const filteredPlanejamentoItems = planejamentoItems.filter(item => !prefs.hiddenPages.includes(item.url));
  const filteredFerramentasItems = ferramentasItems.filter(item => item.url === "/perfil" || !prefs.hiddenPages.includes(item.url));

  const allManageablePages = [
    { title: "Pessoas", url: "/pessoas" },
    { title: "Dívidas", url: "/dividas" },
    { title: "Cartões", url: "/cartoes" },
    { title: "Renda", url: "/renda" },
    { title: "Patrimônio", url: "/patrimonio" },
    { title: "Serviços", url: "/servicos" },
    { title: "Metas", url: "/metas" },
    { title: "Previsão", url: "/previsao" },
    { title: "Histórico", url: "/historico" },
    { title: "Simulador", url: "/simulador" },
    { title: "Relatórios", url: "/relatorios" },
  ];

  const renderGroup = (label: string, items: typeof mainItems) => {
    if (items.length === 0) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={location === item.url}
                  data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}
                >
                  <Link href={item.url}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const handlePersonalizarOpenChange = (open: boolean) => {
    setPersonalizarOpen(open);
    if (!open) {
      setShowManagePages(false);
      setShowUsageMode(false);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Receipt className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">FinControl</span>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        {renderGroup("Geral", filteredMainItems)}
        {renderGroup("Planejamento", filteredPlanejamentoItems)}
        {renderGroup("Ferramentas", filteredFerramentasItems)}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        <Dialog open={personalizarOpen} onOpenChange={handlePersonalizarOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" data-testid="button-personalizar">
              <Settings2 className="w-4 h-4" />
              <span>Personalizar</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Personalizar</DialogTitle>
              <DialogDescription>Ajuste rapidamente sua biblioteca, seu modo de uso e o menu lateral.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                <IconPicker
                  mode="manage"
                  triggerLabel="Biblioteca de ícones"
                  triggerDescription="Upload, edição, exclusão e automação"
                  triggerTestId="button-open-global-icon-library"
                />
              </Suspense>

              <Collapsible open={showUsageMode} onOpenChange={setShowUsageMode}>
                <div className="rounded-xl border border-border/60 bg-background/85 shadow-sm">
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex h-auto w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-accent/60"
                      data-testid="button-toggle-usage-mode"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span>Modo de uso</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {usageModeSummary[prefs.usageMode]}
                        </p>
                      </div>
                      <ChevronDown
                        className={`mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${showUsageMode ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="border-t border-border/60 px-4 py-4">
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Escolha como prefere navegar no FinControl. Esta preferência continua salva para este usuário neste dispositivo.
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {usageModeItems.map((item) => {
                          const isSelected = prefs.usageMode === item.value;
                          return (
                            <Button
                              key={item.value}
                              type="button"
                              variant="ghost"
                              aria-pressed={isSelected}
                              className={`h-auto min-h-[92px] flex-col items-start justify-start gap-2 rounded-xl border px-4 py-3 text-left whitespace-normal ${
                                isSelected
                                  ? "border-primary/40 bg-primary/8 text-foreground hover:bg-primary/10"
                                  : "border-border/60 bg-muted/10 text-foreground hover:bg-accent/60"
                              }`}
                              onClick={() => setUsageMode(item.value)}
                              data-testid={`button-usage-mode-${item.value}`}
                            >
                              <div className="flex w-full items-center justify-between gap-3">
                                <span className="text-sm font-semibold">{item.title}</span>
                                {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                              </div>
                              <span className="text-xs text-muted-foreground">{item.description}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowManagePages((current) => !current)}
                data-testid="button-toggle-manage-pages"
              >
                {showManagePages ? "Ocultar gestão de telas" : "Gerenciar telas do menu"}
              </Button>
            </div>

            {showManagePages ? (
              <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-2">
                {allManageablePages.map((page) => (
                  <div key={page.url} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg transition-colors">
                    <span className="text-sm font-medium">{page.title}</span>
                    <Switch
                      checked={!prefs.hiddenPages.includes(page.url)}
                      onCheckedChange={() => togglePage(page.url)}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {showManagePages ? (
              <div className="flex items-center gap-2 p-3 mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs font-medium">Ocultar uma tela não exclui seus dados.</p>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground truncate">{user?.username ? `@${user.username}` : "Usuário"}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              data-testid="button-theme-toggle"
              aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout.mutate()}
              data-testid="button-logout"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
