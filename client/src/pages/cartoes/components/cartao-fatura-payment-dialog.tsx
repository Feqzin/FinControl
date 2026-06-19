import { useEffect, useMemo, useRef, useState } from "react";
import type { Cartao } from "@shared/schema";
import { getInvoicePaymentAuditStatus, type CardInvoiceSnapshot } from "@shared/card-invoice-payments";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type {
  CartaoFaturaPagamentoApiModel,
  RegisterCartaoFaturaPagamentoPayload,
} from "@/services/api/cartoes";
import { parseMoney } from "@/lib/money";
import { formatIsoDateToBR } from "@/utils/formatters";

type InvoiceInstallmentModel = {
  parcelaCompraId: string;
  compraCartaoId: string;
  descricao: string;
  numero: number;
  valor: number;
  valorPagoAtual: number;
  valorPendente: number;
  status: "pendente" | "parcialmente_pago" | "pago";
};

type CartaoFaturaPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartao: Cartao | null;
  monthReference: string;
  snapshot: CardInvoiceSnapshot | null;
  payments: CartaoFaturaPagamentoApiModel[];
  installments: InvoiceInstallmentModel[];
  isPending: boolean;
  cancelPendingPaymentId?: string | null;
  formatCurrency: (value: number) => string;
  formatMonthLabel: (monthReference: string) => string;
  onSubmit: (payload: RegisterCartaoFaturaPagamentoPayload) => void;
  onCancelPayment: (paymentId: string) => void;
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

const ALOCACAO_LABELS: Record<
  NonNullable<CartaoFaturaPagamentoApiModel["modoAlocacao"]>,
  string
