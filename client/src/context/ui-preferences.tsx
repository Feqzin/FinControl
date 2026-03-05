import { createContext, useContext, useState, ReactNode } from "react";

interface UIPreferences {
  hiddenPages: string[];      // URLs of hidden pages e.g. ["/relatorios", "/simulador"]
  hiddenDashCards: string[];  // Card names e.g. ["receber", "pagar", "servicos", "saldo", "renda", "patrimonio"]
  dashboardCompact: boolean;  // Compact vs spacious
}

interface UIPreferencesContextType {
  prefs: UIPreferences;
  togglePage: (url: string) => void;
  toggleDashCard: (cardId: string) => void;
  toggleCompact: () => void;
}

const STORAGE_KEY = "fincontrol_ui_prefs";

const defaultPrefs: UIPreferences = {
  hiddenPages: [],
  hiddenDashCards: [],
  dashboardCompact: false,
};

const UIPreferencesContext = createContext<UIPreferencesContextType | undefined>(undefined);

export function UIPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UIPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultPrefs;
    } catch {
      return defaultPrefs;
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

  return (
    <UIPreferencesContext.Provider value={{ prefs, togglePage, toggleDashCard, toggleCompact }}>
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
