import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";

type CartoesTab = "resumo" | "fatura" | "compras";

type CartoesFilterBarProps = {
  cartoesTab: CartoesTab;
  onTabChange: (tab: CartoesTab) => void;
  compraSearch: string;
  onCompraSearchChange: (value: string) => void;
  showSearch: boolean;
};

export function CartoesFilterBar({
  cartoesTab,
  onTabChange,
  compraSearch,
  onCompraSearchChange,
  showSearch,
}: CartoesFilterBarProps) {
  return (
    <div className="space-y-3">
      <Tabs value={cartoesTab} onValueChange={(value) => onTabChange(value as CartoesTab)}>
        <TabsList className="mobile-tabs-scroll w-full justify-start bg-muted/30">
          <TabsTrigger value="resumo" data-testid="tab-cartoes-resumo">Resumo</TabsTrigger>
          <TabsTrigger value="fatura" data-testid="tab-cartoes-fatura">Fatura atual</TabsTrigger>
          <TabsTrigger value="compras" data-testid="tab-cartoes-compras">Compras</TabsTrigger>
        </TabsList>
      </Tabs>

      {showSearch ? (
        <div className="relative w-full max-w-md min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={compraSearch}
            onChange={(event) => onCompraSearchChange(event.target.value)}
            placeholder="Buscar compra, cartão, valor ou data"
            className="pl-9"
            data-testid="input-cartoes-busca-compras"
          />
        </div>
      ) : null}
    </div>
  );
}
