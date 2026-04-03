# Objective
Add three high-value personalization features to FinControl:
1. Brand icons system — auto-match bank/service names to visual brand icons
2. Manage Pages — let users hide/show sidebar pages and dashboard cards
3. Interactive onboarding tutorial — step-by-step first-use tour

Explicitly NOT building (too complex or low value): drag & drop reorder, custom icon upload, flexible column count, microanimations library.

# Context
- Stack: React + Express + PostgreSQL + Shadcn UI
- Language: Brazilian Portuguese
- react-icons/si available: SiNubank, SiNetflix, SiSpotify, SiAmazon, SiYoutube, SiApple, SiGoogle, SiHbo, SiPaypal, SiPicpay, SiMercadopago, SiPagseguro, SiAmazonprime
- Dashboard: 6 stat cards; app-sidebar.tsx has mainItems + planejamentoItems + ferramentasItems
- Preferences are stored in localStorage (same pattern as values-visibility.tsx)
- App.tsx has ValuesVisibilityProvider wrapping the app

# Tasks

### T001: Brand Icons System
- **Blocked By**: []
- **Details**:
  Create `client/src/lib/brand-icons.tsx` with:

  ```tsx
  import {
    SiNubank, SiNetflix, SiSpotify, SiAmazon, SiYoutube, SiApple,
    SiGoogle, SiHbo, SiPaypal, SiPicpay, SiMercadopago, SiPagseguro,
    SiAmazonprime
  } from "react-icons/si";
  import { CreditCard, Smartphone, ShoppingBag, Music, Play } from "lucide-react";
  
  interface BrandIconInfo {
    icon: React.ComponentType<{ className?: string }>;
    bg: string;       // Tailwind bg class (e.g. "bg-purple-600")
    color: string;    // Tailwind text class (e.g. "text-white")
    label?: string;   // Display name override
  }
  ```

  The mapping function `getBrandIcon(name: string): BrandIconInfo` should:
  - Normalize name to lowercase and check for keywords
  - Match:
    * "nubank" → SiNubank, bg-purple-600, text-white
    * "mercado pago" | "mercadopago" → SiMercadopago, bg-sky-500, text-white
    * "itau" | "itaú" → letter avatar "IT", bg-orange-500, text-white
    * "banco do brasil" | "bb" → letter avatar "BB", bg-yellow-500, text-black
    * "caixa" | "cef" → letter avatar "CX", bg-blue-700, text-white
    * "bradesco" → letter avatar "BD", bg-red-600, text-white
    * "inter" | "banco inter" → letter avatar "IN", bg-orange-400, text-white
    * "santander" → letter avatar "SN", bg-red-700, text-white
    * "netflix" → SiNetflix, bg-red-600, text-white
    * "spotify" → SiSpotify, bg-green-500, text-white
    * "amazon" (not prime) → SiAmazon, bg-orange-400, text-black
    * "amazon prime" | "prime" → SiAmazonprime, bg-sky-700, text-white
    * "youtube" → SiYoutube, bg-red-500, text-white
    * "apple" | "icloud" | "apple tv" → SiApple, bg-gray-800, text-white
    * "google" | "google one" → SiGoogle, bg-blue-500, text-white
    * "disney" | "disney+" → letter avatar "D+", bg-blue-800, text-white
    * "hbo" | "max" | "hbo max" → SiHbo, bg-indigo-700, text-white
    * "paypal" → SiPaypal, bg-blue-600, text-white
    * "picpay" → SiPicpay, bg-green-600, text-white
    * "pagseguro" → SiPagseguro, bg-green-700, text-white
    * default → CreditCard icon, bg-muted, text-muted-foreground

  For letter avatars, return a special component that renders a `<span>` with the text instead of an icon component.

  **Pattern for letter avatar fallback:**
  ```tsx
  const makeLetterIcon = (text: string) =>
    function LetterIcon({ className }: { className?: string }) {
      return <span className={`font-bold text-xs ${className || ''}`}>{text}</span>;
    };
  ```

  **Also export:**
  ```tsx
  export function BrandIconDisplay({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
    const info = getBrandIcon(name);
    const Icon = info.icon;
    const sizeClasses = {
      sm: "w-7 h-7 text-xs",
      md: "w-9 h-9 text-sm",
      lg: "w-12 h-12 text-base"
    };
    return (
      <div className={`flex items-center justify-center rounded-lg flex-shrink-0 ${sizeClasses[size]} ${info.bg} ${info.color}`}>
        <Icon className="w-4 h-4" />
      </div>
    );
  }
  ```

  **Update cartoes-page.tsx:**
  - Import BrandIconDisplay
  - In the cartão card headers/list items, replace the generic CreditCard icon with `<BrandIconDisplay name={cartao.nome} size="md" />`
  - Apply to both the list view and the card header

  **Update servicos-page.tsx:**
  - Import BrandIconDisplay
  - In the service rows/cards, replace generic icons with `<BrandIconDisplay name={servico.nome} size="sm" />`

  - Files: client/src/lib/brand-icons.tsx (create), client/src/pages/cartoes-page.tsx (update), client/src/pages/servicos-page.tsx (update)
  - Acceptance: Nubank card shows purple N icon, Netflix service shows red N, unmatched items show generic card icon

