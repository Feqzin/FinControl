import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Parcela } from "@shared/schema";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return d;
  }
}

function isOverdueDate(d?: string | null) {
  if (!d) return false;
  try {
    return isPast(parseISO(`${d}T23:59:59`));
  } catch {
    return false;
  }
}

export function ParcelaRow({
  parcela,
  onPay,
  onEdit,
  isPaying,
}: {
  parcela: Parcela;
  onPay: (parcela: Parcela) => void;
  onEdit: (parcela: Parcela) => void;
  isPaying: boolean;
}) {
  const overdue = parcela.status === "pendente" && isOverdueDate(parcela.dataVencimento);

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-md text-sm ${
        parcela.status === "pago"
          ? "bg-emerald-500/5"
          : overdue
            ? "bg-red-500/5 border border-red-500/20"
            : "bg-muted/30"
      }`}
      data-testid={`row-parcela-${parcela.id}`}
    >
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          parcela.status === "pago"
            ? "bg-emerald-500 text-white"
            : overdue
              ? "bg-red-500 text-white"
              : "bg-muted-foreground/20 text-muted-foreground"
        }`}
      >
        {parcela.status === "pago" ? <Check className="w-3 h-3" /> : parcela.numero}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{formatCurrency(Number(parcela.valor))}</span>
          <span className="text-muted-foreground">
            {parcela.status === "pago"
              ? `Pago em ${formatDate(parcela.dataPagamento!)}${parcela.formaPagamento ? ` via ${parcela.formaPagamento}` : ""}`
              : `Venc. ${formatDate(parcela.dataVencimento)}${overdue ? " · ATRASADO" : ""}`}
          </span>
        </div>
      </div>
      {parcela.status === "pendente" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(parcela)}
            data-testid={`button-edit-parcela-${parcela.id}`}
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPay(parcela)}
            disabled={isPaying}
            data-testid={`button-pay-parcela-${parcela.id}`}
          >
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          </Button>
        </div>
      )}
    </div>
  );
}

