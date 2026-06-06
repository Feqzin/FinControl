import type { Cartao, CompraCartao, Pessoa, Servico } from "@shared/schema";
import { CartoesEmptyState } from "@/components/cartoes/CartoesEmptyState";
import { CartoesMobileTabs } from "@/components/cartoes/CartoesMobileTabs";
import { CartoesComprasGrid } from "@/components/cartoes/CartoesComprasGrid";
import type { PurchaseIconMatchResult } from "@/lib/purchase-icon-matching";
import type { CartoesTab } from "@/pages/cartoes/types";

type CartaoFaturaSectionProps = {
  activeCartoesTab: CartoesTab;
  cartoes: Cartao[];
  mobileMode: boolean;
  selectedCartao: string;
  setSelectedCartao: (cartaoId: string) => void;
  setOpenCompra: (open: boolean) => void;
  totalFaturasForSelectedMonth: number;
  formatCartaoCurrency: (value: number) => string;
  getCardTotalForSelectedMonth: (cartaoId: string) => number;
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getFilteredCardFaturaCompras: (cartaoId: string) => CompraCartao[];
  selectedInvoiceMonthLabel: string;
  servicos: Servico[];
  pessoas: Pessoa[];
  onOpenParcelas: (compra: CompraCartao) => void;
  onDeleteCompra: (compra: CompraCartao) => void;
  onEditCompra: (compra: CompraCartao) => void;
  onMarcarReembolso: (compraId: string) => void;
  onSaveCompraIconRule: (descricao: string, iconId: string) => Promise<void> | void;
  resolveCompraIconSuggestion: (compra: CompraCartao) => PurchaseIconMatchResult;
  resolveCardIconId: (cartao: Cartao) => string | null;
  comprasCartaoFocadoId: string | null;
  onEditCartao: (cartao: Cartao) => void;
  onDeleteCartao: (cartaoId: string) => void;
  onAddCompra: (cartaoId: string) => void;
  getDaysUntilInvoice: (diaVencimento: number) => number;
  getNextInvoiceDate: (diaVencimento: number) => string;
};

export function CartaoFaturaSection({
  activeCartoesTab,
  cartoes,
  mobileMode,
  selectedCartao,
  setSelectedCartao,
  setOpenCompra,
  totalFaturasForSelectedMonth,
  formatCartaoCurrency,
  getCardTotalForSelectedMonth,
  getCardUsedLimit,
  getCardAvailableLimit,
  getFilteredCardFaturaCompras,
  selectedInvoiceMonthLabel,
  servicos,
  pessoas,
  onOpenParcelas,
  onDeleteCompra,
  onEditCompra,
  onMarcarReembolso,
  onSaveCompraIconRule,
  resolveCompraIconSuggestion,
  resolveCardIconId,
  comprasCartaoFocadoId,
  onEditCartao,
  onDeleteCartao,
  onAddCompra,
  getDaysUntilInvoice,
  getNextInvoiceDate,
}: CartaoFaturaSectionProps) {
  return (
    <div className={activeCartoesTab === "compras" || cartoes.length === 0 ? "" : "hidden"}>
      {cartoes.length === 0 ? (
        <CartoesEmptyState />
      ) : mobileMode ? (
        <CartoesMobileTabs
          cartoes={cartoes}
          selectedCartao={selectedCartao}
          setSelectedCartao={setSelectedCartao}
          setOpenCompra={setOpenCompra}
          totalFaturas={totalFaturasForSelectedMonth}
          formatCurrency={formatCartaoCurrency}
          getCardTotal={getCardTotalForSelectedMonth}
          getCardAvailableLimit={getCardAvailableLimit}
          getFilteredCardCompras={getFilteredCardFaturaCompras}
          invoiceMonthLabel={selectedInvoiceMonthLabel}
          servicos={servicos}
          onOpenParcelas={onOpenParcelas}
          onDeleteCompra={onDeleteCompra}
          resolveCompraIconSuggestion={resolveCompraIconSuggestion}
          resolveCardIconId={resolveCardIconId}
        />
      ) : (
        <CartoesComprasGrid
          cartoes={cartoes}
          invoiceMonthLabel={selectedInvoiceMonthLabel}
          pessoas={pessoas}
          servicos={servicos}
          formatCurrency={formatCartaoCurrency}
          getCardTotal={getCardTotalForSelectedMonth}
          getCardUsedLimit={getCardUsedLimit}
          getCardAvailableLimit={getCardAvailableLimit}
          getFilteredCardCompras={getFilteredCardFaturaCompras}
          getDaysUntilInvoice={getDaysUntilInvoice}
          getNextInvoiceDate={getNextInvoiceDate}
          focusedCartaoId={comprasCartaoFocadoId}
          onEditCartao={onEditCartao}
          onDeleteCartao={onDeleteCartao}
          onAddCompra={onAddCompra}
          onOpenParcelas={onOpenParcelas}
          onEditCompra={onEditCompra}
          onDeleteCompra={onDeleteCompra}
          onMarcarReembolso={onMarcarReembolso}
          resolveCompraIconSuggestion={resolveCompraIconSuggestion}
          onSaveCompraIconRule={onSaveCompraIconRule}
          resolveCardIconId={resolveCardIconId}
        />
      )}
    </div>
  );
}
