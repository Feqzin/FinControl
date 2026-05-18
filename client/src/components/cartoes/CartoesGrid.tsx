import type { Cartao, CompraCartao } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { CartaoCard } from "@/components/cartoes/CartaoCard";

type CartoesTab = "resumo" | "compras";

type CartoesGridProps = {
  cartoes: Cartao[];
  cartoesTab: CartoesTab;
  getCardTotal: (cartaoId: string) => number;
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getCardCompras: (cartaoId: string) => CompraCartao[];
  formatCartaoCurrency: (value: number) => string;
  onOpenCompras: (cartaoId: string) => void;
  resolveCardIconId: (cartao: Cartao) => string | null;
};

export function CartoesGrid({
  cartoes,
  cartoesTab,
  getCardTotal,
  getCardUsedLimit,
  getCardAvailableLimit,
  getCardCompras,
  formatCartaoCurrency,
  onOpenCompras,
  resolveCardIconId,
}: CartoesGridProps) {
  if (cartoes.length === 0 || cartoesTab === "compras") return null;

  if (cartoesTab === "resumo") {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cartoes.map((cartao) => {
          const limite = Number(cartao.limite) || 0;
          const faturaAtual = getCardTotal(cartao.id);
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
            <CartaoCard key={cartao.id} contentClassName="space-y-3.5 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 flex items-center gap-3">
                  <BrandIconDisplay name={cartao.nome} iconeId={resolveCardIconId(cartao)} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold leading-tight">{cartao.nome}</p>
                    <p className="text-xs text-muted-foreground">{totalCompras} compra(s) parcelada(s)</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full touch-feedback px-4 sm:w-auto sm:justify-self-end"
                  onClick={() => onOpenCompras(cartao.id)}
                  data-testid={`button-open-cartao-compras-${cartao.id}`}
                >
                  Ver compras
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="fintech-stat-card flex min-h-[90px] flex-col justify-center p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fatura atual</p>
                  <p className="text-xl font-bold">{formatCartaoCurrency(faturaAtual)}</p>
                </div>
                <div className="fintech-stat-card flex min-h-[90px] flex-col justify-center bg-emerald-500/5 p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Disponível atual</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCartaoCurrency(limiteDisponivel)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Uso do limite</span>
                  <span
                    className={isCritical ? "font-semibold text-red-600" : isWarning ? "font-semibold text-amber-600" : "font-semibold text-foreground"}
                  >
                    {percentualRaw.toFixed(0)}%
                  </span>
                </div>
                <Progress value={percentual} className={`h-1.5 ${barColorClass}`} />
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Limite</p>
                    <p className="truncate font-semibold">{formatCartaoCurrency(limite)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Usado</p>
                    <p className="truncate font-semibold">{formatCartaoCurrency(comprometido)}</p>
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
