import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DebtGroupDialog, type DebtGroup } from "./debt-group-dialog";
import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Users, Layers, ChevronRight, ArrowDownLeft, ArrowUpRight, ChevronDown, MoreHorizontal, Pencil, Trash2, FastForward, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Parcela } from "@shared/schema";
import type { DividaWithParcelas } from "@/hooks/useDividas";
import { formatDividaCurrency, formatDividaDate, type DividaViewItem } from "../dividas.utils";
import { ParcelaRow } from "./parcela-row";

type Props = {
  items: DividaViewItem[];
  allItems: DividaViewItem[];
  getName: (id: string) => string;
  highlightedId: string | null;
  removed: boolean;
  paying: boolean;
  onPay: (parcela: Parcela) => void;
  onEditParcela: (parcela: Parcela) => void;
  onEdit: (divida: DividaWithParcelas) => void;
  onAdvance: (divida: DividaWithParcelas) => void;
  onRemove: (id: string) => void;
  onRestore: (id: string) => void;
  onDeletePermanent: (id: string) => void;
  onOpenCard: (cardId: string, purchaseId: string) => void;
};

type GroupMode = "pessoa" | "tipo" | "origem" | "custom";
const ORIGIN_LABELS = { manual: "Dívidas pessoais", cartao: "Cartões", cnpj_das: "DAS / CNPJ" };

function groupKey(item: DividaViewItem, mode: GroupMode) {
  return mode === "pessoa" ? item.pessoaId : mode === "tipo" ? item.tipo : item.origin;
}

