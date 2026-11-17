import { useLocation, Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useUIPreferences } from "@/context/ui-preferences";
import {
  LayoutDashboard, Users, Receipt, CreditCard, Calendar, CalendarDays,
  BarChart3, Repeat, LogOut, Target, History, Calculator,
  Sun, Moon, UserCircle, Wallet, PiggyBank, Settings2, ChevronDown, LayoutGrid,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

const essentialMainUrls = new Set(["/", "/dividas", "/cartoes"]);

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { prefs, isEssentialMode } = useUIPreferences();
  const [moreOpen, setMoreOpen] = useState(false);

  const filteredMainItems = mainItems.filter(item => item.url === "/" || !prefs.hiddenPages.includes(item.url));
  const filteredPlanejamentoItems = planejamentoItems.filter(item => !prefs.hiddenPages.includes(item.url));
  const filteredFerramentasItems = ferramentasItems.filter(item => item.url === "/perfil" || !prefs.hiddenPages.includes(item.url));
  const essentialMainItems = filteredMainItems.filter(item => essentialMainUrls.has(item.url));
  const extraMainItems = filteredMainItems.filter(item => !essentialMainUrls.has(item.url));
  const extraToolsItems = filteredFerramentasItems.filter(item => item.url !== "/perfil");
  const profileItems = filteredFerramentasItems.filter(item => item.url === "/perfil");
  const hasMoreItems = extraMainItems.length + filteredPlanejamentoItems.length + extraToolsItems.length > 0;
  const isMorePageActive = [...extraMainItems, ...filteredPlanejamentoItems, ...extraToolsItems]
    .some(item => item.url === location);

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
        {isEssentialMode ? (
          <>
            {renderGroup("Principal", essentialMainItems)}
            {hasMoreItems && (
              <Collapsible open={moreOpen || isMorePageActive} onOpenChange={setMoreOpen}>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton data-testid="nav-more-resources" aria-label="Mais recursos">
                            <LayoutGrid className="w-4 h-4" />
                            <span>Mais recursos</span>
                            <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${moreOpen || isMorePageActive ? "rotate-180" : ""}`} />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                <CollapsibleContent>
                  {renderGroup("Outras áreas", extraMainItems)}
                  {renderGroup("Planejamento", filteredPlanejamentoItems)}
                  {renderGroup("Ferramentas", extraToolsItems)}
                </CollapsibleContent>
              </Collapsible>
            )}
            {renderGroup("Conta", profileItems)}
          </>
        ) : (
          <>
            {renderGroup("Geral", filteredMainItems)}
            {renderGroup("Planejamento", filteredPlanejamentoItems)}
            {renderGroup("Ferramentas", filteredFerramentasItems)}
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        <Button asChild variant="outline" className="w-full justify-start gap-2" size="sm" data-testid="button-personalizar">
          <Link href="/perfil?aba=personalizacao">
            <Settings2 className="w-4 h-4" />
            <span>Personalizar</span>
          </Link>
        </Button>

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
