import { useLocation, Link } from "wouter";
import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useUIPreferences, type UsageMode } from "@/context/ui-preferences";
import {
  LayoutDashboard, Users, Receipt, CreditCard, Calendar, CalendarDays,
  BarChart3, Repeat, LogOut, Target, History, Calculator,
  Sun, Moon, UserCircle, Wallet, PiggyBank, Settings2, AlertCircle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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
  { title: "Calendário", url: "/calendario", icon: CalendarDays },
  { title: "Previsão", url: "/previsao", icon: Calendar },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Simulador", url: "/simulador", icon: Calculator },
];

const ferramentasItems = [
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Perfil", url: "/perfil", icon: UserCircle },
];

const usageModeItems: ReadonlyArray<{ value: UsageMode; title: string; description: string }> = [
  { value: "essencial", title: "Essencial", description: "Simples, fonte maior e foco no básico." },
  { value: "guiado", title: "Guiado", description: "Equilíbrio com dicas contextuais." },
  { value: "completo", title: "Completo", description: "Todos os filtros e análises visíveis." },
  { value: "pro", title: "Pro", description: "Experiência avançada, foco total em produtividade." },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { prefs, togglePage, setUsageMode } = useUIPreferences();
  const [personalizarOpen, setPersonalizarOpen] = useState(false);
  const [showManagePages, setShowManagePages] = useState(false);

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
    { title: "Calendário", url: "/calendario" },
    { title: "Previsão", url: "/previsao" },
    { title: "Histórico", url: "/historico" },
    { title: "Simulador", url: "/simulador" },
    { title: "Relatórios", url: "/relatorios" },
  ];

  const usageModeSummary = prefs.usageMode === "essencial"
    ? "Modo Essencial ativo: foco em pagar, receber e saldo, com leitura facilitada."
    : prefs.usageMode === "guiado"
      ? "Modo Guiado ativo: interface equilibrada com dicas e contexto."
      : prefs.usageMode === "pro"
        ? "Modo Pro ativo: máxima visibilidade para análise avançada."
        : "Modo Completo ativo: todos os recursos e análises visíveis.";

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
              <DialogDescription>Ajuste rapidamente seu modo de uso, a biblioteca de ícones e o menu lateral.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <div className="fintech-surface-subtle space-y-3 rounded-xl border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Modo de uso</p>
                  <p className="text-xs text-muted-foreground">
                    Escolha como prefere navegar no FinControl. Essa preferência fica salva para sua conta neste dispositivo.
                  </p>
                </div>

                <Select
                  value={prefs.usageMode}
                  onValueChange={(value) => setUsageMode(value as UsageMode)}
                >
                  <SelectTrigger data-testid="select-usage-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {usageModeItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                  {usageModeSummary}
                </div>
              </div>

              <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                <IconPicker
                  mode="manage"
                  triggerLabel="Biblioteca de ícones"
                  triggerDescription="Upload, edição, exclusão e automação"
                  triggerTestId="button-open-global-icon-library"
                />
              </Suspense>

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
