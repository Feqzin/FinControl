import { useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Cartao, CompraCartao, ParcelaCompra, Pessoa, PessoaSaldoMovimentacao, Servico, ServicoPessoa } from "@shared/schema";
import { format } from "date-fns";
import { toMoneyNumber } from "@/lib/money";
import {
  calculateCardLimitSummary,
  calculateCardCurrentInvoiceTotal,
  groupParcelasCompraByCompraId,
} from "@/lib/card-limit-usage";
import { getCompraReembolsoVisualStatus } from "@/lib/cartao-reembolso-status";
import type { ParsedItem } from "@/pages/cartoes/import-parser";
import { queryClient } from "@/lib/queryClient";
import { abaterSaldoParcelaPessoa } from "@/services/api/pessoas";
import {
  fetchCartaoFaturaPagamentos,
  fetchCartoesResumo,
  createCartao,
  createCompraCartao,
  cancelCartaoFaturaPagamento,
  deleteCartao,
  deleteCompraCartaoComEscopo,
  deleteFaturaCartaoMes,
  deleteFaturasMes,
  registerCartaoFaturaPagamento,
  importComprasLote,
  rollbackImportCompras,
  updateCartao,
  updateCompraCartao,
  updateCompraReembolso,
  updateParcelaCompraStatusCartao,
  updateParcelaCompraStatusPessoa,
  updateParcelaCompraCompetencia,
  updateParcelaCompraValores,
  type CartaoFaturaPagamentoApiModel,
  type CartaoResumo,
  type CartaoPayload,
  type CancelCartaoFaturaPagamentoPayload,
  type CompraPayload,
  type DeleteCompraScope,
  type RegisterCartaoFaturaPagamentoPayload,
  type UpdateCompraPayload,
} from "@/services/api/cartoes";

const ENABLE_CARTOES_LOCAL_FALLBACK =
  String(import.meta.env.VITE_CARTOES_LOCAL_FALLBACK_ENABLED ?? "true").toLowerCase() !== "false";
const IS_DEV = import.meta.env.DEV;

type QueryKey = readonly unknown[];

