import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Divida, Parcela, Pessoa } from "@shared/schema";
import { toMoneyNumber } from "@/lib/money";
import { queryClient } from "@/lib/queryClient";
import {
  anteciparParcelas,
  createDividaParcelada,
  createDividaSimples,
  deleteDivida,
  recalcularDivida,
  updateDivida,
  updateParcela,
} from "@/services/api/dividas";

export type DividaWithParcelas = Divida & { parcelas: Parcela[] };

type UseDividasArgs = {
  search: string;
  filterStatus: string;
  filterTipo: string;
};

export function useDividas({ search, filterStatus, filterTipo }: UseDividasArgs) {
  const { data: dividas = [], isLoading } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: parcelas = [] } = useQuery<Parcela[]>({ queryKey: ["/api/parcelas"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "—";

  const dividasComParcelas: DividaWithParcelas[] = useMemo(
    () => dividas.map((divida) => ({
      ...divida,
      parcelas: parcelas
        .filter((parcela) => parcela.dividaId === divida.id)
        .sort((a, b) => a.numero - b.numero),
    })),
    [dividas, parcelas],
  );

  const getDividaStatus = (divida: DividaWithParcelas) => {
    if (divida.parcelas.length === 0) return divida.status;
    if (divida.parcelas.every((parcela) => parcela.status === "pago")) return "pago";
    return "pendente";
  };

  const getDividaValorPendente = (divida: DividaWithParcelas) => {
    if (divida.parcelas.length === 0) return divida.status === "pendente" ? toMoneyNumber(divida.valor) : 0;
    return divida.parcelas
      .filter((parcela) => parcela.status === "pendente")
      .reduce((sum, parcela) => sum + toMoneyNumber(parcela.valor), 0);
  };

  const getDividaValorPago = (divida: DividaWithParcelas) => {
    if (divida.parcelas.length === 0) return divida.status === "pago" ? toMoneyNumber(divida.valor) : 0;
    return divida.parcelas
      .filter((parcela) => parcela.status === "pago")
      .reduce((sum, parcela) => sum + toMoneyNumber(parcela.valor), 0);
  };

  const filtered = useMemo(
    () => dividasComParcelas
      .filter((divida) => {
        const nomePessoa = getPessoaNome(divida.pessoaId).toLowerCase();
        const termo = search.toLowerCase();
        return nomePessoa.includes(termo) || (divida.descricao || "").toLowerCase().includes(termo);
      })
      .filter((divida) => {
        const todayIso = new Date().toISOString().slice(0, 10);
        const isOverdue = (dateValue: string | null | undefined) => Boolean(dateValue && dateValue < todayIso);
        if (filterStatus === "todos") return true;
        if (filterStatus === "vencido") {
          if (divida.parcelas.length > 0) {
            return divida.parcelas.some((parcela) => parcela.status === "pendente" && isOverdue(parcela.dataVencimento));
          }
          return divida.status === "pendente" && isOverdue(divida.dataVencimento);
        }
        if (divida.parcelas.length > 0) {
          if (filterStatus === "pendente") return divida.parcelas.some((parcela) => parcela.status === "pendente");
          if (filterStatus === "pago") return divida.parcelas.every((parcela) => parcela.status === "pago");
        }
        return divida.status === filterStatus;
      })
      .filter((divida) => filterTipo === "todos" || divida.tipo === filterTipo)
      .sort((a, b) => (a.dataVencimento ?? "").localeCompare(b.dataVencimento ?? "")),
    [dividasComParcelas, filterStatus, filterTipo, search],
  );

  const totalReceber = useMemo(
    () => filtered
      .filter((divida) => divida.tipo === "receber")
      .reduce((sum, divida) => sum + getDividaValorPendente(divida), 0),
    [filtered],
  );

  const totalPagar = useMemo(
    () => filtered
      .filter((divida) => divida.tipo === "pagar")
      .reduce((sum, divida) => sum + getDividaValorPendente(divida), 0),
    [filtered],
  );

  const createSimpleMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createDividaSimples(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
    },
  });

  const createParceladoMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createDividaParcelada(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
    },
  });

  const payParcelaMutation = useMutation({
    mutationFn: ({ id, formaPagamento, dataPagamento }: { id: string; formaPagamento: string; dataPagamento: string }) =>
      updateParcela(id, {
        status: "pago",
        dataPagamento,
        formaPagamento,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
    },
  });

  const editParcelaMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; valor?: string; dataVencimento?: string }) => updateParcela(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
    },
  });

  const anteciparMutation = useMutation({
    mutationFn: (data: { dividaId: string; quantidade: number; formaPagamento: string }) => anteciparParcelas(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDivida(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
    },
  });

  const updateDividaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateDivida(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
    },
  });

  const recalcularMutation = useMutation({
    mutationFn: ({ id, novoTotal, primeiroVencimento }: { id: string; novoTotal: number; primeiroVencimento?: string }) =>
      recalcularDivida({ id, novoTotal, primeiroVencimento }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
    },
  });

  return {
    dividas,
    parcelas,
    pessoas,
    isLoading,
    filtered,
    totalReceber,
    totalPagar,
    getPessoaNome,
    getDividaStatus,
    getDividaValorPendente,
    getDividaValorPago,
    createSimpleMutation,
    createParceladoMutation,
    payParcelaMutation,
    editParcelaMutation,
    anteciparMutation,
    deleteMutation,
    updateDividaMutation,
    recalcularMutation,
  };
}

