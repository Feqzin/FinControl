import { useEffect, useState } from "react";
import type { Cartao, CompraCartao } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2 } from "lucide-react";
import { BrandIconDisplay } from "@/lib/brand-icons";
import { CartaoCard } from "@/components/cartoes/CartaoCard";

type CartoesTab = "resumo" | "fatura" | "compras";

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
  onDeleteCompra: (compra: CompraCartao) => void;
};

const INITIAL_VISIBLE_ITEMS = 8;
const ITEMS_PER_PAGE = INITIAL_VISIBLE_ITEMS;

type PageByCard = Record<string, number>;

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
  onDeleteCompra,
}: CartoesGridProps) {
  const [faturaPageByCard, setFaturaPageByCard] = useState<PageByCard>({});

  useEffect(() => {
    if (cartoesTab !== "fatura") return;
    setFaturaPageByCard((prev) => {
      const next: PageByCard = {};
      let changed = false;
      for (const cartao of cartoes) {
        const total = getFilteredCardCompras(cartao.id).length;
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        const nextValue = Math.min(prev[cartao.id] ?? 1, totalPages);
        next[cartao.id] = nextValue;
        if ((prev[cartao.id] ?? 1) !== nextValue) {
          changed = true;
        }
      }
      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [cartoes, cartoesTab, getFilteredCardCompras]);

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

  if (cartoesTab === "fatura") {
    return (
      <div className="space-y-3">
        {cartoes.map((cartao) => {
          const comprasFiltradas = getFilteredCardCompras(cartao.id);
          const currentPage = faturaPageByCard[cartao.id] ?? 1;
          const totalPages = Math.max(1, Math.ceil(comprasFiltradas.length / ITEMS_PER_PAGE));
          const safePage = Math.min(currentPage, totalPages);
          const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
          const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, comprasFiltradas.length);
          const visibleCompras = comprasFiltradas.slice(startIndex, endIndex);
          const hasPagination = comprasFiltradas.length > ITEMS_PER_PAGE;
          const maxVisiblePages = 5;
          const pageWindowStart = Math.max(1, safePage - Math.floor(maxVisiblePages / 2));
          const pageWindowEnd = Math.min(totalPages, pageWindowStart + maxVisiblePages - 1);
          const pageNumbers = Array.from(
            { length: Math.max(0, pageWindowEnd - pageWindowStart + 1) },
            (_, idx) => pageWindowStart + idx,
          );

          return (
            <CartaoCard key={cartao.id} contentClassName="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{cartao.nome}</p>
                <Badge variant="outline">{formatCartaoCurrency(getCardTotal(cartao.id))}</Badge>
              </div>
              {comprasFiltradas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma compra encontrada para o filtro.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Mostrando {startIndex + 1}–{endIndex} de {comprasFiltradas.length} compras
                    </span>
                  </div>
                  <div className="space-y-2">
                    {visibleCompras.map((compra) => (
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
                  {hasPagination ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        disabled={safePage <= 1}
                        onClick={() => {
                          setFaturaPageByCard((prev) => ({
                            ...prev,
                            [cartao.id]: Math.max(1, (prev[cartao.id] ?? 1) - 1),
                          }));
                        }}
                        data-testid={`button-paginacao-anterior-fatura-${cartao.id}`}
                      >
                        Anterior
                      </Button>
                      {pageNumbers.map((page) => (
                        <Button
                          key={page}
                          variant={page === safePage ? "default" : "ghost"}
                          size="sm"
                          className="h-8 min-w-8 px-2 text-xs"
                          onClick={() => {
                            setFaturaPageByCard((prev) => ({
                              ...prev,
                              [cartao.id]: page,
                            }));
                          }}
                          data-testid={`button-paginacao-fatura-${cartao.id}-${page}`}
                        >
                          {page}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        disabled={safePage >= totalPages}
                        onClick={() => {
                          setFaturaPageByCard((prev) => ({
                            ...prev,
                            [cartao.id]: Math.min(totalPages, (prev[cartao.id] ?? 1) + 1),
                          }));
                        }}
                        data-testid={`button-paginacao-proxima-fatura-${cartao.id}`}
                      >
                        Próxima
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CartaoCard>
          );
        })}
      </div>
    );
  }

  return null;
}
