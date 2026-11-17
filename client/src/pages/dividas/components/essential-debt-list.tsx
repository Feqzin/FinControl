import { ArrowDownLeft, ArrowUpRight, ChevronDown, MoreHorizontal, Pencil, Trash2, FastForward, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Parcela } from "@shared/schema";
import type { DividaWithParcelas } from "@/hooks/useDividas";
import { formatDividaCurrency, formatDividaDate, type DividaViewItem } from "../dividas.utils";
import { ParcelaRow } from "./parcela-row";

type Props = {
  items: DividaViewItem[];
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

export function EssentialDebtList(props: Props) {
  return <div className="space-y-3" data-testid="dividas-essential-list">
    {props.items.map(item => {
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
