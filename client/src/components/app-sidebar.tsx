import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useUIPreferences } from "@/context/ui-preferences";
import {
  LayoutDashboard, Users, Receipt, CreditCard, Calendar,
  BarChart3, Repeat, LogOut, FileUp, Target, History, Calculator,
  Sun, Moon, UserCircle, DollarSign, PiggyBank, Settings2, AlertCircle
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
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

const mainItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Pessoas", url: "/pessoas", icon: Users },
  { title: "Dívidas", url: "/dividas", icon: Receipt },
  { title: "Cartões", url: "/cartoes", icon: CreditCard },
  { title: "Renda", url: "/renda", icon: DollarSign },
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
  { title: "Importar", url: "/importar", icon: FileUp },
  { title: "Perfil", url: "/perfil", icon: UserCircle },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { prefs, togglePage } = useUIPreferences();

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
    { title: "Importar", url: "/importar" },
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
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2" size="sm" data-testid="button-personalizar">
              <Settings2 className="w-4 h-4" />
              <span>Personalizar</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gerenciar Telas</DialogTitle>
              <DialogDescription>Escolha quais telas deseja visualizar no menu lateral.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
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
            <div className="flex items-center gap-2 p-3 mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-xs font-medium">Ocultar uma tela não exclui seus dados.</p>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground truncate">{user?.username}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              data-testid="button-theme-toggle"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout.mutate()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
