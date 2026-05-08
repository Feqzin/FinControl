import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { BrandIconDisplay } from "@/lib/brand-icons";
import type { Cartao, CompraCartao, Pessoa, Servico } from "@shared/schema";
import {
  CalendarClock,
  CreditCard,
  List,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  User,
} from "lucide-react";
import { CartaoCard } from "@/components/cartoes/CartaoCard";

type CartoesComprasGridProps = {
  cartoes: Cartao[];
  focusedCartaoId?: string | null;
  pessoas: Pessoa[];
  servicos: Servico[];
  formatCurrency: (value: number) => string;
  getCardTotal: (cartaoId: string) => number;
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getFilteredCardCompras: (cartaoId: string) => CompraCartao[];
  getDaysUntilInvoice: (diaVencimento: number) => number;
  getNextInvoiceDate: (diaVencimento: number) => string;
  onEditCartao: (cartao: Cartao) => void;
  onDeleteCartao: (cartaoId: string) => void;
  onAddCompra: (cartaoId: string) => void;
  onOpenParcelas: (compra: CompraCartao) => void;
  onEditCompra: (compra: CompraCartao) => void;
  onDeleteCompra: (compra: CompraCartao) => void;
  onMarcarReembolso: (compraId: string) => void;
};

const INITIAL_VISIBLE_ITEMS = 6;
const ITEMS_PER_PAGE = INITIAL_VISIBLE_ITEMS;

type PageByCard = Record<string, number>;

