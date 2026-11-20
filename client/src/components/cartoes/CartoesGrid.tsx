import type { Cartao, CompraCartao } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { CartaoCard } from "@/components/cartoes/CartaoCard";
import { ProjectedServicesNotice } from "@/components/cartoes/ProjectedServicesNotice";
import { CircleHelp } from "lucide-react";

type CartoesTab = "resumo" | "compras";

type CartoesGridProps = {
  cartoes: Cartao[];
  cartoesTab: CartoesTab;
  getCardTotal: (cartaoId: string) => number;
  getCardProjectedServicesTotal: (cartaoId: string) => number;
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getCardCompras: (cartaoId: string) => CompraCartao[];
  formatCartaoCurrency: (value: number) => string;
  onOpenCompras: (cartaoId: string) => void;
  onOpenServices: () => void;
  invoiceMonthLabel: string;
  canOpenInvoicePaymentDialog: (cartaoId: string) => boolean;
  getInvoicePaymentActionLabel: (cartaoId: string) => string;
  onOpenInvoicePaymentDialog: (cartaoId: string) => void;
  resolveCardIconId: (cartao: Cartao) => string | null;
};

export function CartoesGrid({
  cartoes,
  cartoesTab,
  getCardTotal,
  getCardProjectedServicesTotal,
  getCardUsedLimit,
  getCardAvailableLimit,
  formatCartaoCurrency,
  onOpenCompras,
  onOpenServices,
  invoiceMonthLabel,
  canOpenInvoicePaymentDialog,
  getInvoicePaymentActionLabel,
  onOpenInvoicePaymentDialog,
  resolveCardIconId,
}: CartoesGridProps) {
  const comprometidoTooltip =
    "Comprometido considera parcelas abertas atuais, vencidas e futuras.";

  if (cartoes.length === 0 || cartoesTab === "compras") return null;

  if (cartoesTab === "resumo") {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cartoes.map((cartao) => {
          const limite = Number(cartao.limite) || 0;
          const faturaAtual = getCardTotal(cartao.id);
          const servicosPrevistos = getCardProjectedServicesTotal(cartao.id);
          const comprometido = getCardUsedLimit(cartao.id);
          const limiteDisponivel = getCardAvailableLimit(cartao.id);
          const percentualRaw = limite > 0 ? (comprometido / limite) * 100 : 0;
          const percentual = Math.max(0, Math.min(percentualRaw, 100));
          const isCritical = percentualRaw >= 90;
          const isWarning = percentualRaw >= 75 && percentualRaw < 90;
          const barColorClass = isCritical
            ? "[&>div]:bg-red-500"
            : isWarning
              ? "[&>div]:bg-amber-500"
              : "[&>div]:bg-emerald-500";

          return (
            <CartaoCard key={cartao.id} className="rounded-[24px]" contentClassName="space-y-3 p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-center gap-3">
                  <BrandIconDisplay name={cartao.nome} iconeId={resolveCardIconId(cartao)} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight break-words sm:text-base">{cartao.nome}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Vencimento: dia {cartao.diaVencimento}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 rounded-xl px-3 text-xs"
                  onClick={() => onOpenCompras(cartao.id)}
                  data-testid={`button-open-cartao-compras-${cartao.id}`}
                >
                  Ver compras
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-muted-foreground">Fatura · {invoiceMonthLabel}</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]">
                    {formatCartaoCurrency(faturaAtual)}
                  </p>
                </div>
                <Button
                  className="min-h-11 shrink-0 rounded-xl px-4"
                  disabled={!canOpenInvoicePaymentDialog(cartao.id)}
                  onClick={() => onOpenInvoicePaymentDialog(cartao.id)}
                  aria-label={`${getInvoicePaymentActionLabel(cartao.id)} — ${cartao.nome}`}
                  data-testid={`button-pay-cartao-${cartao.id}`}
                >
                  {getInvoicePaymentActionLabel(cartao.id)}
                </Button>
                </div>

                <ProjectedServicesNotice
                  amount={servicosPrevistos}
                  formatCurrency={formatCartaoCurrency}
                  onOpenServices={onOpenServices}
                  testId={`projected-services-summary-${cartao.id}`}
                />

                <div className="space-y-2 border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      Limite consumido
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Explicação do limite consumido">
                            <CircleHelp className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">{comprometidoTooltip}</TooltipContent>
                      </Tooltip>
                    </span>
                    <span className={isCritical ? "font-semibold text-red-600 dark:text-red-400" : isWarning ? "font-semibold text-amber-600 dark:text-amber-400" : "font-semibold text-foreground"}>{percentualRaw.toFixed(0)}%</span>
                  </div>
                  <Progress value={percentual} className={`h-1.5 ${barColorClass}`} aria-label="Percentual do limite consumido" />
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Consumido</p>
                      <p className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatCartaoCurrency(comprometido)}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-muted-foreground">Disponível estimado</p>
                      <p className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatCartaoCurrency(limiteDisponivel)}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Limite total: {formatCartaoCurrency(limite)}</p>
                </div>
              </div>
            </CartaoCard>
          );
        })}
      </div>
    );
  }

  return null;
}
