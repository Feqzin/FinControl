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
import { LayoutDashboard, Receipt, CreditCard, Wallet, PiggyBank, Eye, EyeOff, AlertCircle, RefreshCcw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ValuesVisibilityProvider, useValuesVisibility } from "@/context/values-visibility";
import { UIPreferencesProvider } from "@/context/ui-preferences";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState, lazy, Suspense } from "react";

import { OnboardingTour } from "@/components/onboarding-tour";

const NotFoundPage = lazy(() => import("@/pages/not-found"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const PessoasPage = lazy(() => import("@/pages/pessoas-page"));
const DividasPage = lazy(() => import("@/pages/dividas-page"));
const CartoesPage = lazy(() => import("@/pages/cartoes-page"));
const CalendarioPage = lazy(() => import("@/pages/calendario-page"));
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

function AuthSessionFallback({
  title,
  description,
  onRetry,
  onSignOut,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-muted/50 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="sm:flex-1" onClick={onRetry}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
          <Button type="button" variant="outline" className="sm:flex-1" onClick={onSignOut}>
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error("[app.error-boundary]", error);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <AuthSessionFallback
          title="Nao foi possivel carregar a aplicacao."
          description="Tente recarregar a pagina. Se o problema continuar, saia da conta e entre novamente."
          onRetry={this.handleReload}
          onSignOut={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
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
        <Route path="/calendario">
          <CalendarioPage />
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
      aria-label={visible ? "Ocultar valores" : "Mostrar valores"}
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
    "--app-header-height": "3.5rem",
    "--app-bottom-nav-height": "4rem",
  };

  const navItems = [
    { label: "Painel", icon: LayoutDashboard, path: "/" },
    { label: "Dívidas", icon: Receipt, path: "/dividas" },
    { label: "Cartões", icon: CreditCard, path: "/cartoes" },
    { label: "Renda", icon: Wallet, path: "/renda" },
    { label: "Patrimônio", icon: PiggyBank, path: "/patrimonio" },
  ];

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-dvh min-h-dvh w-full max-w-full overflow-hidden">
        <AppSidebar />
        <div className="flex max-w-full flex-1 min-w-0 flex-col md:pb-0">
          <header
            className="sticky top-0 z-50 flex h-[calc(var(--app-header-height)+env(safe-area-inset-top))] min-h-[calc(var(--app-header-height)+env(safe-area-inset-top))] items-center justify-between gap-2 border-b bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-sm"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <EyeToggle />
          </header>
          <main className="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(var(--app-bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0 [&>*]:w-full [&>*]:max-w-full">
            <Router />
          </main>
          <OnboardingTour />

          <nav
            className="fixed bottom-0 left-0 right-0 z-40 flex h-[calc(var(--app-bottom-nav-height)+env(safe-area-inset-bottom))] items-center justify-around border-t bg-background px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
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
  const {
    isAuthenticated,
    isLoading,
    authError,
    authErrorStatus,
    retryAuth,
    clearSessionSafely,
  } = useAuth();
  const [location, setLocation] = useLocation();
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);
  const isResetPage = location === "/redefinir-senha";
  const isAuthPage = location === "/auth";
  const hasRecoverableAuthError = Boolean(authError && authErrorStatus !== null && authErrorStatus >= 500);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuthPage && !isResetPage) {
      setLocation("/auth");
      return;
    }
    if (!isLoading && isAuthenticated && (isAuthPage || isResetPage)) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, isAuthPage, isResetPage, setLocation]);

  useEffect(() => {
    if (!isLoading) {
      setAuthLoadingTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setAuthLoadingTimedOut(true);
    }, 10000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isLoading]);

  if (isLoading) {
    if (authLoadingTimedOut) {
      return (
        <AuthSessionFallback
          title="Sua sessao esta demorando para carregar."
          description="Voce pode tentar novamente agora ou sair da conta para voltar a tela de login."
          onRetry={() => {
            setAuthLoadingTimedOut(false);
            void retryAuth();
          }}
          onSignOut={() => {
            void clearSessionSafely().then(() => setLocation("/auth"));
          }}
        />
      );
    }
    return <FullscreenLoadingFallback />;
  }

  if (hasRecoverableAuthError && !isAuthPage && !isResetPage) {
    return (
      <AuthSessionFallback
        title="Nao foi possivel carregar sua sessao."
        description="Tente recarregar os dados agora. Se continuar falhando, volte para a tela de login."
        onRetry={() => {
          void retryAuth();
        }}
        onSignOut={() => {
          void clearSessionSafely().then(() => setLocation("/auth"));
        }}
      />
    );
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
        <div className="min-h-screen bg-background">
          {hasRecoverableAuthError ? (
            <div className="px-4 pt-4">
              <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Nao foi possivel carregar sua sessao.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Voce ainda pode entrar novamente ou tentar recarregar a sessao.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void retryAuth()}>
                    Tentar novamente
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void clearSessionSafely();
                    }}
                  >
                    Sair da conta
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <AuthPage />
        </div>
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
              <AppErrorBoundary>
                <Toaster />
                <AppContent />
              </AppErrorBoundary>
            </TooltipProvider>
          </ValuesVisibilityProvider>
        </UIPreferencesProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
