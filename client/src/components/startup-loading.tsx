import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { LoaderCircle, Receipt, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RouteReadyContext = createContext<(() => void) | null>(null);

export function StartupLoadingScreen({ slow = false }: { slow?: boolean }) {
  return <div className="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center bg-background px-6" data-testid="startup-loading">
    <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Receipt className="h-8 w-8" aria-hidden="true" /></div>
      <h1 className="text-2xl font-semibold tracking-tight">FinControl</h1>
      <div className="mt-6 flex items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /><p>{slow ? "O carregamento está demorando um pouco mais." : "Preparando suas finanças..."}</p></div>
      <p className="mt-3 text-sm text-muted-foreground">{slow ? "Confira sua conexão ou tente carregar novamente." : "Aguarde enquanto carregamos seus dados."}</p>
      {slow && <Button className="mt-5 rounded-xl" variant="outline" onClick={() => window.location.reload()}><RefreshCcw className="mr-2 h-4 w-4" />Tentar novamente</Button>}
    </div>
  </div>;
}

/** Committed only after the initial lazy route has mounted its queries. */
export function StartupRouteReady() {
  const markReady = useContext(RouteReadyContext);
  useEffect(() => { markReady?.(); }, [markReady]);
  return null;
}

export function StartupDataGate({ children }: { children: ReactNode }) {
  const [routeReady, setRouteReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [slow, setSlow] = useState(false);
  const markReady = useCallback(() => setRouteReady(true), []);
  const pending = useIsFetching({ predicate: query => query.state.data === undefined });
  useEffect(() => {
    if (complete || !routeReady || pending > 0) return;
    // Allow dependent requests to start before revealing the initial screen.
    const timer = window.setTimeout(() => setComplete(true), 200);
    return () => window.clearTimeout(timer);
  }, [routeReady, pending, complete]);
  useEffect(() => {
    if (complete) return;
    const timer = window.setTimeout(() => setSlow(true), 15000);
    return () => window.clearTimeout(timer);
  }, [complete]);
  return <RouteReadyContext.Provider value={markReady}>
    <div aria-hidden={!complete || undefined} style={{ visibility: complete ? "visible" : "hidden" }} ref={node => { if (node) node.inert = !complete; }}>
      {children}
    </div>
    {!complete && <StartupLoadingScreen slow={slow} />}
  </RouteReadyContext.Provider>;

}
