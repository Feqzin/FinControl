import type { Cartao, CompraCartao } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2 } from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { CartaoCard } from "@/components/cartoes/CartaoCard";

type CartoesTab = "resumo" | "fatura" | "compras" | "parcelas" | "limite";

type CartoesGridProps = {
  cartoes: Cartao[];
  cartoesTab: CartoesTab;
  getCardTotal: (cartaoId: string) => number;
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getCardCompras: (cartaoId: string) => CompraCartao[];
  getFilteredCardCompras: (cartaoId: string) => CompraCartao[];
  formatCartaoCurrency: (value: number) => string;
  onOpenCompras: (cartaoId: string) => void;
  onOpenParcelas: (compra: CompraCartao) => void;
  onDeleteCompra: (compra: CompraCartao) => void;
};

export function CartoesGrid({
  cartoes,
  cartoesTab,
  getCardTotal,
  getCardUsedLimit,
  getCardAvailableLimit,
  getCardCompras,
  getFilteredCardCompras,
  formatCartaoCurrency,
  onOpenCompras,
  onOpenParcelas,
  onDeleteCompra,
}: CartoesGridProps) {
  if (cartoes.length === 0 || cartoesTab === "compras") return null;

  if (cartoesTab === "resumo") {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cartoes.map((cartao) => {
          const faturaAtual = getCardTotal(cartao.id);
          const limiteDisponivel = getCardAvailableLimit(cartao.id);
          const totalCompras = getCardCompras(cartao.id).length;

          return (
            <CartaoCard key={cartao.id} contentClassName="space-y-3.5 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 flex items-center gap-3">
                  <BrandIconDisplay name={cartao.nome} iconeId={cartao.iconeId} size="sm" />
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
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Disponível</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCartaoCurrency(limiteDisponivel)}</p>
                </div>
              </div>
            </CartaoCard>
          );
        })}
      </div>
    );
  }

  if (cartoesTab === "fatura") {
    return (
      <div className="space-y-3">
        {cartoes.map((cartao) => {
          const comprasFiltradas = getFilteredCardCompras(cartao.id);
          return (
            <CartaoCard key={cartao.id} contentClassName="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{cartao.nome}</p>
                <Badge variant="outline">{formatCartaoCurrency(getCardTotal(cartao.id))}</Badge>
              </div>
              {comprasFiltradas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma compra encontrada para o filtro.</p>
              ) : (
                <div className="space-y-2">
                  {comprasFiltradas.slice(0, 12).map((compra) => (
                    <div key={compra.id} className="fintech-surface-subtle touch-feedback flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{compra.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {compra.parcelaAtual}/{compra.parcelas}x · {compra.dataCompra}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatCartaoCurrency(Number(compra.valorParcela))}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onDeleteCompra(compra)}
                          data-testid={`button-delete-compra-fatura-${compra.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CartaoCard>
          );
        })}
      </div>
    );
  }

  if (cartoesTab === "parcelas") {
    return (
      <div className="space-y-3">
        {cartoes.map((cartao) => {
          const comprasFiltradas = getFilteredCardCompras(cartao.id);
          return (
            <CartaoCard key={cartao.id} contentClassName="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{cartao.nome}</p>
                <Badge variant="secondary">{comprasFiltradas.length} compra(s)</Badge>
              </div>
              {comprasFiltradas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma compra encontrada para o filtro.</p>
              ) : (
                <div className="space-y-2">
                  {comprasFiltradas.slice(0, 12).map((compra) => (
                    <div key={compra.id} className="fintech-surface-subtle touch-feedback flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{compra.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          Parcela atual {compra.parcelaAtual}/{compra.parcelas}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenParcelas(compra)}
                          data-testid={`button-open-parcelas-tab-${compra.id}`}
                        >
                          Ver parcelas
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onDeleteCompra(compra)}
                          data-testid={`button-delete-compra-parcelas-tab-${compra.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CartaoCard>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cartoes.map((cartao) => {
        const limite = Number(cartao.limite);
        const comprometido = getCardUsedLimit(cartao.id);
        const disponivel = getCardAvailableLimit(cartao.id);
        const percentual = limite > 0 ? Math.min((comprometido / limite) * 100, 100) : 0;
        return (
          <CartaoCard key={cartao.id} contentClassName="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{cartao.nome}</p>
              <Badge variant={percentual >= 85 ? "destructive" : percentual >= 65 ? "secondary" : "default"}>
                {percentual.toFixed(0)}%
              </Badge>
            </div>
            <Progress value={percentual} className="h-2" />
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div className="fintech-stat-card p-2">
                <p className="text-muted-foreground">Limite</p>
                <p className="font-semibold">{formatCartaoCurrency(limite)}</p>
              </div>
              <div className="fintech-stat-card p-2">
                <p className="text-muted-foreground">Comprom.</p>
                <p className="font-semibold">{formatCartaoCurrency(comprometido)}</p>
              </div>
              <div className="fintech-stat-card bg-emerald-500/5 p-2">
                <p className="text-muted-foreground">Disponível</p>
                <p className="font-semibold text-emerald-600">{formatCartaoCurrency(disponivel)}</p>
              </div>
            </div>
          </CartaoCard>
        );
      })}
    </div>
  );
}

