import { useEffect, useMemo } from "react";
import { addMonths, format, parseISO } from "date-fns";
import type { Cartao, CompraCartao, ParcelaCompra, Servico, ServicoCobrancaPagamento } from "@shared/schema";
import {
  buildProjectedServiceInstallmentsForCard,
  compraHasInstallmentInCompetency,
  getInvoiceCompetency,
} from "@/lib/card-limit-usage";
import type { InvoiceMonthOption } from "@/pages/cartoes/types";

type UseCartoesFiltersParams = {
  cartoes: Cartao[];
  compras: CompraCartao[];
  parcelasCompraByUser: ParcelaCompra[];
  parcelasCompraByCompraId: Map<string, ParcelaCompra[]>;
  servicos: Servico[];
  servicoCobrancaPagamentos: ServicoCobrancaPagamento[];
  selectedInvoiceMonth: string;
  setSelectedInvoiceMonth: (next: string) => void;
  currentInvoiceMonthReference: string;
  compraSearch: string;
  getCardCompras: (cartaoId: string) => CompraCartao[];
  formatInvoiceCompetencyLabel: (monthReference: string) => string;
};

export function useCartoesFilters({
  cartoes,
  compras,
  parcelasCompraByUser,
  parcelasCompraByCompraId,
  servicos,
  servicoCobrancaPagamentos,
  selectedInvoiceMonth,
  setSelectedInvoiceMonth,
  currentInvoiceMonthReference,
  compraSearch,
  getCardCompras,
  formatInvoiceCompetencyLabel,
}: UseCartoesFiltersParams) {
  const compraSearchNormalized = compraSearch.trim().toLowerCase();

  const invoiceMonthOptions = useMemo<InvoiceMonthOption[]>(() => {
    const monthSet = new Set<string>();

    for (let offset = -12; offset <= 12; offset += 1) {
      monthSet.add(format(addMonths(new Date(), offset), "yyyy-MM"));
    }

    for (const parcela of parcelasCompraByUser) {
      const competency = getInvoiceCompetency(parcela.dataVencimento);
      if (competency) monthSet.add(competency);
    }

    for (const compra of compras) {
      const parcelasMaterializadas = parcelasCompraByCompraId.get(compra.id);
      if (parcelasMaterializadas && parcelasMaterializadas.length > 0) {
        continue;
      }

      const totalParcelas = Math.max(1, Math.trunc(Number(compra.parcelas) || 1));
      const baseRaw = String(compra.dataCompra ?? "").trim();
      if (!baseRaw) continue;

      let baseDate: Date | null = null;
      try {
        const parsed = parseISO(baseRaw);
        if (!Number.isNaN(parsed.getTime())) {
          baseDate = parsed;
        }
      } catch {
        baseDate = null;
      }

      if (!baseDate) continue;
      for (let installmentIndex = 0; installmentIndex < totalParcelas; installmentIndex += 1) {
        monthSet.add(format(addMonths(baseDate, installmentIndex), "yyyy-MM"));
      }
    }

    const projectedMonthReferences = Array.from({ length: 24 }, (_, index) =>
      format(addMonths(new Date(`${currentInvoiceMonthReference}-01`), index - 12), "yyyy-MM"),
    );
    for (const cartao of cartoes) {
      for (const projected of buildProjectedServiceInstallmentsForCard(
        cartao.id,
        compras,
        parcelasCompraByCompraId,
        {
          servicos,
          servicoCobrancaPagamentos,
          monthReferences: projectedMonthReferences,
        },
      )) {
        const competency = getInvoiceCompetency(projected.dataVencimento);
        if (competency) monthSet.add(competency);
      }
    }

    return Array.from(monthSet)
      .filter((month) => /^\d{4}-\d{2}$/.test(month))
      .sort((a, b) => b.localeCompare(a))
      .map((month) => ({ value: month, label: formatInvoiceCompetencyLabel(month) }));
  }, [cartoes, compras, currentInvoiceMonthReference, formatInvoiceCompetencyLabel, parcelasCompraByCompraId, parcelasCompraByUser, servicoCobrancaPagamentos, servicos]);

  const selectedInvoiceMonthLabel = useMemo(() => {
    const selectedOption = invoiceMonthOptions.find((option) => option.value === selectedInvoiceMonth);
    if (selectedOption) return selectedOption.label;
    return formatInvoiceCompetencyLabel(selectedInvoiceMonth);
  }, [formatInvoiceCompetencyLabel, invoiceMonthOptions, selectedInvoiceMonth]);

  useEffect(() => {
    if (invoiceMonthOptions.length === 0) return;
    const hasSelectedMonth = invoiceMonthOptions.some((option) => option.value === selectedInvoiceMonth);
    if (!hasSelectedMonth) {
      setSelectedInvoiceMonth(currentInvoiceMonthReference);
    }
  }, [currentInvoiceMonthReference, invoiceMonthOptions, selectedInvoiceMonth, setSelectedInvoiceMonth]);

  const getFilteredCardCompras = (cartaoId: string) => {
    const card = cartoes.find((item) => item.id === cartaoId);
    return getCardCompras(cartaoId).filter((compra) => {
      if (!compraSearchNormalized) return true;
      const texto = [
        compra.descricao,
        card?.nome,
        compra.dataCompra,
        String(compra.valorParcela),
        String(compra.valorTotal),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return texto.includes(compraSearchNormalized);
    });
  };

  const getFilteredCardFaturaCompras = (cartaoId: string) => {
    const card = cartoes.find((item) => item.id === cartaoId);
    return getCardCompras(cartaoId).filter((compra) => {
      const parcelasMaterializadas = parcelasCompraByCompraId.get(compra.id);
      const isFromSelectedInvoiceCompetency = compraHasInstallmentInCompetency(
        compra,
        parcelasMaterializadas,
        selectedInvoiceMonth,
        { includePaid: true, includeCanceled: false },
      );
      if (!isFromSelectedInvoiceCompetency) return false;
      if (!compraSearchNormalized) return true;
      const texto = [
        compra.descricao,
        card?.nome,
        compra.dataCompra,
        String(compra.valorParcela),
        String(compra.valorTotal),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return texto.includes(compraSearchNormalized);
    });
  };

  return {
    invoiceMonthOptions,
    selectedInvoiceMonthLabel,
    getFilteredCardCompras,
    getFilteredCardFaturaCompras,
  };
}
