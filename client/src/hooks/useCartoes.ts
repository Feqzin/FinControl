import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Cartao, CompraCartao, ParcelaCompra, Pessoa, Servico } from "@shared/schema";
import { toMoneyNumber } from "@/lib/money";
import { calculateCardUsedLimit, groupParcelasCompraByCompraId } from "@/lib/card-limit-usage";
import type { ParsedItem } from "@/pages/cartoes/import-parser";
import { queryClient } from "@/lib/queryClient";
import {
  fetchCartoesResumo,
  createCartao,
  createCompraCartao,
  deleteCartao,
  deleteCompraCartao,
  importComprasLote,
  rollbackImportCompras,
  updateCartao,
  updateCompraCartao,
  updateCompraReembolso,
  updateParcelaCompraStatusCartao,
  updateParcelaCompraStatusPessoa,
  updateParcelaCompraValores,
  type CartaoResumo,
  type CartaoPayload,
  type CompraPayload,
  type UpdateCompraPayload,
} from "@/services/api/cartoes";

export function useCartoes(viewingCompraId?: string) {
  const { data: cartoes = [], isLoading } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: servicos = [] } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: cartoesResumo = [] } = useQuery<CartaoResumo[]>({
    queryKey: ["/api/cartoes/resumo"],
    queryFn: fetchCartoesResumo,
  });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: parcelasCompraByUser = [] } = useQuery<ParcelaCompra[]>({ queryKey: ["/api/parcelas-compra"] });
  const { data: parcelasCompraData = [], refetch: refetchParcelas } = useQuery<ParcelaCompra[]>({
    queryKey: ["/api/parcelas-compra", viewingCompraId],
    enabled: !!viewingCompraId,
  });

  const createCardMutation = useMutation({
    mutationFn: (data: CartaoPayload) => createCartao(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CartaoPayload }) => updateCartao(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => deleteCartao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const createCompraMutation = useMutation({
    mutationFn: (data: CompraPayload) => createCompraCartao(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const updateCompraMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCompraPayload }) => updateCompraCartao(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const deleteCompraMutation = useMutation({
    mutationFn: (id: string) => deleteCompraCartao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const marcarReembolsoMutation = useMutation({
    mutationFn: ({ id, pago }: { id: string; pago: boolean }) => updateCompraReembolso(id, pago),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const payParcelaMutation = useMutation({
    mutationFn: ({ id, pago, dataPagamento }: { id: string; pago: boolean; dataPagamento?: string }) =>
      updateParcelaCompraStatusCartao(id, pago, dataPagamento),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra", viewingCompraId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const payParcelaPessoaMutation = useMutation({
    mutationFn: ({ id, pago }: { id: string; pago: boolean }) => updateParcelaCompraStatusPessoa(id, pago),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra", viewingCompraId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const editParcelaMutation = useMutation({
    mutationFn: ({ id, valor, dataVencimento }: { id: string; valor?: string; dataVencimento?: string }) =>
      updateParcelaCompraValores(id, { valor, dataVencimento }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra", viewingCompraId] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const batchImportMutation = useMutation({
    mutationFn: ({ items, cartaoId, previewLogId, sourceType, sourceName }: {
      items: ParsedItem[];
      cartaoId: string;
      previewLogId?: string;
      sourceType?: "texto" | "csv" | "ofx" | "qfx" | "manual";
      sourceName?: string;
    }) => importComprasLote(items, cartaoId, { previewLogId, sourceType, sourceName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const rollbackImportMutation = useMutation({
    mutationFn: (importLogId: string) => rollbackImportCompras(importLogId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
    },
  });

  const getCardCompras = (cartaoId: string) => compras.filter((c) => c.cartaoId === cartaoId);
  const parcelasCompraByCompraId = useMemo(
    () => groupParcelasCompraByCompraId(parcelasCompraByUser),
    [parcelasCompraByUser],
  );
  const cartoesResumoById = useMemo(
    () => new Map(cartoesResumo.map((item) => [item.cartaoId, item])),
    [cartoesResumo],
  );

  // FALLBACK TRANSITORIO:
  // Mantem compatibilidade enquanto a tela migra para a fonte de verdade
  // do backend (/api/cartoes/resumo).
  const getCardTotalFallback = (cartaoId: string) =>
    getCardCompras(cartaoId).reduce((sum, compra) => sum + toMoneyNumber(compra.valorParcela), 0);
  const getCardUsedLimitFallback = (cartaoId: string) =>
    calculateCardUsedLimit(cartaoId, compras, parcelasCompraByCompraId);
  const getCardAvailableLimitFallback = (cartaoId: string) => {
    const cartao = cartoes.find((item) => item.id === cartaoId);
    const limite = toMoneyNumber(cartao?.limite ?? 0);
    return limite - getCardUsedLimitFallback(cartaoId);
  };

  const getCardTotal = (cartaoId: string) =>
    cartoesResumoById.get(cartaoId)?.faturaAtual ?? getCardTotalFallback(cartaoId);
  const getCardUsedLimit = (cartaoId: string) =>
    cartoesResumoById.get(cartaoId)?.limiteComprometido ?? getCardUsedLimitFallback(cartaoId);
  const getCardAvailableLimit = (cartaoId: string) =>
    cartoesResumoById.get(cartaoId)?.limiteDisponivel ?? getCardAvailableLimitFallback(cartaoId);

  const totalFaturas = cartoes.reduce((sum, cartao) => sum + getCardTotal(cartao.id), 0);
  const totalAguardandoReembolso = compras
    .filter((compra) => compra.pessoaId && (!compra.statusPessoa || compra.statusPessoa === "pendente"))
    .reduce((sum, compra) => sum + toMoneyNumber(compra.valorParcela), 0);

  return {
    cartoes,
    compras,
    servicos,
    pessoas,
    parcelasCompraData,
    refetchParcelas,
    isLoading,
    getCardCompras,
    getCardTotal,
    getCardUsedLimit,
    getCardAvailableLimit,
    totalFaturas,
    totalAguardandoReembolso,
    createCardMutation,
    updateCardMutation,
    deleteCardMutation,
    createCompraMutation,
    updateCompraMutation,
    deleteCompraMutation,
    marcarReembolsoMutation,
    payParcelaMutation,
    payParcelaPessoaMutation,
    editParcelaMutation,
    batchImportMutation,
    rollbackImportMutation,
  };
}
