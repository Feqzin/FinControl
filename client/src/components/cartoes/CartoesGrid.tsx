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
  resolveCardIconId: (cartao: Cartao) => string | null;
};

export function CartoesGrid({
  cartoes,
  cartoesTab,
  getCardTotal,
  getCardProjectedServicesTotal,
  getCardUsedLimit,
  getCardAvailableLimit,
  getCardCompras,
  formatCartaoCurrency,
  onOpenCompras,
  onOpenServices,
  resolveCardIconId,
}: CartoesGridProps) {
  const comprometidoTooltip =
    "Comprometido considera parcelas abertas atuais, vencidas e futuras.";

  if (cartoes.length === 0 || cartoesTab === "compras") return null;

  if (cartoesTab === "resumo") {
    return (
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {cartoes.map((cartao) => {
          const limite = Number(cartao.limite) || 0;
          const faturaAtual = getCardTotal(cartao.id);
          const servicosPrevistos = getCardProjectedServicesTotal(cartao.id);
          const comprometido = getCardUsedLimit(cartao.id);
          const limiteDisponivel = getCardAvailableLimit(cartao.id);
          const totalCompras = getCardCompras(cartao.id).length;
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex items-center gap-3">
                  <BrandIconDisplay name={cartao.nome} iconeId={resolveCardIconId(cartao)} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight break-words sm:text-base">{cartao.nome}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex rounded-full border border-border/60 bg-muted/25 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {totalCompras} compra(s) parcelada(s)
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 self-start rounded-xl border-border/60 bg-background/80 px-3 text-xs shadow-sm touch-feedback sm:self-auto sm:px-3.5"
                  onClick={() => onOpenCompras(cartao.id)}
                  data-testid={`button-open-cartao-compras-${cartao.id}`}
                >
                  Ver compras
                </Button>
              </div>

              <div className="rounded-[22px] border border-border/50 bg-muted/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Fatura atual</p>
                    <p className="text-lg font-semibold leading-tight [overflow-wrap:anywhere] sm:text-xl">
                      {formatCartaoCurrency(faturaAtual)}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-1 border-t border-border/60 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Disponível estimado</p>
                    <p className="text-lg font-semibold leading-tight text-emerald-600 [overflow-wrap:anywhere] sm:text-xl">
                      {formatCartaoCurrency(limiteDisponivel)}
                    </p>
                  </div>
                </div>

                <ProjectedServicesNotice
                  amount={servicosPrevistos}
                  formatCurrency={formatCartaoCurrency}
                  onOpenServices={onOpenServices}
                  testId={`projected-services-summary-${cartao.id}`}
                />

                <div className="mt-3 space-y-2 rounded-2xl border border-border/50 bg-background/80 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Uso do limite</span>
                    <span
                      className={isCritical ? "font-semibold text-red-600" : isWarning ? "font-semibold text-amber-600" : "font-semibold text-foreground"}
                    >
                      {percentualRaw.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={percentual} className={`h-1.5 ${barColorClass}`} />
                  <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-muted-foreground leading-snug">Limite total cadastrado</p>
                      <p className="font-semibold [overflow-wrap:anywhere]">{formatCartaoCurrency(limite)}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                        <p>Comprometido</p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
                              aria-label="Explicação do valor comprometido"
                            >
                              <CircleHelp className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            {comprometidoTooltip}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="font-semibold [overflow-wrap:anywhere]">{formatCartaoCurrency(comprometido)}</p>
                    </div>
                  </div>
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