export function EssentialDebtList(props: Props) {
  const [mode, setMode] = useState<GroupMode>("pessoa");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DebtGroup | null>(null);
  const customGroupsQuery = useQuery<DebtGroup[]>({
    queryKey: ["/api/debt-groups"],
    queryFn: async () => (await apiRequest("GET", "/api/debt-groups")).json(),
  });
  const customGroups = customGroupsQuery.data ?? [];
  const { highlightedId, items } = props;
  useEffect(() => {
    if (!highlightedId || mode === "custom") return;
    const highlighted = items.find(item => item.sourceId === highlightedId);
    if (highlighted) setSelected(groupKey(highlighted, mode));
  }, [highlightedId, items, mode]);

  const groups = new Map<string, { label: string; items: DividaViewItem[] }>();
  if (mode === "custom") {
    for (const group of customGroups) {
      groups.set(group.id, { label: group.name, items: items.filter(item => group.debtIds.includes(item.id)) });
    }
  } else {
  for (const item of items) {
    const key = groupKey(item, mode);
    const label = mode === "pessoa" ? props.getName(item.pessoaId) : mode === "tipo" ? (item.tipo === "pagar" ? "A pagar" : "A receber") : ORIGIN_LABELS[item.origin];
    const group = groups.get(key) ?? { label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  }
  const current = selected === null ? null : groups.get(selected);
  const visibleItems = selected === null ? [] : current?.items ?? [];

  return <div className="space-y-3" data-testid="dividas-essential-list">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
      {selected !== null ? <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos grupos</Button> : <div><h2 className="font-semibold">Suas dívidas organizadas</h2><p className="mt-1 text-sm text-muted-foreground">Escolha um grupo para ver as dívidas.</p></div>}
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {!props.removed && <Button variant="outline" size="sm" onClick={() => { setEditingGroup(null); setDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />Criar grupo</Button>}
      <Select value={mode} onValueChange={(value) => { setMode(value as GroupMode); setSelected(null); }}>
        <SelectTrigger className="w-full rounded-xl sm:w-[180px]" aria-label="Agrupar dívidas por"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="pessoa">Por pessoa</SelectItem><SelectItem value="tipo">Por tipo</SelectItem><SelectItem value="origem">Por origem</SelectItem><SelectItem value="custom">Meus grupos</SelectItem></SelectContent>
      </Select>
      </div>
    </div>
    {mode !== "custom" && groups.size === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma dívida encontrada. Ajuste os filtros, registre uma dívida ou crie um grupo.</p>}
    {mode === "custom" && customGroupsQuery.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando seus grupos...</p>}
    {mode === "custom" && customGroupsQuery.isError && <div role="alert" className="rounded-xl border p-4 text-sm">Não foi possível carregar seus grupos. <Button variant="ghost" onClick={() => customGroupsQuery.refetch()}>Tentar novamente</Button></div>}
    {mode === "custom" && !customGroupsQuery.isLoading && !customGroupsQuery.isError && customGroups.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center"><h3 className="font-medium">Seu primeiro grupo</h3><p className="mt-2 text-sm text-muted-foreground">Use “Criar grupo” para reunir dívidas de casa, família ou outros assuntos.</p></div>}
    {mode === "custom" && selected && !props.removed && <Button variant="outline" size="sm" onClick={() => { setEditingGroup(customGroups.find(group => group.id === selected) ?? null); setDialogOpen(true); }}>Editar grupo e dívidas</Button>}
    <DebtGroupDialog open={dialogOpen} group={editingGroup} items={props.allItems} getName={props.getName} onClose={() => setDialogOpen(false)} onSaved={(group) => { setDialogOpen(false); setMode("custom"); setSelected(group.id); }} />
    {selected === null ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="debt-groups">
      {Array.from(groups.entries()).sort(([, a], [, b]) => a.label.localeCompare(b.label, "pt-BR")).map(([key, group]) => {
        const pending = group.items.filter(item => item.status !== "pago");
        const pagar = pending.filter(item => item.tipo === "pagar").reduce((sum, item) => sum + item.valorPendente, 0);
        const receber = pending.filter(item => item.tipo === "receber").reduce((sum, item) => sum + item.valorPendente, 0);
        const overdue = pending.filter(item => item.status === "vencido" || item.parcelasVencidas > 0).length;
        const Icon = mode === "pessoa" ? Users : Layers;
        return <button key={key} type="button" onClick={() => setSelected(key)} className="group rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`debt-group-${mode}-${key}`}>
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1 break-words font-semibold">{group.label}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>
          <p className="mt-4 text-sm text-muted-foreground">{group.items.length} dívida{group.items.length === 1 ? "" : "s"} · {pending.length} em aberto</p>
          <div className="mt-3 space-y-1 text-sm">
            {pagar > 0 && <p className="flex flex-wrap justify-between gap-2"><span className="text-muted-foreground">A pagar</span><span className="font-semibold tabular-nums">{formatDividaCurrency(pagar)}</span></p>}
            {receber > 0 && <p className="flex flex-wrap justify-between gap-2"><span className="text-muted-foreground">A receber</span><span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatDividaCurrency(receber)}</span></p>}
            {pending.length === 0 && <p className="text-muted-foreground">{group.items.length ? "Tudo quitado" : "Nenhuma dívida nesta visualização"}</p>}
            {pending.some(item => item.tipo === "receber" && !item.expectativaRecebimento) && <p className="text-xs text-muted-foreground">Inclui valores sem previsão de recebimento.</p>}
          </div>
          {overdue > 0 && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{overdue} dívida{overdue === 1 ? "" : "s"} em atraso</p>}
        </button>;
      })}
    </div> : <div className="rounded-xl bg-muted/40 px-4 py-3"><h2 className="font-semibold">{current?.label ?? "Nenhuma dívida neste grupo"}</h2><p className="mt-1 text-sm text-muted-foreground">{visibleItems.length} dívida{visibleItems.length === 1 ? "" : "s"} encontrada{visibleItems.length === 1 ? "" : "s"}</p></div>}
    {visibleItems.map(item => {
      const debt = item.manual;
      const paid = item.status === "pago";
      const overdue = item.status === "vencido" || item.parcelasVencidas > 0;
      const receivable = item.tipo === "receber";
      const Icon = receivable ? ArrowDownLeft : ArrowUpRight;
      const next = debt?.parcelas.find(p => p.status === "pendente");
      const label = props.removed ? "Removida" : paid ? "Quitada" : !item.expectativaRecebimento && receivable ? "Sem previsão de recebimento" : overdue ? "Em atraso" : "Em aberto";
      return <article key={item.id} className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${props.highlightedId === item.sourceId ? "ring-2 ring-primary/40" : "border-border/60"}`} data-testid={`essential-debt-${item.id}`}>
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${receivable ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}><Icon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="break-words font-semibold">{props.getName(item.pessoaId)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{receivable ? "A receber" : "A pagar"} · <span className={overdue && !paid ? "font-medium text-red-600 dark:text-red-400" : ""}>{label}</span></p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{formatDividaCurrency(paid ? item.valorTotal : item.valorPendente)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{paid ? "Valor quitado" : "Saldo pendente"}</p>
              </div>
            </div>
            {item.descricao && <p className="mt-3 break-words text-sm text-muted-foreground">{item.descricao}</p>}
            {!paid && <p className="mt-2 text-sm text-muted-foreground">{next ? `Próxima parcela: ${formatDividaCurrency(Number(next.valor))} · ${formatDividaDate(next.dataVencimento)}` : item.dataReferencia ? `Vencimento: ${formatDividaDate(item.dataReferencia)}` : "Sem vencimento definido"}</p>}
          </div>
          {debt && !props.removed && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Mais ações para ${props.getName(item.pessoaId)}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => props.onEdit(debt)}><Pencil className="mr-2 h-4 w-4" />Editar dívida</DropdownMenuItem>
              {!!debt.parcelas.length && !paid && <DropdownMenuItem onSelect={() => props.onAdvance(debt)}><FastForward className="mr-2 h-4 w-4" />Antecipar parcelas</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => props.onRemove(debt.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Remover dívida</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
        {debt && !props.removed && <details className="group border-t border-border/50" open={props.highlightedId === debt.id ? true : undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium sm:px-5 [&::-webkit-details-marker]:hidden">
            <span>{debt.parcelas.length ? `Ver parcelas · ${item.parcelasPagas} de ${item.parcelasTotal} pagas` : "Ver detalhes"}</span><ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-4 pb-4 sm:px-5">
            <p className="text-sm text-muted-foreground">Total da dívida: {formatDividaCurrency(item.valorTotal)}{item.origin === "cnpj_das" ? " · DAS / CNPJ" : ""}</p>
            {debt.parcelas.length ? debt.parcelas.map(parcela => <ParcelaRow key={parcela.id} parcela={parcela} onPay={props.onPay} onEdit={props.onEditParcela} isPaying={props.paying} />) : <p className="text-sm text-muted-foreground">{paid ? `Pago em ${formatDividaDate(debt.dataPagamento)}` : `Vencimento: ${formatDividaDate(debt.dataVencimento)}`}</p>}
            <Button variant="outline" size="sm" onClick={() => props.onEdit(debt)}>Editar dívida</Button>
          </div>
        </details>}
        {item.compraCartao && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-3 sm:px-5"><span className="text-xs text-muted-foreground">Cartão · {item.parcelasPagas} de {item.parcelasTotal} reembolsadas</span><Button variant="ghost" size="sm" onClick={() => props.onOpenCard(item.compraCartao!.cartaoId, item.compraCartao!.id)}>Ver compra</Button></div>}
        {debt && props.removed && <div className="flex flex-wrap justify-end gap-2 border-t p-3"><Button variant="outline" size="sm" onClick={() => props.onRestore(debt.id)}><RotateCcw className="mr-2 h-4 w-4" />Restaurar</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => props.onDeletePermanent(debt.id)}>Excluir para sempre</Button></div>}
      </article>;
    })}
  </div>;
}
