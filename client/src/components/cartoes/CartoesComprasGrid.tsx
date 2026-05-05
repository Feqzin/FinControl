import { useEffect, useState } from "react";
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

const INITIAL_VISIBLE_ITEMS = 8;
const VISIBLE_STEP = 8;

type VisibleByCard = Record<string, number>;

export function CartoesComprasGrid({
  cartoes,
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
  const [visibleByCard, setVisibleByCard] = useState<VisibleByCard>({});

  useEffect(() => {
    setVisibleByCard((prev) => {
      const next: VisibleByCard = {};
      let changed = false;
      for (const cartao of cartoes) {
        const total = getFilteredCardCompras(cartao.id).length;
        const nextValue = Math.min(prev[cartao.id] ?? INITIAL_VISIBLE_ITEMS, Math.max(total, INITIAL_VISIBLE_ITEMS));
        next[cartao.id] = nextValue;
        if ((prev[cartao.id] ?? INITIAL_VISIBLE_ITEMS) !== nextValue) {
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {cartoes.map((cartao) => {
        const limite = Number(cartao.limite);
        const faturaAtual = getCardTotal(cartao.id);
        const limiteComprometido = getCardUsedLimit(cartao.id);
        const limiteDisponivel = getCardAvailableLimit(cartao.id);
        const percentUsed = limite > 0 ? (limiteComprometido / limite) * 100 : 0;
        const cardCompras = getFilteredCardCompras(cartao.id);
        const daysUntil = getDaysUntilInvoice(Number(cartao.diaVencimento));
        const nextDate = getNextInvoiceDate(Number(cartao.diaVencimento));
        const isUrgent = daysUntil <= 5;
        const visibleCount = Math.min(visibleByCard[cartao.id] ?? INITIAL_VISIBLE_ITEMS, cardCompras.length);
        const visibleCompras = cardCompras.slice(0, visibleCount);
        const canShowMore = visibleCount < cardCompras.length;
        const canShowLess = cardCompras.length > INITIAL_VISIBLE_ITEMS && visibleCount > INITIAL_VISIBLE_ITEMS;

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
            contentClassName="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="fintech-stat-card">
                <p className="mb-1 text-xs text-muted-foreground">Fatura atual</p>
                <p className="text-lg font-bold">{formatCurrency(faturaAtual)}</p>
              </div>
              <div className="fintech-stat-card bg-emerald-500/5">
                <p className="mb-1 text-xs text-muted-foreground">Disponível</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(limiteDisponivel)}</p>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(limiteComprometido)} usados</span>
                <span>Limite: {formatCurrency(limite)}</span>
              </div>
              <Progress
                value={Math.min(percentUsed, 100)}
                className={`h-2 ${percentUsed > 80 ? "[&>div]:bg-red-500" : percentUsed > 60 ? "[&>div]:bg-amber-500" : ""}`}
              />
            </div>

            <div className={`flex items-center gap-2 rounded-md p-3 ${isUrgent ? "border border-red-500/10 bg-red-500/5" : "bg-muted/30"}`}>
              <CalendarClock className={`h-4 w-4 flex-shrink-0 ${isUrgent ? "text-red-500" : "text-muted-foreground"}`} />
              <div>
                <p className="text-xs text-muted-foreground">Próxima fatura</p>
                <p className={`text-sm font-semibold ${isUrgent ? "text-red-600" : ""}`}>
                  {nextDate} · {daysUntil} dia(s)
                </p>
              </div>
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
                  Mostrando {visibleCount} de {cardCompras.length} parcelas/compras
                </p>
                <div className="space-y-2">
                  {visibleCompras.map((compra) => {
                    const aguardandoReembolso = compra.pessoaId && (!compra.statusPessoa || compra.statusPessoa === "pendente");
                    const reembolsado = compra.pessoaId && compra.statusPessoa === "pago";
                    const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);

                    return (
                      <div key={compra.id} className="fintech-surface-subtle touch-feedback p-2.5 text-sm" data-testid={`compra-${compra.id}`}>
                        <div className="mb-2 flex items-center gap-3">
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
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {compra.parcelaAtual}/{compra.parcelas}x de {formatCurrency(Number(compra.valorParcela))}
                              {" · "}total: {formatCurrency(Number(compra.valorTotal))}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <span className="text-sm font-semibold">{formatCurrency(Number(compra.valorParcela))}</span>
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
                {canShowMore || canShowLess ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {canShowMore ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setVisibleByCard((prev) => ({
                            ...prev,
                            [cartao.id]: (prev[cartao.id] ?? INITIAL_VISIBLE_ITEMS) + VISIBLE_STEP,
                          }));
                        }}
                        data-testid={`button-ver-mais-compras-${cartao.id}`}
                      >
                        Ver mais
                      </Button>
                    ) : null}
                    {canShowLess ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setVisibleByCard((prev) => ({
                            ...prev,
                            [cartao.id]: INITIAL_VISIBLE_ITEMS,
                          }));
                        }}
                        data-testid={`button-ver-menos-compras-${cartao.id}`}
                      >
                        Ver menos
                      </Button>
                    ) : null}
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
