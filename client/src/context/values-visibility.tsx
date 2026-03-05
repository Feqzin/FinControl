import { createContext, useContext, useState } from "react";

interface ValuesVisibilityContextType {
  visible: boolean;
  toggle: () => void;
}

const ValuesVisibilityContext = createContext<ValuesVisibilityContextType>({
  visible: true,
  toggle: () => {},
});

export function ValuesVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("fincontrol_valores_visiveis");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const toggle = () => {
    setVisible((v) => {
      const next = !v;
      try {
        localStorage.setItem("fincontrol_valores_visiveis", String(next));
      } catch {}
      return next;
    });
  };

  return (
    <ValuesVisibilityContext.Provider value={{ visible, toggle }}>
      {children}
    </ValuesVisibilityContext.Provider>
  );
}

export function useValuesVisibility() {
  return useContext(ValuesVisibilityContext);
}

export function maskValue(value: string, visible: boolean): string {
  return visible ? value : "R$ ••••••";
}
