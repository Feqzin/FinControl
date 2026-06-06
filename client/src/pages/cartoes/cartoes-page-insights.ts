import type { Cartao, CompraCartao } from "@shared/schema";
import type { CartaoInsightItem } from "@/components/cartoes/CartoesInsights";
import { formatCartaoCurrency } from "@/pages/cartoes/cartoes.utils";

type BuildCartoesInsightsItemsParams = {
  cartoes: Cartao[];
  compras: CompraCartao[];
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
};

export function buildCartoesInsightsItems({
  cartoes,
  compras,
  getCardUsedLimit,
  getCardAvailableLimit,
}: BuildCartoesInsightsItemsParams): CartaoInsightItem[] {
  if (cartoes.length === 0) return [] as CartaoInsightItem[];

  const items: CartaoInsightItem[] = [];
  const rankedByUtil = cartoes
    .map((cartao) => {
      const limite = Number(cartao.limite) || 0;
      const comprometido = getCardUsedLimit(cartao.id);
      const percentual = limite > 0 ? (comprometido / limite) * 100 : 0;
      return { cartao, percentual };
    })
    .sort((a, b) => b.percentual - a.percentual);

  const critical = rankedByUtil.find((item) => item.percentual >= 85);
  if (critical) {
    items.push({
      id: `critical-${critical.cartao.id}`,
      severity: "critical",
      title: `${critical.cartao.nome} quase comprometido`,
      description: `${critical.percentual.toFixed(0)}% do limite já utilizado.`,
    });
  }

  const warning = rankedByUtil.find((item) => item.percentual >= 65 && item.percentual < 85);
  if (warning) {
    items.push({
      id: `warning-${warning.cartao.id}`,
      severity: "warning",
      title: `${warning.cartao.nome} exige atenção`,
      description: `Uso de limite em ${warning.percentual.toFixed(0)}%.`,
    });
  }

  const compraLonga = compras.find((compra) => Number(compra.parcelas) >= 24);
  if (compraLonga) {
    items.push({
      id: `long-${compraLonga.id}`,
      severity: "info",
      title: "Parcelamento longo identificado",
      description: `${compraLonga.descricao} em ${compraLonga.parcelas} parcelas.`,
    });
  }

  const bestAvailable = cartoes
    .map((cartao) => ({ cartao, disponivel: getCardAvailableLimit(cartao.id) }))
    .sort((a, b) => b.disponivel - a.disponivel)[0];
  if (bestAvailable && bestAvailable.disponivel > 0) {
    items.push({
      id: `best-${bestAvailable.cartao.id}`,
      severity: "info",
      title: "Melhor disponibilidade atual",
      description: `${bestAvailable.cartao.nome} com ${formatCartaoCurrency(bestAvailable.disponivel)} disponível.`,
    });
  }

  return items.slice(0, 4);
}
