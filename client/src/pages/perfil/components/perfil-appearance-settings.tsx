import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAppearance } from "@/hooks/use-appearance";
import { ACCENT_PRESETS, DEFAULT_ACCENT, getAccentTokens, isAccentColor } from "@shared/appearance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PerfilAppearanceSettings() {
  const { user } = useAuth();
  const { query, save, accentColor } = useAppearance(user?.id);
  const [draft, setDraft] = useState(accentColor);
  useEffect(() => { setDraft(accentColor); }, [accentColor]);
  const valid = isAccentColor(draft);
  const preview = getAccentTokens(draft);
  return <section className="space-y-4 border-b border-border/60 pb-5" aria-labelledby="appearance-title">
    <div><h3 id="appearance-title" className="font-medium">Cores do sistema</h3><p className="mt-1 text-sm text-muted-foreground">O azul original do FinControl é o padrão. Escolha a cor que combina com você.</p></div>
    <div className="flex flex-wrap gap-2" aria-label="Paletas prontas">
      {ACCENT_PRESETS.map(preset => <button type="button" key={preset.value} aria-pressed={draft.toLowerCase() === preset.value} onClick={() => { setDraft(preset.value); save.reset(); }} className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: preset.value, color: `hsl(${getAccentTokens(preset.value).foreground})` }}>{draft.toLowerCase() === preset.value && <Check className="h-3 w-3" />}</span>{preset.name}
      </button>)}
    </div>
    <div className="space-y-2"><Label htmlFor="custom-accent">Cor personalizada</Label><div className="flex items-center gap-2"><input id="custom-accent" type="color" value={valid ? draft : DEFAULT_ACCENT} onChange={event => { setDraft(event.target.value); save.reset(); }} className="h-10 w-12 cursor-pointer rounded-lg border bg-transparent p-1" /><Input aria-label="Código hexadecimal da cor" className="max-w-40" value={draft} maxLength={7} onChange={event => { setDraft(event.target.value); save.reset(); }} placeholder="#1173d4" /></div></div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3"><span className="rounded-xl px-4 py-2 text-sm font-medium" style={{ backgroundColor: valid ? draft : DEFAULT_ACCENT, color: `hsl(${preview.foreground})` }}>Prévia da cor</span><span className="text-xs text-muted-foreground">Botões, atalhos e destaques</span></div>
    {query.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar sua preferência. <button type="button" className="underline" onClick={() => query.refetch()}>Tentar novamente</button></p>}
    {save.isError && <p role="alert" className="text-sm text-destructive">Não foi possível salvar. Tente novamente.</p>}
    <div className="flex flex-wrap items-center gap-2"><Button disabled={!valid || query.isLoading || query.isError || save.isPending} onClick={() => save.mutate(draft)}>{save.isPending ? "Salvando..." : "Salvar cor"}</Button><Button variant="ghost" disabled={save.isPending || query.isLoading || query.isError} onClick={() => { setDraft(DEFAULT_ACCENT); save.mutate(DEFAULT_ACCENT); }}>Restaurar azul original</Button><p role="status" className="text-xs text-muted-foreground">{save.isSuccess ? "Cor salva na sua conta." : "Sua escolha será usada nos próximos acessos."}</p></div>
  </section>;
}
