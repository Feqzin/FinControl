import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

type MobileModePreference = "auto" | "manual";
export type UsageMode = "essencial" | "guiado" | "completo";

interface UIPreferences {
  hiddenPages: string[];
  hiddenDashCards: string[];
  dashboardCompact: boolean;
  mobileMode: boolean;
  mobileModePreference: MobileModePreference;
  usageMode: UsageMode;
}

interface UIPreferencesContextType {
  prefs: UIPreferences;
  isMobileModeAuto: boolean;
  isEssentialMode: boolean;
  isGuidedMode: boolean;
  isCompleteMode: boolean;
  showAdvancedResources: boolean;
  showContextualTips: boolean;
  togglePage: (url: string) => void;
  toggleDashCard: (cardId: string) => void;
  toggleCompact: () => void;
  toggleMobileMode: () => void;
  setMobileModeManual: (enabled: boolean) => void;
  setMobileModeAuto: () => void;
  setUsageMode: (mode: UsageMode) => void;
}

const STORAGE_KEY = "fincontrol_ui_prefs";
const MOBILE_MEDIA_QUERY = "(max-width: 768px)";

const defaultPrefs: UIPreferences = {
  hiddenPages: [],
  hiddenDashCards: [],
  dashboardCompact: false,
  mobileMode: false,
  mobileModePreference: "auto",
  usageMode: "guiado",
};

const UIPreferencesContext = createContext<UIPreferencesContextType | undefined>(undefined);

export function UIPreferencesProvider({ children }: { children: ReactNode }) {
  const detectMobileViewport = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  };

  const [prefs, setPrefs] = useState<UIPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UIPreferences>;
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
          usageMode: merged.usageMode ?? "guiado",
        };
      }
      return {
        ...defaultPrefs,
        mobileMode: detectMobileViewport(),
      };
    } catch {
      return {
        ...defaultPrefs,
        mobileMode: detectMobileViewport(),
      };
    }
  });

  const updatePrefs = (newPrefs: UIPreferences) => {
    setPrefs(newPrefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
    } catch (e) {
      console.error("Failed to save UI preferences", e);
    }
  };

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
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          console.error("Failed to save UI preferences", error);
        }
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
  }, [prefs.mobileModePreference]);

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
      showAdvancedResources: prefs.usageMode !== "essencial",
      showContextualTips: prefs.usageMode === "guiado",
      togglePage,
      toggleDashCard,
      toggleCompact,
      toggleMobileMode,
      setMobileModeManual,
      setMobileModeAuto,
      setUsageMode,
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
