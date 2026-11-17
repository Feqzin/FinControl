import { useAppearanceTheme } from "@/hooks/use-appearance";
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_DASHBOARD_SHORTCUTS, isValidDashboardShortcuts } from "@shared/dashboard-shortcuts";

type MobileModePreference = "auto" | "manual";
export type UsageMode = "essencial" | "guiado" | "completo" | "pro";

interface UIPreferences {
  hiddenPages: string[];
  hiddenDashCards: string[];
  dashboardCompact: boolean;
  mobileMode: boolean;
  mobileModePreference: MobileModePreference;
  usageMode: UsageMode;
  dashboardQuickActions: string[];
}

interface UIPreferencesContextType {
  prefs: UIPreferences;
  isMobileModeAuto: boolean;
  isEssentialMode: boolean;
  isGuidedMode: boolean;
  isCompleteMode: boolean;
  isProMode: boolean;
  showAdvancedResources: boolean;
  showContextualTips: boolean;
  togglePage: (url: string) => void;
  toggleDashCard: (cardId: string) => void;
  toggleCompact: () => void;
  toggleMobileMode: () => void;
  setMobileModeManual: (enabled: boolean) => void;
  setMobileModeAuto: () => void;
  setUsageMode: (mode: UsageMode) => void;
  setDashboardQuickActions: (urls: string[]) => void;
  shortcutsSyncStatus: "loading" | "saved" | "error";
}

const STORAGE_KEY = "fincontrol_ui_prefs";
const MOBILE_MEDIA_QUERY = "(max-width: 768px)";

const defaultPrefs: UIPreferences = {
  hiddenPages: [],
  hiddenDashCards: [],
  dashboardCompact: false,
  mobileMode: false,
  mobileModePreference: "auto",
  usageMode: "essencial",
  dashboardQuickActions: DEFAULT_DASHBOARD_SHORTCUTS,
};

const UIPreferencesContext = createContext<UIPreferencesContextType | undefined>(undefined);

function buildDefaultPrefs(detectMobileViewport: () => boolean): UIPreferences {
  return {
    ...defaultPrefs,
    mobileMode: detectMobileViewport(),
  };
}

function normalizeStoredPrefs(
  parsed: Partial<UIPreferences>,
  detectMobileViewport: () => boolean,
): UIPreferences {
  const merged = { ...defaultPrefs, ...parsed };
  const hasExplicitPreference = parsed.mobileModePreference === "manual" || parsed.mobileModePreference === "auto";
  const hasLegacyMobileMode = Object.prototype.hasOwnProperty.call(parsed, "mobileMode");
  const mobileModePreference: MobileModePreference = hasExplicitPreference
    ? (parsed.mobileModePreference as MobileModePreference)
    : (hasLegacyMobileMode ? "manual" : "auto");
  const mobileMode = mobileModePreference === "manual"
    ? Boolean(merged.mobileMode)
    : detectMobileViewport();

  return {
    ...merged,
    mobileModePreference,
    mobileMode,
    // Preferências antigas sem modo explícito mantêm a experiência anterior.
    usageMode:
      parsed.usageMode === "essencial"
      || parsed.usageMode === "guiado"
      || parsed.usageMode === "completo"
      || parsed.usageMode === "pro"
        ? parsed.usageMode
        : "guiado",
    dashboardQuickActions: isValidDashboardShortcuts(parsed.dashboardQuickActions)
      ? parsed.dashboardQuickActions
      : [...DEFAULT_DASHBOARD_SHORTCUTS],
  };
}

function readStoredPrefs(
  storageKey: string,
  detectMobileViewport: () => boolean,
): UIPreferences | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    return normalizeStoredPrefs(JSON.parse(stored) as Partial<UIPreferences>, detectMobileViewport);
  } catch {
    return null;
  }
}

function writeStoredPrefs(storageKey: string, prefs: UIPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch (error) {
    console.error("Failed to save UI preferences", error);
  }
}

function resolveStorageKey(userId: string | null | undefined): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

