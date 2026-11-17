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

export function moveDashboardShortcut(urls: string[], fromUrl: string, toUrl: string): string[] {
  const from = urls.indexOf(fromUrl);
  const to = urls.indexOf(toUrl);
  if (from < 0 || to < 0 || from === to) return urls;
  const next = [...urls];
  next.splice(from, 1);
  next.splice(to, 0, fromUrl);
  return next;
}

const allowedUrls = new Set<string>(DASHBOARD_SHORTCUT_OPTIONS.map((item) => item.url));

export function isValidDashboardShortcuts(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_DASHBOARD_SHORTCUTS
    && value.every((url) => typeof url === "string" && allowedUrls.has(url))
    && new Set(value).size === value.length;
}