export function useCartoes(viewingCompraId?: string) {
  const { data: cartoes = [], isLoading } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: servicos = [] } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: cartaoFaturaPagamentos = [] } = useQuery<CartaoFaturaPagamentoApiModel[]>({
    queryKey: ["/api/cartoes/fatura-pagamentos"],
    queryFn: fetchCartaoFaturaPagamentos,
  });
  const {
    data: cartoesResumo = [],
    isError: isCartoesResumoError,
    isSuccess: isCartoesResumoSuccess,
    error: cartoesResumoError,
  } = useQuery<CartaoResumo[]>({
    queryKey: ["/api/cartoes/resumo"],
    queryFn: fetchCartoesResumo,
  });
  const { data: pessoaSaldoMovimentacoes = [] } = useQuery<PessoaSaldoMovimentacao[]>({
    queryKey: ["/api/pessoas/saldo-movimentacoes"],
  });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: parcelasCompraByUser = [] } = useQuery<ParcelaCompra[]>({ queryKey: ["/api/parcelas-compra"] });
  const {
    data: parcelasCompraData = [],
    refetch: refetchParcelas,
    isLoading: isParcelasCompraLoading,
    isError: isParcelasCompraError,
    error: parcelasCompraError,
  } = useQuery<ParcelaCompra[]>({
    queryKey: ["/api/parcelas-compra", viewingCompraId],
    enabled: !!viewingCompraId,
  });

  const invalidateAndRefetch = async (keys: QueryKey[]) => {
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
    await Promise.all(
      keys.map((queryKey) => queryClient.refetchQueries({ queryKey, type: "active" })),
    );
  };

  const refreshCartoesQueries = async (options?: { includePessoas?: boolean; includeUsage?: boolean; includeImportLogs?: boolean }) => {
    const keys: QueryKey[] = [
      ["/api/cartoes"],
      ["/api/cartoes/resumo"],
      ["/api/cartoes/fatura-pagamentos"],
      ["/api/compras-cartao"],
      ["/api/parcelas-compra"],
      ["/api/dashboard/overview"],
      ["/api/financial/summary"],
      ["/api/financial/score"],
      ["/api/financial/insights"],
      ["/api/reports/overview"],
    ];

    if (viewingCompraId) {
      keys.push(["/api/parcelas-compra", viewingCompraId]);
    }
    if (options?.includePessoas) {
      keys.push(["/api/pessoas"]);
      keys.push(["/api/pessoas", "includeResumo=true"]);
      keys.push(["/api/pessoas/saldo-movimentacoes"]);
      keys.push(["/api/dividas"]);
    }
    if (options?.includeUsage) {
      keys.push(["/api/subscription/usage"]);
    }
    if (options?.includeImportLogs) {
      keys.push(["/api/imports/logs"]);
    }

    await invalidateAndRefetch(keys);
  };

  const logDev = (event: string, payload?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.info("[cartoes][mutation]", event, payload ?? {});
  };

  const createCardMutation = useMutation({
    mutationFn: (data: CartaoPayload) => createCartao(data),
    onSuccess: async () => {
      await refreshCartoesQueries({ includeUsage: true });
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CartaoPayload }) => updateCartao(id, data),
    onSuccess: async () => {
      await refreshCartoesQueries();
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => deleteCartao(id),
    onSuccess: async () => {
      await refreshCartoesQueries({ includeUsage: true });
    },
  });

  const createCompraMutation = useMutation({
    mutationFn: (data: CompraPayload) => createCompraCartao(data),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const updateCompraMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCompraPayload }) => updateCompraCartao(id, data),
    onSuccess: async (_result, variables) => {
      logDev("update-compra:success", { compraId: variables.id });
      await refreshCartoesQueries({ includePessoas: true });
    },
    onError: (error, variables) => {
      logDev("update-compra:error", {
        compraId: variables.id,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const deleteCompraMutation = useMutation({
    mutationFn: ({
      compraId,
      scope,
      parcelaId,
      dryRun,
    }: {
      compraId: string;
      scope?: DeleteCompraScope;
      parcelaId?: string;
      dryRun?: boolean;
    }) => deleteCompraCartaoComEscopo(compraId, { scope, parcelaId, dryRun }),
    onSuccess: async (_data, variables) => {
      if (variables.dryRun) return;
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const deleteFaturaCartaoMutation = useMutation({
    mutationFn: ({
      cartaoId,
      mes,
      dryRun,
    }: {
      cartaoId: string;
      mes: string;
      dryRun?: boolean;
    }) => deleteFaturaCartaoMes(cartaoId, mes, { dryRun }),
    onSuccess: async (_data, variables) => {
      if (variables.dryRun) return;
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const deleteFaturasMesMutation = useMutation({
    mutationFn: ({ mes, dryRun }: { mes: string; dryRun?: boolean }) =>
      deleteFaturasMes(mes, { dryRun }),
    onSuccess: async (_data, variables) => {
      if (variables.dryRun) return;
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const registerInvoicePaymentMutation = useMutation({
    mutationFn: ({
      cartaoId,
      monthReference,
      data,
    }: {
      cartaoId: string;
      monthReference: string;
      data: RegisterCartaoFaturaPagamentoPayload;
    }) => registerCartaoFaturaPagamento(cartaoId, monthReference, data),
    onSuccess: async () => {
      await refreshCartoesQueries();
    },
  });

  const cancelInvoicePaymentMutation = useMutation({
    mutationFn: ({
      cartaoId,
      monthReference,
      pagamentoId,
      data,
    }: {
      cartaoId: string;
      monthReference: string;
      pagamentoId: string;
      data?: CancelCartaoFaturaPagamentoPayload;
    }) => cancelCartaoFaturaPagamento(cartaoId, monthReference, pagamentoId, data),
    onSuccess: async () => {
      await refreshCartoesQueries();
    },
  });

  const marcarReembolsoMutation = useMutation({
    mutationFn: ({ id, pago }: { id: string; pago: boolean }) => updateCompraReembolso(id, pago),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const payParcelaMutation = useMutation({
    mutationFn: ({ id, pago, dataPagamento }: { id: string; pago: boolean; dataPagamento?: string }) =>
      updateParcelaCompraStatusCartao(id, pago, dataPagamento),
    onMutate: async (variables) => {
      const allKey: QueryKey = ["/api/parcelas-compra"];
      const compraKey: QueryKey = viewingCompraId
        ? ["/api/parcelas-compra", viewingCompraId]
        : ["/api/parcelas-compra", "__noop__"];

      await queryClient.cancelQueries({ queryKey: allKey });
      if (viewingCompraId) {
        await queryClient.cancelQueries({ queryKey: compraKey });
      }

      const previousAll = queryClient.getQueryData<ParcelaCompra[]>(allKey);
      const previousCompra = viewingCompraId
        ? queryClient.getQueryData<ParcelaCompra[]>(compraKey)
        : undefined;

      const applyPatch = (rows: ParcelaCompra[] | undefined) =>
        rows?.map((row) => (
          row.id === variables.id
            ? {
              ...row,
              statusCartao: variables.pago ? "pago" : "pendente",
              dataPagamentoCartao: variables.pago
                ? (variables.dataPagamento ?? new Date().toISOString().slice(0, 10))
                : null,
            }
            : row
        ));

      if (previousAll) {
        queryClient.setQueryData(allKey, applyPatch(previousAll));
      }
      if (viewingCompraId && previousCompra) {
        queryClient.setQueryData(compraKey, applyPatch(previousCompra));
      }

      return { previousAll, previousCompra, allKey, compraKey };
    },
    onError: (error, variables, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(context.allKey, context.previousAll);
      }
      if (viewingCompraId && context?.previousCompra) {
        queryClient.setQueryData(context.compraKey, context.previousCompra);
      }
      logDev("pay-parcela:error", {
        parcelaId: variables.id,
        pago: variables.pago,
        message: error instanceof Error ? error.message : String(error),
      });
    },
    onSuccess: async (_result, variables) => {
      logDev("pay-parcela:success", { parcelaId: variables.id, pago: variables.pago });
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const payParcelaPessoaMutation = useMutation({
    mutationFn: ({ id, pago }: { id: string; pago: boolean }) => updateParcelaCompraStatusPessoa(id, pago),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const editParcelaMutation = useMutation({
    mutationFn: ({ id, valor, dataVencimento }: { id: string; valor?: string; dataVencimento?: string }) =>
      updateParcelaCompraValores(id, { valor, dataVencimento }),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const moveParcelaCompetenciaMutation = useMutation({
    mutationFn: ({ id, competencia }: { id: string; competencia: string }) =>
      updateParcelaCompraCompetencia(id, competencia),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true });
    },
  });

  const abaterSaldoParcelaMutation = useMutation({
    mutationFn: ({
      pessoaId,
      parcelaId,
      valor,
      data,
      observacao,
    }: {
      pessoaId: string;
      parcelaId: string;
      valor: string;
      data?: string | null;
      observacao?: string | null;
    }) => abaterSaldoParcelaPessoa(pessoaId, parcelaId, { valor, data, observacao }),
    onSuccess: async (_data, variables) => {
      await refreshCartoesQueries({ includePessoas: true });
      await invalidateAndRefetch([
        ["/api/pessoas", variables.pessoaId, "saldo-movimentacoes"],
        ["/api/pessoas", variables.pessoaId, "resumo"],
      ]);
    },
  });

  const batchImportMutation = useMutation({
    mutationFn: ({ items, cartaoId, previewLogId, sourceType, sourceName }: {
      items: ParsedItem[];
      cartaoId: string;
      previewLogId?: string;
      sourceType?: "texto" | "csv" | "ofx" | "qfx" | "pdf" | "manual";
      sourceName?: string;
    }) => importComprasLote(items, cartaoId, { previewLogId, sourceType, sourceName }),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true, includeImportLogs: true });
    },
  });

  const rollbackImportMutation = useMutation({
    mutationFn: (importLogId: string) => rollbackImportCompras(importLogId),
    onSuccess: async () => {
      await refreshCartoesQueries({ includePessoas: true, includeImportLogs: true });
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
  const fallbackLogsRef = useRef(new Set<string>());
  const fallbackCardSummariesById = useMemo(() => {
    const monthReference = format(new Date(), "yyyy-MM");
    return new Map(
      cartoes.map((cartao) => ([
        cartao.id,
        calculateCardLimitSummary(
          cartao.id,
          compras,
          parcelasCompraByCompraId,
          monthReference,
          cartao.limite,
          cartaoFaturaPagamentos,
        ),
      ])),
    );
  }, [cartaoFaturaPagamentos, cartoes, compras, parcelasCompraByCompraId]);

  // FALLBACK TRANSITORIO:
  // Mantem compatibilidade enquanto a tela migra para a fonte de verdade
  // do backend (/api/cartoes/resumo).
  const getCardTotalFallback = (cartaoId: string) =>
    fallbackCardSummariesById.get(cartaoId)?.faturaAtual
    ?? calculateCardCurrentInvoiceTotal(
      cartaoId,
      compras,
      parcelasCompraByCompraId,
      format(new Date(), "yyyy-MM"),
      cartaoFaturaPagamentos,
    );
  const getCardUsedLimitFallback = (cartaoId: string) =>
    fallbackCardSummariesById.get(cartaoId)?.limiteComprometido ?? 0;
  const getCardAvailableLimitFallback = (cartaoId: string) =>
    fallbackCardSummariesById.get(cartaoId)?.limiteDisponivel ?? 0;

  const logFallbackUsage = (metric: string, cartaoId: string, reason: "resumo_error" | "resumo_incompleto") => {
    const key = `${metric}:${cartaoId}:${reason}`;
    if (fallbackLogsRef.current.has(key)) return;
    fallbackLogsRef.current.add(key);

    const errorMessage = cartoesResumoError instanceof Error
      ? cartoesResumoError.message
      : String(cartoesResumoError ?? "");

    console.warn("[cartoes][backend-first] fallback local em uso", {
      metric,
      cartaoId,
      reason,
      fallbackEnabled: ENABLE_CARTOES_LOCAL_FALLBACK,
      cartoesResumoStatus: {
        isError: isCartoesResumoError,
        isSuccess: isCartoesResumoSuccess,
      },
      error: errorMessage || undefined,
    });
  };

  const resolveCartaoResumoMetric = (
    cartaoId: string,
    metric: "faturaAtual" | "limiteComprometido" | "limiteDisponivel",
    fallbackResolver: (id: string) => number,
  ) => {
    const resumo = cartoesResumoById.get(cartaoId);
    const backendValue = resumo?.[metric];
    if (typeof backendValue === "number" && Number.isFinite(backendValue)) {
      return backendValue;
    }

    const fallbackReason = isCartoesResumoError
      ? "resumo_error"
      : isCartoesResumoSuccess
        ? "resumo_incompleto"
        : null;

    if (!ENABLE_CARTOES_LOCAL_FALLBACK || !fallbackReason) {
      return 0;
    }

    logFallbackUsage(metric, cartaoId, fallbackReason);
    return fallbackResolver(cartaoId);
  };

  const getCardTotal = (cartaoId: string) =>
    resolveCartaoResumoMetric(cartaoId, "faturaAtual", getCardTotalFallback);
  const getCardUsedLimit = (cartaoId: string) =>
    resolveCartaoResumoMetric(cartaoId, "limiteComprometido", getCardUsedLimitFallback);
  const getCardAvailableLimit = (cartaoId: string) =>
    resolveCartaoResumoMetric(cartaoId, "limiteDisponivel", getCardAvailableLimitFallback);

  const totalFaturas = cartoes.reduce((sum, cartao) => sum + getCardTotal(cartao.id), 0);
  const totalAguardandoReembolso = compras
    .filter((compra) => {
      const reembolsoStatus = getCompraReembolsoVisualStatus(
        compra,
        parcelasCompraByCompraId.get(compra.id) ?? [],
      );
      return reembolsoStatus === "aguardando_reembolso" || reembolsoStatus === "reembolso_vencido";
    })
    .reduce((sum, compra) => sum + toMoneyNumber(compra.valorParcela), 0);

  return {
    cartoes,
    cartaoFaturaPagamentos,
    compras,
    servicos,
    servicoPessoas,
    pessoas,
    pessoaSaldoMovimentacoes,
    parcelasCompraByUser,
    parcelasCompraData,
    isParcelasCompraLoading,
    isParcelasCompraError,
    parcelasCompraError,
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
    deleteFaturaCartaoMutation,
    deleteFaturasMesMutation,
    registerInvoicePaymentMutation,
    cancelInvoicePaymentMutation,
    marcarReembolsoMutation,
    payParcelaMutation,
    payParcelaPessoaMutation,
    editParcelaMutation,
    moveParcelaCompetenciaMutation,
    abaterSaldoParcelaMutation,
    batchImportMutation,
    rollbackImportMutation,
  };
}
