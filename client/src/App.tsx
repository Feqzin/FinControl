import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import PessoasPage from "@/pages/pessoas-page";
import DividasPage from "@/pages/dividas-page";
import CartoesPage from "@/pages/cartoes-page";
import PrevisaoPage from "@/pages/previsao-page";
import ServicosPage from "@/pages/servicos-page";
import RelatoriosPage from "@/pages/relatorios-page";
import ImportarPage from "@/pages/importar-page";
import MetasPage from "@/pages/metas-page";
import HistoricoPage from "@/pages/historico-page";
import SimuladorPage from "@/pages/simulador-page";
import RendaPage from "@/pages/renda-page";
import PatrimonioPage from "@/pages/patrimonio-page";
import PerfilPage from "@/pages/perfil-page";
import RedefinirSenhaPage from "@/pages/redefinir-senha-page";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeProvider } from "@/components/theme-provider";
import { LayoutDashboard, Receipt, CreditCard, DollarSign, PiggyBank, Eye, EyeOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ValuesVisibilityProvider, useValuesVisibility } from "@/context/values-visibility";
import { UIPreferencesProvider } from "@/context/ui-preferences";
import { Button } from "@/components/ui/button";

import { OnboardingTour } from "@/components/onboarding-tour";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/pessoas" component={PessoasPage} />
      <Route path="/dividas" component={DividasPage} />
      <Route path="/cartoes" component={CartoesPage} />
      <Route path="/previsao" component={PrevisaoPage} />
      <Route path="/servicos" component={ServicosPage} />
      <Route path="/relatorios" component={RelatoriosPage} />
      <Route path="/importar" component={ImportarPage} />
      <Route path="/metas" component={MetasPage} />
      <Route path="/historico" component={HistoricoPage} />
      <Route path="/simulador" component={SimuladorPage} />
      <Route path="/renda" component={RendaPage} />
      <Route path="/patrimonio" component={PatrimonioPage} />
      <Route path="/perfil" component={PerfilPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function EyeToggle() {
  const { visible, toggle } = useValuesVisibility();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      data-testid="button-toggle-visibility"
      title={visible ? "Ocultar valores" : "Mostrar valores"}
      className="transition-all duration-200"
    >
      {visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
    </Button>
  );
}

function AuthenticatedLayout() {
  const [location] = useLocation();
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const navItems = [
    { label: "Painel", icon: LayoutDashboard, path: "/" },
    { label: "Dívidas", icon: Receipt, path: "/dividas" },
    { label: "Cartões", icon: CreditCard, path: "/cartoes" },
    { label: "Renda", icon: DollarSign, path: "/renda" },
    { label: "Patrimônio", icon: PiggyBank, path: "/patrimonio" },
  ];

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 pb-16 md:pb-0">
          <header className="flex items-center justify-between gap-2 p-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <EyeToggle />
          </header>
          <ScrollArea className="flex-1">
            <Router />
          </ScrollArea>
          <OnboardingTour />

          <nav className="fixed bottom-0 left-0 right-0 md:hidden border-t bg-background z-40 flex h-16 items-center justify-around px-2">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path} className={`flex flex-col items-center gap-1 p-2 min-w-0 flex-1 ${location === item.path ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className="text-[10px] font-medium truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const isResetPage = window.location.pathname === "/redefinir-senha";

  if (isResetPage) {
    return <RedefinirSenhaPage />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <UIPreferencesProvider>
          <ValuesVisibilityProvider>
            <TooltipProvider>
              <Toaster />
              <AppContent />
            </TooltipProvider>
          </ValuesVisibilityProvider>
        </UIPreferencesProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
