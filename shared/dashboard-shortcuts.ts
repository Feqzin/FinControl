export const DASHBOARD_SHORTCUT_OPTIONS = [
  { title: "Pessoas", url: "/pessoas" },
  { title: "Dívidas", url: "/dividas" },
  { title: "Cartões", url: "/cartoes" },
  { title: "Renda", url: "/renda" },
  { title: "Patrimônio", url: "/patrimonio" },
  { title: "Serviços", url: "/servicos" },
  { title: "Metas", url: "/metas" },
  { title: "Calendário", url: "/calendario" },
  { title: "Previsão", url: "/previsao" },
  { title: "Histórico", url: "/historico" },
  { title: "Simulador", url: "/simulador" },
  { title: "Relatórios", url: "/relatorios" },
] as const;

export const DEFAULT_DASHBOARD_SHORTCUTS: string[] = ["/pessoas", "/renda", "/servicos"];
export const MAX_DASHBOARD_SHORTCUTS = 6;

const allowedUrls = new Set<string>(DASHBOARD_SHORTCUT_OPTIONS.map((item) => item.url));

export function isValidDashboardShortcuts(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_DASHBOARD_SHORTCUTS
    && value.every((url) => typeof url === "string" && allowedUrls.has(url))
    && new Set(value).size === value.length;
}