### T002: UI Preferences — Manage Pages + Dashboard Cards
- **Blocked By**: []
- **Details**:
  Create `client/src/context/ui-preferences.tsx`:

  ```tsx
  interface UIPreferences {
    hiddenPages: string[];      // URLs of hidden pages e.g. ["/relatorios", "/simulador"]
    hiddenDashCards: string[];  // Card names e.g. ["A receber", "Patrimônio total"]
    dashboardCompact: boolean;  // Compact vs spacious
  }
  ```

  Store in localStorage key `"fincontrol_ui_prefs"`.
  
  Export:
  - `UIPreferencesProvider`
  - `useUIPreferences()` → `{ prefs, togglePage, toggleDashCard, toggleCompact }`

  **Update app-sidebar.tsx:**
  - Import useUIPreferences
  - Filter mainItems, planejamentoItems, ferramentasItems based on `prefs.hiddenPages`
  - Add a "Personalizar" button at the bottom of SidebarFooter (above or below logout)
  - The button opens a dialog (use shadcn Dialog) titled "Gerenciar Telas"
  - Dialog content: list of all pages with Switch toggles
  - Pages that can be hidden: Pessoas, Dívidas, Cartões, Renda, Patrimônio, Serviços, Metas, Previsão, Histórico, Simulador, Relatórios, Importar
  - Cannot hide: Painel (dashboard), Perfil (always visible)
  - Each toggle: `<div className="flex items-center justify-between p-2"><span>{title}</span><Switch checked={!prefs.hiddenPages.includes(url)} onCheckedChange={() => togglePage(url)} /></div>`
  - Show a warning: "Ocultar uma tela não exclui seus dados"

  **Update dashboard.tsx:**
  - Import useUIPreferences
  - The 6 stat cards should be filtered by `prefs.hiddenDashCards`
  - Add a "Personalizar Painel" button (small, ghost) in the dashboard header row next to the score widget
  - The button opens a dialog: "Personalizar Painel" with toggles for each of the 6 cards
  - Card names to use as IDs: "receber", "pagar", "servicos", "saldo", "renda", "patrimonio"
  - Cards toggle: show/hide in grid
  - If `prefs.dashboardCompact` is true, use `gap-2` and `p-3` instead of `gap-4` and `p-5`

  Use Switch from "@/components/ui/switch":
  ```tsx
  import { Switch } from "@/components/ui/switch"
  ```

  Use Dialog from "@/components/ui/dialog":
  ```tsx
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
  ```

  - Files: client/src/context/ui-preferences.tsx (create), client/src/components/app-sidebar.tsx (update), client/src/pages/dashboard.tsx (update)
  - Acceptance: Hiding a page removes it from sidebar; hiding a dashboard card removes it from the grid; toggles persist after page reload

