import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DEFAULT_ACCENT, getAccentTokens, isAccentColor } from "@shared/appearance";

export function useAppearance(userId: string | undefined) {
  const queryKey = ["/api/appearance", userId];
  const query = useQuery<{ accentColor: string }>({
    queryKey, enabled: Boolean(userId),
    queryFn: async () => (await apiRequest("GET", "/api/appearance")).json(),
  });
  const save = useMutation({
    mutationFn: async (accentColor: string) => (await apiRequest("PUT", "/api/appearance", { accentColor })).json() as Promise<{ accentColor: string }>,
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });
  return { query, save, accentColor: isAccentColor(query.data?.accentColor) ? query.data.accentColor : DEFAULT_ACCENT };
}
export function useAppearanceTheme(userId: string | undefined) {
  const { accentColor } = useAppearance(userId);
  useEffect(() => {
    const tokens = getAccentTokens(accentColor);
    const root = document.documentElement;
    root.style.setProperty("--app-primary", tokens.primary);
    root.style.setProperty("--app-primary-foreground", tokens.foreground);
    root.style.setProperty("--app-accent-soft-text", tokens.softText);
    root.style.setProperty("--app-accent-text", tokens.lightText);
    return () => { for (const key of ["--app-primary", "--app-primary-foreground", "--app-accent-soft-text", "--app-accent-text"]) root.style.removeProperty(key); };
  }, [accentColor]);
}
