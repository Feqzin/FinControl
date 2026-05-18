import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CartaoCard } from "@/components/cartoes/CartaoCard";
import { BrandIconDisplay } from "@/lib/brand-icons";
import type { Cartao, CompraCartao, Servico } from "@shared/schema";
import { Eye, List, Plus, Trash2 } from "lucide-react";
import { getNextInvoiceDate } from "@/pages/cartoes/cartoes.utils";
import type { PurchaseIconMatchResult } from "@/lib/purchase-icon-matching";

type CartoesMobileTabsProps = {
  cartoes: Cartao[];
  selectedCartao: string;
  setSelectedCartao: (cartaoId: string) => void;
  setOpenCompra: (open: boolean) => void;
  totalFaturas: number;
  formatCurrency: (value: number) => string;
  getCardTotal: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getFilteredCardCompras: (cartaoId: string) => CompraCartao[];
  invoiceMonthLabel: string;
  servicos: Servico[];
  onOpenParcelas: (compra: CompraCartao) => void;
  onDeleteCompra: (compra: CompraCartao) => void;
  resolveCompraIconSuggestion: (compra: CompraCartao) => PurchaseIconMatchResult;
  resolveCardIconId: (cartao: Cartao) => string | null;
};

const INITIAL_VISIBLE_ITEMS = 6;
const ITEMS_PER_PAGE = INITIAL_VISIBLE_ITEMS;

type PageByCard = Record<string, number>;