export function UIPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  useAppearanceTheme(user?.id);
  const detectMobileViewport = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  };

  const [activeStorageKey, setActiveStorageKey] = useState(() => resolveStorageKey(null));
  const [shortcutsSyncStatus, setShortcutsSyncStatus] = useState<"loading" | "saved" | "error">("loading");
  const shortcutsRevision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [prefs, setPrefs] = useState<UIPreferences>(() => {
    return readStoredPrefs(STORAGE_KEY, detectMobileViewport) ?? buildDefaultPrefs(detectMobileViewport);
  });

  const updatePrefs = (newPrefs: UIPreferences) => {
    setPrefs(newPrefs);
    writeStoredPrefs(activeStorageKey, newPrefs);
  };

  useEffect(() => {
    const nextStorageKey = resolveStorageKey(user?.id);
    if (nextStorageKey === activeStorageKey) return;

    const nextPrefs = readStoredPrefs(nextStorageKey, detectMobileViewport);
    if (nextPrefs) {
      setPrefs(nextPrefs);
      setActiveStorageKey(nextStorageKey);
      return;
    }

    if (user?.id) {
      const legacyPrefs = readStoredPrefs(STORAGE_KEY, detectMobileViewport);
      if (legacyPrefs) {
        setPrefs(legacyPrefs);
        setActiveStorageKey(nextStorageKey);
        writeStoredPrefs(nextStorageKey, legacyPrefs);
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }
        return;
      }
    }

    setPrefs(buildDefaultPrefs(detectMobileViewport));
    setActiveStorageKey(nextStorageKey);
  }, [activeStorageKey, user?.id]);

  useEffect(() => {
    if (!user?.id || activeStorageKey !== resolveStorageKey(user.id)) return;
    const controller = new AbortController();
    const revisionAtStart = shortcutsRevision.current;
    setShortcutsSyncStatus("loading");

    void (async () => {
      try {
        const response = await fetch("/api/dashboard/shortcuts", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível carregar os atalhos.");
        const data = await response.json() as { shortcuts: unknown };
        if (controller.signal.aborted || shortcutsRevision.current !== revisionAtStart) return;

        if (isValidDashboardShortcuts(data.shortcuts)) {
          setPrefs((current) => {
            if (shortcutsRevision.current !== revisionAtStart) return current;
            const updated = { ...current, dashboardQuickActions: data.shortcuts as string[] };
            writeStoredPrefs(activeStorageKey, updated);
            return updated;
          });
        } else {
          const local = readStoredPrefs(activeStorageKey, detectMobileViewport)?.dashboardQuickActions
            ?? DEFAULT_DASHBOARD_SHORTCUTS;
          saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
            if (controller.signal.aborted || shortcutsRevision.current !== revisionAtStart) return;
            const saved = await fetch("/api/dashboard/shortcuts", {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shortcuts: local }),
              signal: controller.signal,
            });
            if (!saved.ok) throw new Error("Não foi possível salvar os atalhos.");
          });
          await saveQueue.current;
        }
        if (!controller.signal.aborted && shortcutsRevision.current === revisionAtStart) setShortcutsSyncStatus("saved");
      } catch {
        if (!controller.signal.aborted) setShortcutsSyncStatus("error");
      }
    })();

    return () => controller.abort();
  }, [activeStorageKey, user?.id]);

  const togglePage = (url: string) => {
    const hiddenPages = prefs.hiddenPages.includes(url)
      ? prefs.hiddenPages.filter((p) => p !== url)
      : [...prefs.hiddenPages, url];
    updatePrefs({ ...prefs, hiddenPages });
  };

  const toggleDashCard = (cardId: string) => {
    const hiddenDashCards = prefs.hiddenDashCards.includes(cardId)
      ? prefs.hiddenDashCards.filter((c) => c !== cardId)
      : [...prefs.hiddenDashCards, cardId];
    updatePrefs({ ...prefs, hiddenDashCards });
  };

  const toggleCompact = () => {
    updatePrefs({ ...prefs, dashboardCompact: !prefs.dashboardCompact });
  };

  const setMobileModeManual = (enabled: boolean) => {
    updatePrefs({
      ...prefs,
      mobileMode: enabled,
      mobileModePreference: "manual",
    });
  };

  const setMobileModeAuto = () => {
    updatePrefs({
      ...prefs,
      mobileMode: detectMobileViewport(),
      mobileModePreference: "auto",
    });
  };

  const toggleMobileMode = () => {
    setMobileModeManual(!prefs.mobileMode);
  };

  const setUsageMode = (mode: UsageMode) => {
    updatePrefs({
      ...prefs,
      usageMode: mode,
    });
  };

  const setDashboardQuickActions = (urls: string[]) => {
    if (!isValidDashboardShortcuts(urls)) return;
    const next = [...urls];
    updatePrefs({ ...prefs, dashboardQuickActions: next });
    shortcutsRevision.current += 1;
    const revision = shortcutsRevision.current;
    setShortcutsSyncStatus("loading");
    if (!user?.id || activeStorageKey !== resolveStorageKey(user.id)) return;

    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      const response = await fetch("/api/dashboard/shortcuts", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortcuts: next }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar os atalhos.");
    });
    void saveQueue.current.then(
      () => { if (revision === shortcutsRevision.current) setShortcutsSyncStatus("saved"); },
      () => { if (revision === shortcutsRevision.current) setShortcutsSyncStatus("error"); },
    );
  };

  useEffect(() => {
    if (prefs.mobileModePreference !== "auto") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const syncWithViewport = () => {
      const nextMobile = mediaQuery.matches;
      setPrefs((current) => {
        if (current.mobileModePreference !== "auto") return current;
        if (current.mobileMode === nextMobile) return current;
        const updated = { ...current, mobileMode: nextMobile };
        writeStoredPrefs(activeStorageKey, updated);
        return updated;
      });
    };

    syncWithViewport();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncWithViewport);
      return () => mediaQuery.removeEventListener("change", syncWithViewport);
    }

    mediaQuery.addListener(syncWithViewport);
    return () => mediaQuery.removeListener(syncWithViewport);
  }, [activeStorageKey, prefs.mobileModePreference]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-usage-mode", prefs.usageMode);
  }, [prefs.usageMode]);

  const contextValue = useMemo(
    () => ({
      prefs,
      isMobileModeAuto: prefs.mobileModePreference === "auto",
      isEssentialMode: prefs.usageMode === "essencial",
      isGuidedMode: prefs.usageMode === "guiado",
      isCompleteMode: prefs.usageMode === "completo",
      isProMode: prefs.usageMode === "pro",
      showAdvancedResources: prefs.usageMode === "completo" || prefs.usageMode === "pro",
      showContextualTips: prefs.usageMode === "guiado",
      togglePage,
      toggleDashCard,
      toggleCompact,
      toggleMobileMode,
      setMobileModeManual,
      setMobileModeAuto,
      setUsageMode,
      setDashboardQuickActions,
      shortcutsSyncStatus,
    }),
    [prefs],
  );

  return (
    <UIPreferencesContext.Provider value={contextValue}>
      {children}
    </UIPreferencesContext.Provider>
  );
}

export function useUIPreferences() {
  const context = useContext(UIPreferencesContext);
  if (context === undefined) {
    throw new Error("useUIPreferences must be used within a UIPreferencesProvider");
  }
  return context;
}
