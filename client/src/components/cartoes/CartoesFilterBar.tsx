import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";

type CartoesTab = "resumo" | "fatura" | "compras";
type InvoiceMonthOption = { value: string; label: string };

type CartoesFilterBarProps = {
  cartoesTab: CartoesTab;
  onTabChange: (tab: CartoesTab) => void;
  compraSearch: string;
  onCompraSearchChange: (value: string) => void;
  showSearch: boolean;
  invoiceMonth: string;
  invoiceMonthOptions: InvoiceMonthOption[];
  onInvoiceMonthChange: (value: string) => void;
  faturaTabLabel: string;
};

export function CartoesFilterBar({
  cartoesTab,
  onTabChange,
  compraSearch,
  onCompraSearchChange,
  showSearch,
  invoiceMonth,
  invoiceMonthOptions,
  onInvoiceMonthChange,
  faturaTabLabel,
}: CartoesFilterBarProps) {
  return (
    <div className="space-y-3">
      <Tabs value={cartoesTab} onValueChange={(value) => onTabChange(value as CartoesTab)}>
        <TabsList className="mobile-tabs-scroll w-full justify-start bg-muted/30">
          <TabsTrigger value="resumo" data-testid="tab-cartoes-resumo">Resumo</TabsTrigger>
          <TabsTrigger value="fatura" data-testid="tab-cartoes-fatura">{faturaTabLabel}</TabsTrigger>
          <TabsTrigger value="compras" data-testid="tab-cartoes-compras">Compras</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-[260px]">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Mês da fatura</p>
          <Select value={invoiceMonth} onValueChange={onInvoiceMonthChange}>
            <SelectTrigger aria-label="Mês da fatura" data-testid="select-cartoes-mes-fatura">
              <SelectValue placeholder="Selecione o mês da fatura" />
            </SelectTrigger>
            <SelectContent>
              {invoiceMonthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
