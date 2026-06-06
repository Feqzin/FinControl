import type { Cartao, CompraCartao } from "@shared/schema";
import { CartoesGrid } from "@/components/cartoes/CartoesGrid";
import type { CartoesTab } from "@/pages/cartoes/types";

type CartoesListSectionProps = {
  activeCartoesTab: CartoesTab;
  cartoes: Cartao[];
  getCardTotal: (cartaoId: string) => number;
  getCardUsedLimit: (cartaoId: string) => number;
  getCardAvailableLimit: (cartaoId: string) => number;
  getCardCompras: (cartaoId: string) => CompraCartao[];
  formatCartaoCurrency: (value: number) => string;
  onOpenCompras: (cartaoId: string) => void;
  resolveCardIconId: (cartao: Cartao) => string | null;
};

export function CartoesListSection({
  activeCartoesTab,
  cartoes,
  getCardTotal,
  getCardUsedLimit,
  getCardAvailableLimit,
  getCardCompras,
  formatCartaoCurrency,
  onOpenCompras,
  resolveCardIconId,
}: CartoesListSectionProps) {
  return (
    <div data-testid={`cartoes-tab-${activeCartoesTab}`}>
      <CartoesGrid
        cartoes={cartoes}
        cartoesTab={activeCartoesTab}
        getCardTotal={getCardTotal}
        getCardUsedLimit={getCardUsedLimit}
        getCardAvailableLimit={getCardAvailableLimit}
        getCardCompras={getCardCompras}
        formatCartaoCurrency={formatCartaoCurrency}
        onOpenCompras={onOpenCompras}
        resolveCardIconId={resolveCardIconId}
      />
    </div>
  );
}
