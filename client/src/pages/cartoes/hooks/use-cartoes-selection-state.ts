import { useState } from "react";
import type { CartoesTab } from "@/pages/cartoes/types";

type UseCartoesSelectionStateParams = {
  initialCartoesTab: () => CartoesTab;
  initialInvoiceMonth: () => string;
};

export function useCartoesSelectionState({
  initialCartoesTab,
  initialInvoiceMonth,
}: UseCartoesSelectionStateParams) {
  const [selectedCartao, setSelectedCartao] = useState<string>("");
  const [cartoesTab, setCartoesTab] = useState<CartoesTab>(initialCartoesTab);
  const [selectedInvoiceMonth, setSelectedInvoiceMonth] = useState<string>(initialInvoiceMonth);
  const [compraSearch, setCompraSearch] = useState("");
  const [comprasCartaoFocadoId, setComprasCartaoFocadoId] = useState<string | null>(null);

  const handleCartoesTabChange = (tab: CartoesTab) => {
    setCartoesTab(tab);
    setComprasCartaoFocadoId(null);
  };

  return {
    selectedCartao,
    setSelectedCartao,
    cartoesTab,
    setCartoesTab,
    selectedInvoiceMonth,
    setSelectedInvoiceMonth,
    compraSearch,
    setCompraSearch,
    comprasCartaoFocadoId,
    setComprasCartaoFocadoId,
    handleCartoesTabChange,
  };
}