> = {
  ordem_fatura: "Ordem da fatura",
  menores_primeiro: "Menores primeiro",
  maiores_primeiro: "Maiores primeiro",
  manual: "Manual",
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
  installments,
  isPending,
  cancelPendingPaymentId,
  formatCurrency,
  formatMonthLabel,
  onSubmit,
  onCancelPayment,
}: CartaoFaturaPaymentDialogProps) {
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [dataPagamento, setDataPagamento] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [observacao, setObservacao] = useState("");
  const [modoAlocacao, setModoAlocacao] = useState<RegisterCartaoFaturaPagamentoPayload["modoAlocacao"]>("ordem_fatura");
  const [aplicarRestanteAutomaticamente, setAplicarRestanteAutomaticamente] = useState(false);
  const [manualSelections, setManualSelections] = useState<Record<string, boolean>>({});
  const [paymentPendingCancelConfirm, setPaymentPendingCancelConfirm] = useState<CartaoFaturaPagamentoApiModel | null>(null);

  useEffect(() => {
    if (!open) return;
    setValorPago(snapshot?.remainingAmount ? formatAmountInput(snapshot.remainingAmount) : "");
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setObservacao("");
    setModoAlocacao("ordem_fatura");
    setAplicarRestanteAutomaticamente(false);
    setManualSelections({});
    setPaymentPendingCancelConfirm(null);
  }, [open, snapshot?.remainingAmount]);

  useEffect(() => {
    if (!paymentPendingCancelConfirm) return;
    const updatedPayment = payments.find((payment) => payment.id === paymentPendingCancelConfirm.id);
    if (updatedPayment && getInvoicePaymentAuditStatus(updatedPayment) === "cancelado") {
      setPaymentPendingCancelConfirm(null);
    }
  }, [paymentPendingCancelConfirm, payments]);

  const sortedPayments = useMemo(
    () => [...payments].sort((left, right) => (
      right.dataPagamento.localeCompare(left.dataPagamento)
      || right.createdAt.localeCompare(left.createdAt)
    )),
    [payments],
  );

  const installmentsById = useMemo(
    () => new Map(installments.map((installment) => [installment.parcelaCompraId, installment])),
    [installments],
  );

  const requestedPaymentAmount = parseMoney(valorPago) ?? 0;
  const manualInstallments = useMemo(
    () => installments.filter((installment) => manualSelections[installment.parcelaCompraId]),
    [installments, manualSelections],
  );
  const manualSelectedOutstandingTotal = manualInstallments.reduce(
    (sum, installment) => sum + installment.valorPendente,
    0,
  );
  const manualRemainingGap = Math.max(0, requestedPaymentAmount - manualSelectedOutstandingTotal);

  const canSubmit = Boolean(
    cartao
    && snapshot
    && snapshot.remainingAmount > 0
    && valorPago.trim().length > 0
    && dataPagamento
    && (
      modoAlocacao !== "manual"
      || (
        manualInstallments.length > 0
        && (aplicarRestanteAutomaticamente || manualRemainingGap <= 0)
      )
    ),
  );

  const submitLabel = snapshot?.remainingAmount && requestedPaymentAmount >= snapshot.remainingAmount
    ? snapshot.status === "vencida" || snapshot.status === "vencida_parcialmente_paga"
      ? "Marcar fatura atual como paga"
      : "Quitar fatura"
    : "Registrar pagamento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Pagamento de fatura</DialogTitle>
          <DialogDescription className="sr-only">
            Registre pagamento total ou parcial da fatura selecionada, defina como o valor será aplicado nas parcelas da competência e consulte o histórico dos pagamentos já lançados.
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

                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
                  <div>
                    <p className="text-sm font-medium">Aplicar pagamento em</p>
                    <p className="text-xs text-muted-foreground">
                      Escolha como o valor deve ser distribuído entre as parcelas abertas desta competência.
                    </p>
                  </div>

                  <RadioGroup
                    value={modoAlocacao}
                    onValueChange={(value) => setModoAlocacao(value as NonNullable<RegisterCartaoFaturaPagamentoPayload["modoAlocacao"]>)}
                    className="space-y-2"
                  >
                    {[
                      {
                        value: "ordem_fatura",
                        label: "Automático por ordem da fatura",
                        description: "Quita as primeiras parcelas da fatura na ordem em que aparecem.",
                      },
                      {
                        value: "menores_primeiro",
                        label: "Pagar menores primeiro",
                        description: "Prioriza parcelas menores para quitar mais itens com o mesmo valor.",
                      },
                      {
                        value: "maiores_primeiro",
                        label: "Pagar maiores primeiro",
                        description: "Prioriza as parcelas com maior valor restante.",
                      },
                      {
                        value: "manual",
                        label: "Escolher manualmente",
                        description: "Selecione as parcelas que devem receber o pagamento.",
                      },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3"
                      >
                        <RadioGroupItem value={option.value} className="mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                {modoAlocacao === "manual" ? (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-card/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Parcelas da fatura</p>
                        <p className="text-xs text-muted-foreground">
                          Selecione as parcelas que devem receber o pagamento. Se o valor acabar no meio da seleção, a última ficará parcialmente paga.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={aplicarRestanteAutomaticamente}
                          onCheckedChange={(checked) => setAplicarRestanteAutomaticamente(checked === true)}
                        />
                        Aplicar restante automaticamente
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                        <p className="text-[11px] text-muted-foreground">Valor pago informado</p>
                        <p className="mt-1 text-sm font-semibold">{formatCurrency(requestedPaymentAmount)}</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                        <p className="text-[11px] text-muted-foreground">Selecionado</p>
                        <p className="mt-1 text-sm font-semibold">{formatCurrency(manualSelectedOutstandingTotal)}</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                        <p className="text-[11px] text-muted-foreground">{manualRemainingGap > 0 ? "Sobra sem destino" : "Cobertura selecionada"}</p>
                        <p className={`mt-1 text-sm font-semibold ${manualRemainingGap > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-600"}`}>
                          {formatCurrency(Math.abs(manualRemainingGap))}
                        </p>
                      </div>
                    </div>

                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {installments.map((installment) => (
                        <label
                          key={installment.parcelaCompraId}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3"
                        >
                          <Checkbox
                            checked={manualSelections[installment.parcelaCompraId] === true}
                            onCheckedChange={(checked) => {
                              setManualSelections((previous) => ({
                                ...previous,
                                [installment.parcelaCompraId]: checked === true,
                              }));
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium break-words">{installment.descricao}</p>
                              {installment.status === "pago" ? (
                                <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                  Pago
                                </Badge>
                              ) : installment.status === "parcialmente_pago" ? (
                                <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                  Parcialmente pago
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-border/60 bg-background/80 text-muted-foreground">
                                  Pendente
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Parcela {installment.numero} · valor {formatCurrency(installment.valor)}
                              {" · "}restante {formatCurrency(installment.valorPendente)}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {manualInstallments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Selecione ao menos uma parcela para usar a alocação manual.
                      </p>
                    ) : null}
                    {manualRemainingGap > 0 && !aplicarRestanteAutomaticamente ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Ainda restará {formatCurrency(manualRemainingGap)} sem destino. Ative a aplicação automática do restante ou aumente a seleção manual.
                      </p>
                    ) : null}
                  </div>
                ) : null}

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
                      className={`space-y-2 rounded-lg border px-3 py-3 ${
                        getInvoicePaymentAuditStatus(payment) === "cancelado"
                          ? "border-dashed border-border/50 bg-muted/10 opacity-80"
                          : "border-border/60 bg-muted/15"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {formatIsoDateToBR(payment.dataPagamento)} · {formatCurrency(Number(payment.valorPago))}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline" className="border-border/60 bg-background/80 text-muted-foreground">
                              {payment.tipoPagamento === "quitacao_total" ? "Quitação total" : "Pagamento parcial"}
                            </Badge>
                            <Badge variant="outline" className="border-border/60 bg-background/80 text-muted-foreground">
                              {ALOCACAO_LABELS[payment.modoAlocacao ?? "ordem_fatura"]}
                            </Badge>
                            {getInvoicePaymentAuditStatus(payment) === "cancelado" ? (
                              <Badge variant="outline" className="border-border/60 bg-background/70 text-muted-foreground">
                                Cancelado
                              </Badge>
                            ) : null}
                            {payment.considerarNoSaldoCompetencia === false ? (
                              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                Conciliado na fatura
                              </Badge>
                            ) : null}
                          </div>
                          {payment.observacao ? (
                            <p className="mt-2 text-xs text-muted-foreground break-words">{payment.observacao}</p>
                          ) : null}
                          {getInvoicePaymentAuditStatus(payment) === "cancelado" && payment.canceladoEm ? (
                            <p className="mt-2 text-xs text-muted-foreground break-words">
                              Cancelado em {formatIsoDateToBR(payment.canceladoEm.slice(0, 10))}
                              {payment.motivoCancelamento ? ` · ${payment.motivoCancelamento}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <p className="text-xs text-muted-foreground">
                            Lançado em {formatIsoDateToBR(payment.createdAt.slice(0, 10))}
                          </p>
                          {getInvoicePaymentAuditStatus(payment) !== "cancelado" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setPaymentPendingCancelConfirm(payment)}
                              disabled={isPending || Boolean(cancelPendingPaymentId)}
                            >
                              {cancelPendingPaymentId === payment.id ? "Desfazendo..." : "Desfazer"}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {(payment.alocacoes?.length ?? 0) > 0 ? (
                        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
                          <p className="text-[11px] font-medium text-muted-foreground">Aplicado em</p>
                          <div className="mt-2 space-y-1.5">
                            {(payment.alocacoes ?? []).map((allocation) => {
                              const installment = installmentsById.get(allocation.parcelaCompraId);
                              return (
                                <div
                                  key={allocation.id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                >
                                  <span className="min-w-0 break-words">
                                    {installment
                                      ? `${installment.descricao} · parcela ${installment.numero}`
                                      : `Parcela ${allocation.parcelaCompraId}`}
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {formatCurrency(Number(allocation.valorAplicado))}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
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
                modoAlocacao,
                aplicarRestanteAutomaticamente,
                alocacoesManuais: modoAlocacao === "manual"
                  ? manualInstallments.map((installment) => ({
                    parcelaCompraId: installment.parcelaCompraId,
                  }))
                  : undefined,
              })}
              disabled={!canSubmit || isPending}
              data-testid="button-submit-cartao-fatura-pagamento"
            >
              {isPending ? "Salvando..." : submitLabel}
            </Button>
          ) : null}
        </DialogFooter>

        <AlertDialog
          open={Boolean(paymentPendingCancelConfirm)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !cancelPendingPaymentId) {
              setPaymentPendingCancelConfirm(null);
            }
          }}
        >
          <AlertDialogContent overlayClassName="z-[80]" className="z-[80]">
            <AlertDialogHeader>
              <AlertDialogTitle>Desfazer pagamento</AlertDialogTitle>
              <AlertDialogDescription>
                {paymentPendingCancelConfirm
                  ? `Deseja desfazer este pagamento de ${formatCurrency(Number(paymentPendingCancelConfirm.valorPago))}? As parcelas cobertas por ele voltarão ao estado anterior conforme os outros pagamentos existentes. Essa ação não altera reembolsos de pessoas.`
                  : "Confirme o cancelamento do pagamento selecionado."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(cancelPendingPaymentId)}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!paymentPendingCancelConfirm || isPending || Boolean(cancelPendingPaymentId)}
                onClick={(event) => {
                  event.preventDefault();
                  if (!paymentPendingCancelConfirm) return;
                  onCancelPayment(paymentPendingCancelConfirm.id);
                }}
              >
                {cancelPendingPaymentId === paymentPendingCancelConfirm?.id
                  ? "Desfazendo pagamento..."
                  : "Desfazer pagamento"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
