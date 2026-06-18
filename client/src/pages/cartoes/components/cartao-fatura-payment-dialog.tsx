import { useEffect, useMemo, useRef, useState } from "react";
import type { Cartao } from "@shared/schema";
import type { CardInvoiceSnapshot } from "@shared/card-invoice-payments";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CartaoFaturaPagamentoApiModel,
  RegisterCartaoFaturaPagamentoPayload,
} from "@/services/api/cartoes";
import { formatIsoDateToBR } from "@/utils/formatters";

type CartaoFaturaPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartao: Cartao | null;
  monthReference: string;
  snapshot: CardInvoiceSnapshot | null;
  payments: CartaoFaturaPagamentoApiModel[];
  isPending: boolean;
  formatCurrency: (value: number) => string;
  formatMonthLabel: (monthReference: string) => string;
  onSubmit: (payload: RegisterCartaoFaturaPagamentoPayload) => void;
};

const STATUS_LABELS: Record<CardInvoiceSnapshot["status"], string> = {
  aberta: "Aberta",
  parcialmente_paga: "Parcialmente paga",
  paga: "Paga",
  vencida: "Vencida",
  vencida_parcialmente_paga: "Vencida parcialmente paga",
};

const STATUS_CLASSNAMES: Record<CardInvoiceSnapshot["status"], string> = {
  aberta: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  parcialmente_paga: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  paga: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  vencida: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
  vencida_parcialmente_paga: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
};

function formatAmountInput(value: number): string {
  return value.toFixed(2);
}

export function CartaoFaturaPaymentDialog({
  open,
  onOpenChange,
  cartao,
  monthReference,
  snapshot,
  payments,
  isPending,
  formatCurrency,
  formatMonthLabel,
  onSubmit,
}: CartaoFaturaPaymentDialogProps) {
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [dataPagamento, setDataPagamento] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setValorPago(snapshot?.remainingAmount ? formatAmountInput(snapshot.remainingAmount) : "");
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setObservacao("");
  }, [open, snapshot?.remainingAmount]);

  const sortedPayments = useMemo(
    () => [...payments].sort((left, right) => (
      right.dataPagamento.localeCompare(left.dataPagamento)
      || right.createdAt.localeCompare(left.createdAt)
    )),
    [payments],
  );

  const canSubmit = Boolean(
    cartao
    && snapshot
    && snapshot.remainingAmount > 0
    && valorPago.trim().length > 0
    && dataPagamento,
  );

  const submitLabel = snapshot?.remainingAmount && Number(valorPago || 0) >= snapshot.remainingAmount
    ? snapshot.status === "vencida" || snapshot.status === "vencida_parcialmente_paga"
      ? "Marcar fatura atual como paga"
      : "Quitar fatura"
    : "Registrar pagamento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Pagamento de fatura</DialogTitle>
          <DialogDescription className="sr-only">
            Registre pagamento total ou parcial da fatura selecionada e consulte o histórico dos pagamentos já lançados.
          </DialogDescription>
        </DialogHeader>

        {!cartao || !snapshot ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Nenhuma fatura selecionada para pagamento.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{cartao.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Competência {formatMonthLabel(monthReference)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={STATUS_CLASSNAMES[snapshot.status]}
                >
                  {STATUS_LABELS[snapshot.status]}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">Valor original da fatura</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrency(snapshot.originalTotal)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-emerald-500/5 p-3">
                  <p className="text-[11px] text-muted-foreground">Valor já pago</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-600">{formatCurrency(snapshot.amountPaid)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-amber-500/5 p-3">
                  <p className="text-[11px] text-muted-foreground">Valor restante</p>
                  <p className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {formatCurrency(snapshot.remainingAmount)}
                  </p>
                </div>
              </div>
            </div>

            {snapshot.remainingAmount > 0 ? (
              <div className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setValorPago(formatAmountInput(snapshot.remainingAmount));
                      amountInputRef.current?.focus();
                    }}
                  >
                    Pagar saldo restante
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setValorPago("");
                      amountInputRef.current?.focus();
                    }}
                  >
                    Informar pagamento parcial
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cartao-fatura-valor">Valor pago</Label>
                    <Input
                      id="cartao-fatura-valor"
                      ref={amountInputRef}
                      value={valorPago}
                      onChange={(event) => setValorPago(event.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      data-testid="input-cartao-fatura-valor"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cartao-fatura-data">Data de pagamento</Label>
                    <Input
                      id="cartao-fatura-data"
                      type="date"
                      value={dataPagamento}
                      onChange={(event) => setDataPagamento(event.target.value)}
                      data-testid="input-cartao-fatura-data"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cartao-fatura-observacao">Observação</Label>
                  <Textarea
                    id="cartao-fatura-observacao"
                    value={observacao}
                    onChange={(event) => setObservacao(event.target.value)}
                    placeholder="Opcional"
                    className="min-h-[88px] resize-y"
                    data-testid="input-cartao-fatura-observacao"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Pagamento da fatura do cartão não altera o status de reembolso da pessoa vinculada à compra.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Esta fatura já está quitada. Você ainda pode consultar o histórico abaixo.
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-border/60 bg-card/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Histórico de pagamentos</p>
                  <p className="text-xs text-muted-foreground">
                    {sortedPayments.length === 0
                      ? "Nenhum pagamento registrado para esta competência."
                      : `${sortedPayments.length} registro(s) encontrado(s).`}
                  </p>
                </div>
              </div>

              {sortedPayments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                  Nenhum pagamento registrado até agora.
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {formatIsoDateToBR(payment.dataPagamento)} · {formatCurrency(Number(payment.valorPago))}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-border/60 bg-background/80 text-muted-foreground">
                            {payment.tipoPagamento === "quitacao_total" ? "Quitação total" : "Pagamento parcial"}
                          </Badge>
                          {payment.considerarNoSaldoCompetencia === false ? (
                            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              Conciliado na fatura
                            </Badge>
                          ) : null}
                        </div>
                        {payment.observacao ? (
                          <p className="mt-2 text-xs text-muted-foreground break-words">{payment.observacao}</p>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Lançado em {formatIsoDateToBR(payment.createdAt.slice(0, 10))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          {snapshot?.remainingAmount && snapshot.remainingAmount > 0 ? (
            <Button
              type="button"
              onClick={() => onSubmit({
                valorPago,
                dataPagamento,
                observacao: observacao.trim() || null,
              })}
              disabled={!canSubmit || isPending}
              data-testid="button-submit-cartao-fatura-pagamento"
            >
              {isPending ? "Salvando..." : submitLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
