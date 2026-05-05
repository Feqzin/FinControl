import { Button } from "@/components/ui/button";
import { CartaoCard } from "@/components/cartoes/CartaoCard";
import { BrandIconDisplay } from "@/lib/brand-icons";
import type { Cartao, CompraCartao, Servico, Pessoa } from "@shared/schema";
import { Eye, List, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getNextInvoiceDate } from "@/pages/cartoes/cartoes.utils";

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
  servicos: Servico[];
  pessoas: Pessoa[];
  onOpenParcelas: (compra: CompraCartao) => void;
  onDeleteCompra: (compra: CompraCartao) => void;
};

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
  servicos,
  pessoas,
  onOpenParcelas,
  onDeleteCompra,
}: CartoesMobileTabsProps) {
  return (
    <div className="space-y-4" data-testid="cartoes-mobile-list">
      <CartaoCard className="touch-feedback" contentClassName="space-y-1 p-4">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-sm text-muted-foreground">
            Faturas de {format(new Date(), "MMMM", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase())}
          </p>
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
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

          return (
            <div
              key={cartao.id}
              className="fintech-surface desktop-hover-lift touch-feedback overflow-hidden"
              data-testid={`mobile-card-cartao-${cartao.id}`}
            >
              <div className="flex items-center gap-3 p-4">
                <BrandIconDisplay name={cartao.nome} iconeId={cartao.iconeId} size="md" />
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
                  data-testid={`button-ver-fatura-mobile-${cartao.id}`}
                >
                  {selectedCartao === cartao.id ? "Fechar" : "Ver fatura"}
                </Button>
              </div>

              <div className="grid grid-cols-2 divide-x divide-border/70 bg-muted/25 px-4 py-3">
                <div className="pr-4">
                  <p className="mb-0.5 text-xs text-muted-foreground">Limite disponível</p>
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
                    <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma compra na fatura</p>
                  ) : (
                    comprasFiltradas.map((compra) => {
                      const servicosVinculados = servicos.filter((servico) => servico.compraCartaoId === compra.id);
                      return (
                        <div key={compra.id} className="touch-feedback flex items-center gap-3 px-4 py-3">
                          <BrandIconDisplay name={compra.descricao} size="sm" />
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
                    })
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

