import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DividaViewItem } from "../dividas.utils";
import { formatDividaCurrency } from "../dividas.utils";

export type DebtGroup = { id: string; name: string; debtIds: string[] };

export function DebtGroupDialog({ open, group, items, getName, onClose, onSaved, onDeleted }: {
  open: boolean;
  group: DebtGroup | null;
  items: DividaViewItem[];
  getName: (id: string) => string;
  onClose: () => void;
  onSaved: (group: DebtGroup) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [debtIds, setDebtIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (open) { setConfirmDelete(false); setName(group?.name ?? ""); setDebtIds(group?.debtIds ?? []); setSearch(""); }
  }, [open, group]);
  const save = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(group ? "PATCH" : "POST", group ? `/api/debt-groups/${group.id}` : "/api/debt-groups", { name: name.trim(), debtIds });
      return response.json() as Promise<DebtGroup>;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/debt-groups"] });
      onSaved(saved);
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (!group) throw new Error("Grupo não encontrado.");
      await apiRequest("DELETE", `/api/debt-groups/${group.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/debt-groups"] });
      onDeleted();
    },
  });
  const busy = save.isPending || remove.isPending;
  const availableIds = new Set(items.map(item => item.id));
  const unavailableIds = debtIds.filter(id => !availableIds.has(id));
  const matches = items.filter(item => `${getName(item.pessoaId)} ${item.descricao ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) { save.reset(); remove.reset(); onClose(); } }}>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>{group ? "Editar grupo" : "Criar grupo"}</DialogTitle><DialogDescription>Organize dívidas do seu jeito. Uma dívida pode participar de mais de um grupo.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!busy && !confirmDelete) save.mutate(); }}>
        <div className="space-y-2"><Label htmlFor="debt-group-name">Nome do grupo</Label><Input id="debt-group-name" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Ex.: Casa, Família, Viagem" required disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="debt-group-search">Adicionar dívidas</Label><Input id="debt-group-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pessoa ou descrição" /><p className="text-xs text-muted-foreground">{debtIds.length} selecionada{debtIds.length === 1 ? "" : "s"}. Você também pode criar um grupo vazio.</p></div>
        {unavailableIds.length > 0 && <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">
          <p>{unavailableIds.length} vínculo(s) não aparecem na lista atual. Se a dívida foi removida, retire o vínculo para salvar o grupo.</p>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setDebtIds(ids => ids.filter(id => availableIds.has(id)))}>Remover vínculos indisponíveis</Button>
          <p className="text-xs text-muted-foreground">A alteração será aplicada ao salvar.</p>
        </div>}
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2">
          {matches.length ? matches.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={debtIds.includes(item.id)} disabled={busy} onChange={event => setDebtIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{getName(item.pessoaId)}</span><span className="block break-words text-xs text-muted-foreground">{item.descricao || (item.tipo === "pagar" ? "A pagar" : "A receber")} · {formatDividaCurrency(item.valorTotal)}</span></span>
          </label>) : <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma dívida encontrada.</p>}
        </div>
        {save.isError && <p role="alert" className="text-sm text-destructive">Não foi possível salvar o grupo. Tente novamente.</p>}
        {group && <div className="space-y-2 border-t pt-3">
          {confirmDelete ? <div className="space-y-2" role="alert">
            <p className="text-sm">Excluir o grupo “{group.name}”? As dívidas serão mantidas.</p>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={() => remove.mutate()}>{remove.isPending ? "Excluindo..." : "Confirmar exclusão"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Manter grupo</Button></div>
          </div> : <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { remove.reset(); setConfirmDelete(true); }}>Excluir grupo</Button>}
          {remove.isError && <p role="alert" className="text-sm text-destructive">Não foi possível excluir o grupo. Tente novamente.</p>}
        </div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => { save.reset(); remove.reset(); onClose(); }}>Cancelar</Button><Button type="submit" disabled={!name.trim() || busy || confirmDelete}>{save.isPending ? "Salvando..." : "Salvar grupo"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