### T003: Interactive Onboarding Tutorial
- **Blocked By**: []
- **Details**:
  Create `client/src/components/onboarding-tour.tsx`.

  **State:** localStorage key `"fincontrol_tour_done"` — if not set, show tour on first visit.

  **Tour structure:** A floating modal with overlay. NOT a complex DOM-highlighting tour — instead, a simple informational step-by-step modal dialog that appears centered, with a semi-opaque background overlay.

  **Steps (8 total):**
  1. "Bem-vindo ao FinControl!" — "Seu controle financeiro pessoal completo. Vamos fazer um tour rápido para você conhecer tudo."
  2. "Painel Principal" — "O painel resume tudo: saldo do mês, renda, cartões, patrimônio e muito mais. Passe o mouse sobre os cards para ver o detalhamento."
  3. "Pessoas e Dívidas" — "Cadastre pessoas (amigos, família) e registre quem te deve ou quem você deve. Controle parcelas e vencimentos."
  4. "Cartões de Crédito" — "Gerencie seus cartões. Registre compras parceladas e o sistema calcula automaticamente o compromisso mensal."
  5. "Renda e Patrimônio" — "Cadastre suas fontes de renda (salário, freelance) e seu patrimônio (contas, poupança, investimentos)."
  6. "Relatórios em PDF" — "Na tela de Relatórios, filtre por período e exporte um PDF completo da sua situação financeira."
  7. "Ocultar Valores" — "Use o ícone de olho no topo para ocultar todos os valores. Útil quando estiver em lugares públicos."
  8. "Tudo pronto!" — "Você já sabe o essencial. Explore as outras telas: Simulador, Metas, Previsão e muito mais. Bom controle financeiro!"

  **Component:**
  ```tsx
  export function OnboardingTour() {
    const [step, setStep] = useState(0);
    const [open, setOpen] = useState(() => {
      try { return !localStorage.getItem("fincontrol_tour_done"); } catch { return false; }
    });
    
    const close = () => {
      try { localStorage.setItem("fincontrol_tour_done", "1"); } catch {}
      setOpen(false);
    };
    
    if (!open) return null;
    // Render overlay + centered card
  }
  ```

  **Visual design:**
  - Full-screen fixed overlay: `className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"`
  - Central card: `className="bg-card border rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-4"`
  - Step indicator: dots at bottom `● ● ● ○ ○ ○ ○ ○` (filled = done)
  - Navigation: "Pular tutorial" (ghost, left) | "Anterior" (outline) | "Próximo" / "Começar!" (primary)
  - Each step has an icon (lucide-react), title, and description paragraph
  - Smooth step transitions using opacity (add `transition-opacity duration-200`)

  **Also export:**
  ```tsx
  export function TourRestartButton() {
    // Small button that resets localStorage and shows tour again
    // Used in perfil-page.tsx
  }
  ```

  **Wire it up:**
  - Import OnboardingTour in App.tsx and render it inside AuthenticatedLayout (after the router)
  - Import TourRestartButton in perfil-page.tsx (or wherever settings are)

  **Update App.tsx:**
  - Add `<OnboardingTour />` inside the main content area of AuthenticatedLayout
  
  **Update perfil-page.tsx:**
  - Add a "Refazer tutorial" button in the settings section using TourRestartButton

  **Update App.tsx to add UIPreferencesProvider:**
  - Wrap the app with UIPreferencesProvider (alongside ValuesVisibilityProvider)

  - Files: client/src/components/onboarding-tour.tsx (create), client/src/App.tsx (update), client/src/pages/perfil-page.tsx (update)
  - Acceptance: Tour appears on first load; "Pular" dismisses it; "Próximo" advances steps; tour does not reappear after reload; "Refazer tutorial" in perfil restarts it