export function CartoesMobileTabs({
  cartoes,
  selectedCartao,
  setSelectedCartao,
  setOpenCompra,
  totalFaturas,
  formatCurrency,
  getCardTotal,
  getCardAvailableLimit,
  getFilteredCardCompras,
  invoiceMonthLabel,
  servicos,
  onOpenParcelas,
  onDeleteCompra,
  resolveCompraIconSuggestion,
  resolveCardIconId,
}: CartoesMobileTabsProps) {
  const [pageByCard, setPageByCard] = useState<PageByCard>({});

  useEffect(() => {
    setPageByCard((prev) => {
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
  }, [cartoes, getFilteredCardCompras]);

  return (
    <div className="space-y-4" data-testid="cartoes-mobile-list">
      <CartaoCard className="touch-feedback" contentClassName="space-y-1 p-4">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-sm text-muted-foreground">
            Compras da fatura de {invoiceMonthLabel}
          </p>
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">Mostrando apenas compras e parcelas desta fatura.</p>
        <p className="fin-value-kpi">{formatCurrency(totalFaturas)}</p>
      </CartaoCard>

      <div className="space-y-3">
        <p className="px-1 text-sm font-semibold text-muted-foreground">Meus cartões</p>
        {cartoes.map((cartao) => {
          const faturaAtual = getCardTotal(cartao.id);
          const limiteDisponivel = getCardAvailableLimit(cartao.id);
          const nextDate = getNextInvoiceDate(Number(cartao.diaVencimento));
          const [nextDay, nextMonth] = nextDate.split("/");
          const comprasFiltradas = getFilteredCardCompras(cartao.id);
          const currentPage = pageByCard[cartao.id] ?? 1;
          const totalPages = Math.max(1, Math.ceil(comprasFiltradas.length / ITEMS_PER_PAGE));
          const safePage = Math.min(currentPage, totalPages);
          const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
          const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, comprasFiltradas.length);
          const visibleCompras = comprasFiltradas.slice(startIndex, endIndex);
          const hasPagination = comprasFiltradas.length > ITEMS_PER_PAGE;

          return (
            <div
              key={cartao.id}
              className="fintech-surface desktop-hover-lift touch-feedback overflow-hidden"
              data-testid={`mobile-card-cartao-${cartao.id}`}
            >
              <div className="flex items-center gap-3 p-4">
                <BrandIconDisplay name={cartao.nome} iconeId={resolveCardIconId(cartao)} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{cartao.nome}</p>
                  <p className="text-xs text-muted-foreground">Cartão manual</p>
                </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-shrink-0 rounded-lg text-xs"
                    onClick={() => {
                      setSelectedCartao(selectedCartao === cartao.id ? "" : cartao.id);
                      setOpenCompra(false);
                    }}
                  data-testid={`button-ver-compras-mobile-${cartao.id}`}
                  >
                    {selectedCartao === cartao.id ? "Fechar" : "Ver compras"}
                  </Button>
              </div>

              <div className="grid grid-cols-2 divide-x divide-border/70 bg-muted/25 px-4 py-3">
                <div className="pr-4">
                  <p className="mb-0.5 text-xs text-muted-foreground">Limite disponível atual</p>
                  <p className="text-sm font-semibold text-emerald-600">{formatCurrency(limiteDisponivel)}</p>
                </div>
                <div className="pl-4">
                  <p className="mb-0.5 text-xs text-muted-foreground">
                    Fatura atual{" "}
                    <span className="font-normal">(Venc.{nextDay}/{nextMonth})</span>
                  </p>
                  <p className="text-sm font-semibold">{formatCurrency(faturaAtual)}</p>
                </div>
              </div>

              {selectedCartao === cartao.id ? (
                <div className="divide-y divide-border/30 border-t border-border/50">
                  {comprasFiltradas.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma compra nesta fatura.</p>
                  ) : (
                    <>
                      <p className="px-4 py-2 text-xs text-muted-foreground">
                        Mostrando {startIndex + 1}–{endIndex} de {comprasFiltradas.length} parcelas/compras
                      </p>
                      {visibleCompras.map((compra) => {
                        const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);
                        const iconSuggestion = resolveCompraIconSuggestion(compra);
                        return (
                          <div key={compra.id} className="touch-feedback flex items-center gap-3 px-4 py-3">
                            <BrandIconDisplay
                              name={compra.descricao}
                              iconeId={iconSuggestion.shouldAutoApply ? iconSuggestion.iconId : undefined}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{compra.descricao}</p>
                              <p className="text-xs text-muted-foreground">
                                {compra.parcelaAtual}/{compra.parcelas}x
                              </p>
                              {servicosVinculados.length > 0 ? (
                                <p className="mt-0.5 text-[11px] text-blue-600">Serviço vinculado ({servicosVinculados.length})</p>
                              ) : null}
                            </div>
                            <div className="flex flex-shrink-0 flex-col items-end gap-1">
                              <p className="text-sm font-semibold">{formatCurrency(Number(compra.valorParcela))}</p>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="Ver parcelas da compra"
                                  title="Ver parcelas"
                                  onClick={() => onOpenParcelas(compra)}
                                  data-testid={`button-view-parcelas-mobile-${compra.id}`}
                                >
                                  <List className="h-3 w-3 text-muted-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label="Excluir compra"
                                  title="Excluir compra"
                                  onClick={() => onDeleteCompra(compra)}
                                  data-testid={`button-delete-compra-mobile-${compra.id}`}
                                >
                                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {hasPagination ? (
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            disabled={safePage <= 1}
                            onClick={() => {
                              setPageByCard((prev) => ({
                                ...prev,
                                [cartao.id]: Math.max(1, (prev[cartao.id] ?? 1) - 1),
                              }));
                            }}
                            data-testid={`button-paginacao-anterior-mobile-${cartao.id}`}
                          >
                            Anterior
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Página {safePage} de {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            disabled={safePage >= totalPages}
                            onClick={() => {
                              setPageByCard((prev) => ({
                                ...prev,
                                [cartao.id]: Math.min(totalPages, (prev[cartao.id] ?? 1) + 1),
                              }));
                            }}
                            data-testid={`button-paginacao-proxima-mobile-${cartao.id}`}
                          >
                            Próxima
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                  <div className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => {
                        setSelectedCartao(cartao.id);
                        setOpenCompra(true);
                      }}
                      data-testid={`button-add-compra-mobile-${cartao.id}`}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Adicionar compra
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
