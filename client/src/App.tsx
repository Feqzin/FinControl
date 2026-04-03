import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeProvider } from "@/components/theme-provider";
import { LayoutDashboard, Receipt, CreditCard, DollarSign, PiggyBank, Eye, EyeOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ValuesVisibilityProvider, useValuesVisibility } from "@/context/values-visibility";
import { UIPreferencesProvider } from "@/context/ui-preferences";
import { Button } from "@/components/ui/button";
import { useEffect, lazy, Suspense } from "react";

import { OnboardingTour } from "@/components/onboarding-tour";

const NotFoundPage = lazy(() => import("@/pages/not-found"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const PessoasPage = lazy(() => import("@/pages/pessoas-page"));
const DividasPage = lazy(() => import("@/pages/dividas-page"));
const CartoesPage = lazy(() => import("@/pages/cartoes-page"));
const PrevisaoPage = lazy(() => import("@/pages/previsao-page"));
const ServicosPage = lazy(() => import("@/pages/servicos-page"));
const RelatoriosPage = lazy(() => import("@/pages/relatorios-page"));
const ImportarPage = lazy(() => import("@/pages/importar-page"));
const MetasPage = lazy(() => import("@/pages/metas-page"));
const HistoricoPage = lazy(() => import("@/pages/historico-page"));
const SimuladorPage = lazy(() => import("@/pages/simulador-page"));
const RendaPage = lazy(() => import("@/pages/renda-page"));
const PatrimonioPage = lazy(() => import("@/pages/patrimonio-page"));
const PerfilPage = lazy(() => import("@/pages/perfil-page"));
const RedefinirSenhaPage = lazy(() => import("@/pages/redefinir-senha-page"));

function RouteLoadingFallback() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function FullscreenLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4 text-center">
        <Skeleton className="h-12 w-12 rounded-md mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/">
          <DashboardPage />
        </Route>
        <Route path="/pessoas">
          <PessoasPage />
        </Route>
        <Route path="/dividas">
          <DividasPage />
        </Route>
        <Route path="/cartoes">
          <CartoesPage />
        </Route>
        <Route path="/previsao">
          <PrevisaoPage />
        </Route>
        <Route path="/servicos">
          <ServicosPage />
        </Route>
        <Route path="/relatorios">
          <RelatoriosPage />
        </Route>
        <Route path="/importar">
          <ImportarPage />
        </Route>
        <Route path="/metas">
          <MetasPage />
        </Route>
        <Route path="/historico">
          <HistoricoPage />
        </Route>
        <Route path="/simulador">
          <SimuladorPage />
        </Route>
        <Route path="/renda">
          <RendaPage />
        </Route>
        <Route path="/patrimonio">
          <PatrimonioPage />
        </Route>
        <Route path="/perfil">
          <PerfilPage />
        </Route>
        <Route>
          <NotFoundPage />
        </Route>
      </Switch>
    </Suspense>
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
          <main className="flex-1 overflow-y-auto overscroll-contain">
            <Router />
          </main>
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
  const [location, setLocation] = useLocation();
  const isResetPage = location === "/redefinir-senha";
  const isAuthPage = location === "/auth";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuthPage && !isResetPage) {
      setLocation("/auth");
      return;
    }
    if (!isLoading && isAuthenticated && (isAuthPage || isResetPage)) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, isAuthPage, isResetPage, setLocation]);

  if (isLoading) {
    return <FullscreenLoadingFallback />;
  }

  if (isResetPage && !isAuthenticated) {
    return (
      <Suspense fallback={<FullscreenLoadingFallback />}>
        <RedefinirSenhaPage />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<FullscreenLoadingFallback />}>
        <AuthPage />
      </Suspense>
    );
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