export function CartoesComprasGrid({
  cartoes,
  focusedCartaoId,
  pessoas,
  servicos,
  formatCurrency,
  getCardTotal,
  getCardUsedLimit,
  getCardAvailableLimit,
  getFilteredCardCompras,
  getDaysUntilInvoice,
  getNextInvoiceDate,
  onEditCartao,
  onDeleteCartao,
  onAddCompra,
  onOpenParcelas,
  onEditCompra,
  onDeleteCompra,
  onMarcarReembolso,
}: CartoesComprasGridProps) {
  const [pageByCard, setPageByCard] = useState<PageByCard>({});
  const cartoesVisiveis = useMemo(() => {
    if (!focusedCartaoId) return cartoes;
    const focused = cartoes.find((cartao) => cartao.id === focusedCartaoId);
    return focused ? [focused] : cartoes;
  }, [cartoes, focusedCartaoId]);

  useEffect(() => {
    setPageByCard((prev) => {
      const next: PageByCard = {};
      let changed = false;
      for (const cartao of cartoesVisiveis) {
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
  }, [cartoesVisiveis, getFilteredCardCompras]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {cartoesVisiveis.map((cartao) => {
        const limite = Number(cartao.limite);
        const faturaAtual = getCardTotal(cartao.id);
        const limiteComprometido = getCardUsedLimit(cartao.id);
        const limiteDisponivel = getCardAvailableLimit(cartao.id);
        const percentUsed = limite > 0 ? (limiteComprometido / limite) * 100 : 0;
        const cardCompras = getFilteredCardCompras(cartao.id);
        const daysUntil = getDaysUntilInvoice(Number(cartao.diaVencimento));
        const nextDate = getNextInvoiceDate(Number(cartao.diaVencimento));
        const isUrgent = daysUntil <= 5;
        const currentPage = pageByCard[cartao.id] ?? 1;
        const totalPages = Math.max(1, Math.ceil(cardCompras.length / ITEMS_PER_PAGE));
        const safePage = Math.min(currentPage, totalPages);
        const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, cardCompras.length);
        const visibleCompras = cardCompras.slice(startIndex, endIndex);
        const hasPagination = cardCompras.length > ITEMS_PER_PAGE;
        const maxVisiblePages = 5;
        const pageWindowStart = Math.max(1, safePage - Math.floor(maxVisiblePages / 2));
        const pageWindowEnd = Math.min(totalPages, pageWindowStart + maxVisiblePages - 1);
        const pageNumbers = Array.from(
          { length: Math.max(0, pageWindowEnd - pageWindowStart + 1) },
          (_, idx) => pageWindowStart + idx,
        );

        return (
          <CartaoCard
            key={cartao.id}
            testId={`card-cartao-${cartao.id}`}
            header={(
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <BrandIconDisplay name={cartao.nome} iconeId={cartao.iconeId} size="md" />
                  <div>
                    <CardTitle className="text-base">{cartao.nome}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Melhor compra: dia {cartao.melhorDiaCompra} · Venc: dia {cartao.diaVencimento}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditCartao(cartao)}
                    data-testid={`button-edit-cartao-${cartao.id}`}
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteCartao(cartao.id)}
                    data-testid={`button-delete-cartao-${cartao.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            )}
            contentClassName="space-y-3 p-4"
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="fintech-stat-card p-3">
                <p className="mb-0.5 text-[11px] text-muted-foreground">Fatura atual</p>
                <p className="text-base font-bold">{formatCurrency(faturaAtual)}</p>
              </div>
              <div className="fintech-stat-card bg-emerald-500/5 p-3">
                <p className="mb-0.5 text-[11px] text-muted-foreground">Disponível</p>
                <p className="text-base font-bold text-emerald-600">{formatCurrency(limiteDisponivel)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{formatCurrency(limiteComprometido)} usados</span>
                <span>Limite: {formatCurrency(limite)}</span>
              </div>
              <Progress
                value={Math.max(0, Math.min(percentUsed, 100))}
                className={`h-1.5 ${percentUsed >= 90 ? "[&>div]:bg-red-500" : percentUsed >= 75 ? "[&>div]:bg-amber-500" : ""}`}
              />
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 ${isUrgent ? "border border-red-500/10 bg-red-500/5" : "bg-muted/30"}`}>
              <div className="flex items-center gap-2">
                <CalendarClock className={`h-3.5 w-3.5 flex-shrink-0 ${isUrgent ? "text-red-500" : "text-muted-foreground"}`} />
                <p className="text-xs text-muted-foreground">Próxima fatura</p>
              </div>
              <p className={`text-xs font-semibold ${isUrgent ? "text-red-600" : ""}`}>
                {nextDate} · {daysUntil} dia(s)
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Compras parceladas ({cardCompras.length})</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddCompra(cartao.id)}
                data-testid={`button-add-compra-${cartao.id}`}
              >
                <Plus className="mr-1 h-3 w-3" /> Adicionar
              </Button>
            </div>

            {cardCompras.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Mostrando {startIndex + 1}–{endIndex} de {cardCompras.length} parcelas/compras
                </p>
                <div className="space-y-2">
                  {visibleCompras.map((compra) => {
                    const aguardandoReembolso = compra.pessoaId && (!compra.statusPessoa || compra.statusPessoa === "pendente");
                    const reembolsado = compra.pessoaId && compra.statusPessoa === "pago";
                    const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);

                    return (
                    <div key={compra.id} className="fintech-surface-subtle touch-feedback p-2 text-sm" data-testid={`compra-${compra.id}`}>
                        <div className="flex items-center gap-2.5">
                          <BrandIconDisplay name={compra.descricao} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{compra.descricao}</p>
                              {compra.pessoaId ? (
                                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                                  <User className="h-2.5 w-2.5" />
                                  {pessoas.find((pessoa) => pessoa.id === compra.pessoaId)?.nome ?? "Pessoa"}
                                </span>
                              ) : null}
                              {aguardandoReembolso ? (
                                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
                                  <RefreshCw className="h-2.5 w-2.5" /> Ag. reembolso
                                </span>
                              ) : null}
                              {reembolsado ? (
                                <span className="inline-flex flex-shrink-0 items-center rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600">
                                  Reembolsado
                                </span>
                              ) : null}
                              {servicosVinculados.length > 0 ? (
                                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                                  <CreditCard className="h-2.5 w-2.5" />
                                  Serviço vinculado ({servicosVinculados.length})
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {compra.parcelaAtual}/{compra.parcelas}x de {formatCurrency(Number(compra.valorParcela))}
                              {" · "}total: {formatCurrency(Number(compra.valorTotal))}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <span className="text-xs font-semibold">{formatCurrency(Number(compra.valorParcela))}</span>
                            {aguardandoReembolso ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Marcar como reembolsado"
                                onClick={() => onMarcarReembolso(compra.id)}
                                data-testid={`button-reembolso-${compra.id}`}
                              >
                                <RefreshCw className="h-3 w-3 text-amber-600" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Ver parcelas"
                              onClick={() => onOpenParcelas(compra)}
                              data-testid={`button-view-parcelas-${compra.id}`}
                            >
                              <List className="h-3 w-3 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onEditCompra(compra)}
                              data-testid={`button-edit-compra-${compra.id}`}
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onDeleteCompra(compra)}
                              data-testid={`button-delete-compra-${compra.id}`}
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasPagination ? (
                  <div className="flex flex-wrap items-center gap-1.5">
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
                      data-testid={`button-paginacao-anterior-compras-${cartao.id}`}
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
                          setPageByCard((prev) => ({
                            ...prev,
                            [cartao.id]: page,
                          }));
                        }}
                        data-testid={`button-paginacao-compras-${cartao.id}-${page}`}
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
                        setPageByCard((prev) => ({
                          ...prev,
                          [cartao.id]: Math.min(totalPages, (prev[cartao.id] ?? 1) + 1),
                        }));
                      }}
                      data-testid={`button-paginacao-proxima-compras-${cartao.id}`}
                    >
                      Próxima
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma compra parcelada</p>
            )}
          </CartaoCard>
        );
      })}
    </div>
  );
}
