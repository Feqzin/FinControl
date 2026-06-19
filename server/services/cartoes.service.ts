import { format } from "date-fns";
import {
  buildInvoicePaymentAllocationPlan,
  calculateInvoicePaidAmountByInstallment,
  findCardInvoiceSnapshot,
  getActiveInvoicePayments,
  getInstallmentInvoicePaymentStatus,
  isInvoicePaymentCanceled,
  type CardInvoiceAllocationMode,
  type CardInvoiceInstallment,
} from "@shared/card-invoice-payments";
import { buildCardLimitSummary } from "@shared/card-limit-summary";
import { formatMoneyFixed, parseMoney } from "../../utils/money";
import type {
  Cartao,
  CartaoFaturaPagamento,
  CartaoFaturaPagamentoAlocacao,
  CompraCartao,
  ParcelaCompra,
} from "@shared/schema";
import type { FinancialRepository } from "../repositories/financial.repository";
import type {
  CartaoBodyInput,
  CartaoFaturaPagamentoBodyInput,
  CartaoUpdateBodyInput,
} from "../validators/financial.validators";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency";
import { materializeParcelasCompraIfMissing } from "./parcelas-compra-materialization";
import {
  loadInvoicePaymentsWithAllocations,
  type DetailedCartaoFaturaPagamento,
} from "./cartao-fatura-payment-loader";
import { runFinancialTransaction } from "./transaction-utils";

export type FaturaDeleteImpactPorCartao = {
  cartaoId: string;
  cartaoNome: string;
  comprasRemovidas: number;
  parcelasRemovidas: number;
  valorTotalRemovido: number;
};

export type FaturaDeleteImpact = {
  mes: string;
  comprasRemovidas: number;
  parcelasRemovidas: number;
  valorTotalRemovido: number;
  cartoesAfetados: FaturaDeleteImpactPorCartao[];
};

export type DeleteFaturaResult = {
  dryRun: boolean;
  impact: FaturaDeleteImpact;
};

export type RegisterCartaoFaturaPagamentoResult =
  | {
    error:
      | "CARTAO_NOT_FOUND"
      | "FATURA_NOT_FOUND"
      | "FATURA_JA_QUITADA"
      | "VALOR_INVALIDO"
      | "ALOCACAO_INVALIDA";
    message?: string;
  }
  | {
    pagamento: CartaoFaturaPagamento;
    alocacoes: CartaoFaturaPagamentoAlocacao[];
    valorSolicitado: number;
    valorAplicado: number;
    saldoAnterior: number;
    saldoRestante: number;
    statusFatura:
      | "aberta"
      | "parcialmente_paga"
      | "paga"
      | "vencida"
      | "vencida_parcialmente_paga";
    valorOriginalFatura: number;
    snapshotAtualizado: NonNullable<ReturnType<typeof findCardInvoiceSnapshot>>;
    limiteComprometidoAtualizado: number;
    limiteDisponivelEstimadoAtualizado: number;
  };

export type CancelCartaoFaturaPagamentoResult =
  | {
    error:
      | "CARTAO_NOT_FOUND"
      | "FATURA_NOT_FOUND"
      | "PAGAMENTO_NOT_FOUND"
      | "PAGAMENTO_JA_CANCELADO";
    message?: string;
  }
  | {
    pagamentoCancelado: CartaoFaturaPagamento;
    saldoAnterior: number;
    saldoRestante: number;
    statusFatura:
      | "aberta"
      | "parcialmente_paga"
      | "paga"
      | "vencida"
      | "vencida_parcialmente_paga";
    valorOriginalFatura: number;
    snapshotAtualizado: NonNullable<ReturnType<typeof findCardInvoiceSnapshot>>;
    limiteComprometidoAtualizado: number;
    limiteDisponivelEstimadoAtualizado: number;
    parcelasAfetadas: string[];
  };

type DeleteFaturaInput = {
  mes: string;
  dryRun?: boolean;
  cartaoId?: string;
};

const MES_REGEX = /^\d{4}-\d{2}$/;

function toMoneyNumber(value: string | number | null | undefined): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function getMonth(dateValue: string | null | undefined): string | null {
  if (!dateValue || dateValue.length < 7) return null;
  const month = dateValue.slice(0, 7);
  return MES_REGEX.test(month) ? month : null;
}

function parseMonthReference(monthReference: string): { ano: number; mes: number } | null {
  if (!MES_REGEX.test(monthReference)) return null;
  const ano = Number(monthReference.slice(0, 4));
  const mes = Number(monthReference.slice(5, 7));
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

function buildFaturaSnapshot(params: {
  cartao: Cartao;
  monthReference: string;
  parcelasCompra: ParcelaCompra[];
  pagamentos: DetailedCartaoFaturaPagamento[];
}): ReturnType<typeof findCardInvoiceSnapshot> {
  return findCardInvoiceSnapshot({
    cartaoId: params.cartao.id,
    monthReference: params.monthReference,
    installments: params.parcelasCompra.map((parcela) => ({
      id: parcela.id,
      cartaoId: params.cartao.id,
      valor: parcela.valor,
      statusCartao: parcela.statusCartao,
      dataVencimento: parcela.dataVencimento,
    })),
    payments: params.pagamentos,
    getDueDayForCard: () => params.cartao.diaVencimento,
    referenceDate: format(new Date(), "yyyy-MM-dd"),
  });
}

function countCompraParcelas(compra: CompraCartao, linkedParcelas: Array<{ valor: string | number | null }>): number {
  if (linkedParcelas.length > 0) return linkedParcelas.length;
  const fallback = Number(compra.parcelas) || 1;
  return Math.max(1, fallback);
}

function sumCompraValorTotal(compra: CompraCartao, linkedParcelas: Array<{ valor: string | number | null }>): number {
  if (linkedParcelas.length > 0) {
    return linkedParcelas.reduce((sum, parcela) => sum + toMoneyNumber(parcela.valor), 0);
  }
  return toMoneyNumber(compra.valorTotal);
}

function buildInvoiceInstallmentsForCompetency(
  cartaoId: string,
  monthReference: string,
  parcelasCompra: ParcelaCompra[],
  comprasById: Map<string, CompraCartao>,
): CardInvoiceInstallment[] {
  return parcelasCompra
    .filter((parcela) => getMonth(parcela.dataVencimento) === monthReference)
    .map((parcela) => ({
      id: parcela.id,
      compraId: parcela.compraCartaoId,
      descricao: comprasById.get(parcela.compraCartaoId)?.descricao ?? null,
      numero: parcela.numero,
      cartaoId,
      valor: parcela.valor,
      statusCartao: parcela.statusCartao,
      dataVencimento: parcela.dataVencimento,
    }))
    .sort((left, right) => (
      String(left.dataVencimento ?? "").localeCompare(String(right.dataVencimento ?? ""))
      || (left.numero ?? 0) - (right.numero ?? 0)
      || String(left.descricao ?? "").localeCompare(String(right.descricao ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))
    ));
}

function normalizeCardStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

function listInstallmentAllocationHistory(
  installmentId: string,
  pagamentos: DetailedCartaoFaturaPagamento[],
) {
  return pagamentos.filter((payment) => (
    (payment.alocacoes ?? []).some((allocation) => allocation.parcelaCompraId === installmentId)
  ));
}

function getLatestActivePaymentDateForInstallment(
  installmentId: string,
  pagamentos: DetailedCartaoFaturaPagamento[],
): string | null {
  let latestDate: string | null = null;

  for (const payment of getActiveInvoicePayments(pagamentos)) {
    if (!payment.dataPagamento) continue;
    const appliesToInstallment = (payment.alocacoes ?? []).some((allocation) => allocation.parcelaCompraId === installmentId);
    if (!appliesToInstallment) continue;
    if (!latestDate || payment.dataPagamento > latestDate) {
      latestDate = payment.dataPagamento;
    }
  }

  return latestDate;
}

function recomputeInvoiceInstallmentEffectiveStatus(params: {
  parcela: ParcelaCompra;
  pagamentosDaCompetencia: DetailedCartaoFaturaPagamento[];
}): Pick<ParcelaCompra, "statusCartao" | "dataPagamentoCartao"> {
  const allocationHistory = listInstallmentAllocationHistory(params.parcela.id, params.pagamentosDaCompetencia);
  const valorOriginal = toMoneyNumber(params.parcela.valor);
  const valorPagoAtivo = calculateInvoicePaidAmountByInstallment(
    params.parcela.id,
    params.pagamentosDaCompetencia,
  );

  if (valorPagoAtivo >= valorOriginal && valorOriginal > 0) {
    return {
      statusCartao: "pago",
      dataPagamentoCartao: getLatestActivePaymentDateForInstallment(
        params.parcela.id,
        params.pagamentosDaCompetencia,
      ) ?? params.parcela.dataPagamentoCartao ?? null,
    };
  }

  if (allocationHistory.length > 0) {
    return {
      statusCartao: "pendente",
      dataPagamentoCartao: null,
    };
  }

  return {
    statusCartao: normalizeCardStatus(params.parcela.statusCartao) === "pago" ? "pago" : "pendente",
    dataPagamentoCartao: normalizeCardStatus(params.parcela.statusCartao) === "pago"
      ? (params.parcela.dataPagamentoCartao ?? null)
      : null,
  };
}

export class CartoesService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getCartoes(userId);
  }

  async listInvoicePayments(userId: string) {
    return loadInvoicePaymentsWithAllocations(this.repository, userId);
  }

  async create(userId: string, data: CartaoBodyInput) {
    return this.repository.createCartao({ ...data, userId });
  }

  async update(id: string, userId: string, data: CartaoUpdateBodyInput) {
    return this.repository.updateCartao(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.repository.deleteCartao(id, userId);
  }

  async registerInvoicePayment(
    userId: string,
    cartaoId: string,
    monthReference: string,
    data: CartaoFaturaPagamentoBodyInput,
  ): Promise<RegisterCartaoFaturaPagamentoResult> {
    return runFinancialTransaction(this.repository, async (repository) => {
      const cartao = await repository.getCartao(cartaoId, userId);
      if (!cartao) {
        return { error: "CARTAO_NOT_FOUND" as const };
      }

      const parsedMonth = parseMonthReference(monthReference);
      if (!parsedMonth) {
        return { error: "FATURA_NOT_FOUND" as const, message: "Competência da fatura inválida." };
      }

      const valorSolicitado = toMoneyNumber(data.valorPago);
      if (valorSolicitado <= 0) {
        return { error: "VALOR_INVALIDO" as const, message: "Informe um valor maior que zero." };
      }

      const compras = await repository.getComprasByCartao(cartaoId, userId);
      for (const compra of compras) {
        await materializeParcelasCompraIfMissing(repository, compra);
      }

      const compraIds = new Set(compras.map((compra) => compra.id));
      const comprasById = new Map(compras.map((compra) => [compra.id, compra]));
      const parcelasCompra = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));
      const pagamentos = await loadInvoicePaymentsWithAllocations(repository, userId, { cartaoId });

      const snapshotAntes = buildFaturaSnapshot({
        cartao,
        monthReference,
        parcelasCompra,
        pagamentos,
      });

      if (!snapshotAntes || snapshotAntes.originalTotal <= 0) {
        return {
          error: "FATURA_NOT_FOUND" as const,
          message: "Nenhuma cobrança encontrada para esta fatura.",
        };
      }

      if (snapshotAntes.remainingAmount <= 0) {
        return {
          error: "FATURA_JA_QUITADA" as const,
          message: "Esta fatura já está quitada.",
        };
      }

      const valorAplicado = Math.min(valorSolicitado, snapshotAntes.remainingAmount);
      const quitacaoTotal = valorAplicado >= snapshotAntes.remainingAmount;
      const nowTimestamp = new Date();
      const modoAlocacao = data.modoAlocacao ?? "ordem_fatura";
      const installmentsDaCompetencia = buildInvoiceInstallmentsForCompetency(
        cartao.id,
        monthReference,
        parcelasCompra,
        comprasById,
      );

      if (installmentsDaCompetencia.length === 0) {
        return {
          error: "FATURA_NOT_FOUND" as const,
          message: "Nenhuma parcela da competência foi encontrada para esta fatura.",
        };
      }

      const allocationPlan = buildInvoicePaymentAllocationPlan({
        installments: installmentsDaCompetencia,
        payments: pagamentos,
        paymentAmount: valorAplicado,
        mode: modoAlocacao as CardInvoiceAllocationMode,
        manualAllocations: data.alocacoesManuais,
        applyRemainingAutomatically: data.aplicarRestanteAutomaticamente,
      });

      if (modoAlocacao === "manual" && allocationPlan.valorNaoAlocado > 0 && !data.aplicarRestanteAutomaticamente) {
        return {
          error: "ALOCACAO_INVALIDA" as const,
          message: "O valor informado é maior que a soma das parcelas selecionadas. Ative a aplicação automática do restante ou ajuste a seleção manual.",
        };
      }

      if (allocationPlan.valorAlocado <= 0 || allocationPlan.alocacoes.length === 0) {
        return {
          error: "ALOCACAO_INVALIDA" as const,
          message: "Não foi possível aplicar o pagamento às parcelas abertas desta competência.",
        };
      }

      if (quitacaoTotal) {
        const pagamentosParciaisAtivos = getActiveInvoicePayments(pagamentos).filter((pagamento) => (
          pagamento.cartaoId === cartaoId
          && pagamento.competenciaAno === parsedMonth.ano
          && pagamento.competenciaMes === parsedMonth.mes
          && pagamento.considerarNoSaldoCompetencia !== false
        ));

        for (const pagamento of pagamentosParciaisAtivos) {
          await repository.updateCartaoFaturaPagamento(pagamento.id, userId, {
            considerarNoSaldoCompetencia: false,
            conciliadoEm: nowTimestamp,
          });
        }
      }

      const pagamento = await repository.createCartaoFaturaPagamento({
        userId,
        cartaoId,
        competenciaAno: parsedMonth.ano,
        competenciaMes: parsedMonth.mes,
        valorPago: formatMoneyFixed(valorAplicado) ?? "0.00",
        dataPagamento: data.dataPagamento,
        observacao: data.observacao ?? null,
        tipoPagamento: quitacaoTotal ? "quitacao_total" : "parcial",
        modoAlocacao,
        considerarNoSaldoCompetencia: !quitacaoTotal,
        conciliadoEm: quitacaoTotal ? nowTimestamp : null,
      });

      const alocacoes = await repository.createCartaoFaturaPagamentoAlocacoesBulk(
        allocationPlan.alocacoes.map((allocation) => ({
          pagamentoId: pagamento.id,
          parcelaCompraId: allocation.parcelaCompraId,
          valorAplicado: formatMoneyFixed(allocation.valorAplicado) ?? "0.00",
        })),
      );

      const pagamentosAtualizados = await loadInvoicePaymentsWithAllocations(repository, userId, { cartaoId });
      const pagamentosDaCompetencia = pagamentosAtualizados.filter((payment) => (
        payment.competenciaAno === parsedMonth.ano && payment.competenciaMes === parsedMonth.mes
      ));

      const parcelaById = new Map(parcelasCompra.map((parcela) => [parcela.id, parcela]));
      const compraIdsAfetadas = new Set<string>();

      for (const installment of installmentsDaCompetencia) {
        const parcela = installment.id ? parcelaById.get(installment.id) : undefined;
        if (!parcela) continue;
        const statusEfetivo = getInstallmentInvoicePaymentStatus({
          id: parcela.id,
          valor: parcela.valor,
          statusCartao: parcela.statusCartao,
        }, pagamentosDaCompetencia);

        const shouldMarkAsPaid = quitacaoTotal || statusEfetivo === "pago";
        if (shouldMarkAsPaid && String(parcela.statusCartao ?? "").trim().toLowerCase() !== "pago") {
          await repository.updateParcelaCompra(parcela.id, userId, {
            statusCartao: "pago",
            dataPagamentoCartao: data.dataPagamento,
          });
          compraIdsAfetadas.add(parcela.compraCartaoId);
        }
      }

      const parcelasAtualizadas = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));

      for (const compraId of Array.from(compraIdsAfetadas)) {
        await recomputeCardPurchaseAggregate(repository, compraId, userId);
      }

      const pagamentosAtualizadosComAlocacoes = await loadInvoicePaymentsWithAllocations(repository, userId, { cartaoId });
      const snapshotDepois = buildFaturaSnapshot({
        cartao,
        monthReference,
        parcelasCompra: parcelasAtualizadas,
        pagamentos: pagamentosAtualizadosComAlocacoes,
      });

      if (!snapshotDepois) {
        return {
          error: "FATURA_NOT_FOUND" as const,
          message: "Não foi possível reconstruir a fatura após o pagamento.",
        };
      }

      const resumoAtualizado = buildCardLimitSummary({
        cartaoId: cartao.id,
        limiteTotal: cartao.limite,
        monthReference,
        installments: parcelasAtualizadas.map((parcela) => ({
          id: parcela.id,
          cartaoId: cartao.id,
          valor: parcela.valor,
          statusCartao: parcela.statusCartao,
          dataVencimento: parcela.dataVencimento,
        })),
        invoicePayments: pagamentosAtualizadosComAlocacoes.filter((payment) => payment.cartaoId === cartao.id),
        getDueDayForCard: () => cartao.diaVencimento,
        referenceDate: format(new Date(), "yyyy-MM-dd"),
      });

      return {
        pagamento,
        alocacoes,
        valorSolicitado: round2(valorSolicitado),
        valorAplicado: round2(valorAplicado),
        saldoAnterior: round2(snapshotAntes.remainingAmount),
        saldoRestante: round2(snapshotDepois.remainingAmount),
        statusFatura: snapshotDepois.status,
        valorOriginalFatura: round2(snapshotAntes.originalTotal),
        snapshotAtualizado: snapshotDepois,
        limiteComprometidoAtualizado: round2(resumoAtualizado.limiteComprometido),
        limiteDisponivelEstimadoAtualizado: round2(resumoAtualizado.limiteDisponivel),
      };
    });
  }

  async cancelInvoicePayment(
    userId: string,
    cartaoId: string,
    monthReference: string,
    pagamentoId: string,
    data?: { motivoCancelamento?: string | null },
  ): Promise<CancelCartaoFaturaPagamentoResult> {
    return runFinancialTransaction(this.repository, async (repository) => {
      const cartao = await repository.getCartao(cartaoId, userId);
      if (!cartao) {
        return { error: "CARTAO_NOT_FOUND" as const };
      }

      const parsedMonth = parseMonthReference(monthReference);
      if (!parsedMonth) {
        return { error: "FATURA_NOT_FOUND" as const, message: "Competência da fatura inválida." };
      }

      const compras = await repository.getComprasByCartao(cartaoId, userId);
      for (const compra of compras) {
        await materializeParcelasCompraIfMissing(repository, compra);
      }

      const compraIds = new Set(compras.map((compra) => compra.id));
      const parcelasCompra = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));
      const pagamentos = await loadInvoicePaymentsWithAllocations(repository, userId, { cartaoId });

      const pagamentoAlvo = pagamentos.find((payment) => (
        payment.id === pagamentoId
        && payment.competenciaAno === parsedMonth.ano
        && payment.competenciaMes === parsedMonth.mes
      ));

      if (!pagamentoAlvo) {
        return {
          error: "PAGAMENTO_NOT_FOUND" as const,
          message: "Pagamento de fatura não encontrado para esta competência.",
        };
      }

      if (isInvoicePaymentCanceled(pagamentoAlvo)) {
        return {
          error: "PAGAMENTO_JA_CANCELADO" as const,
          message: "Este pagamento de fatura já foi cancelado.",
        };
      }

      const snapshotAntes = buildFaturaSnapshot({
        cartao,
        monthReference,
        parcelasCompra,
        pagamentos,
      });

      if (!snapshotAntes) {
        return {
          error: "FATURA_NOT_FOUND" as const,
          message: "Não foi possível localizar a fatura para desfazer este pagamento.",
        };
      }

      const nowTimestamp = new Date();
      const affectedInstallmentIds = Array.from(
        new Set(
          (pagamentoAlvo.alocacoes ?? [])
            .map((allocation) => allocation.parcelaCompraId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const pagamentoCancelado = await repository.updateCartaoFaturaPagamento(
        pagamentoAlvo.id,
        userId,
        {
          canceladoEm: nowTimestamp,
          motivoCancelamento: data?.motivoCancelamento?.trim() || null,
          canceladoPor: userId,
          considerarNoSaldoCompetencia: false,
        },
      );

      if (!pagamentoCancelado) {
        return {
          error: "PAGAMENTO_NOT_FOUND" as const,
          message: "Pagamento de fatura não encontrado para cancelamento.",
        };
      }

      const pagamentosAtualizados = await loadInvoicePaymentsWithAllocations(repository, userId, { cartaoId });
      const pagamentosDaCompetencia = pagamentosAtualizados.filter((payment) => (
        payment.competenciaAno === parsedMonth.ano && payment.competenciaMes === parsedMonth.mes
      ));

      const parcelaById = new Map(parcelasCompra.map((parcela) => [parcela.id, parcela]));
      const compraIdsAfetadas = new Set<string>();

      for (const installmentId of affectedInstallmentIds) {
        const parcela = parcelaById.get(installmentId);
        if (!parcela) continue;

        const recomputed = recomputeInvoiceInstallmentEffectiveStatus({
          parcela,
          pagamentosDaCompetencia,
        });

        const statusChanged = normalizeCardStatus(parcela.statusCartao) !== normalizeCardStatus(recomputed.statusCartao);
        const paymentDateChanged = (parcela.dataPagamentoCartao ?? null) !== (recomputed.dataPagamentoCartao ?? null);
        if (!statusChanged && !paymentDateChanged) continue;

        await repository.updateParcelaCompra(parcela.id, userId, {
          statusCartao: recomputed.statusCartao,
          dataPagamentoCartao: recomputed.dataPagamentoCartao,
        });

        parcela.statusCartao = recomputed.statusCartao;
        parcela.dataPagamentoCartao = recomputed.dataPagamentoCartao;
        compraIdsAfetadas.add(parcela.compraCartaoId);
      }

      for (const compraId of Array.from(compraIdsAfetadas)) {
        await recomputeCardPurchaseAggregate(repository, compraId, userId);
      }

      const parcelasAtualizadas = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));

      const pagamentosAtualizadosComAlocacoes = await loadInvoicePaymentsWithAllocations(repository, userId, { cartaoId });
      const snapshotDepois = buildFaturaSnapshot({
        cartao,
        monthReference,
        parcelasCompra: parcelasAtualizadas,
        pagamentos: pagamentosAtualizadosComAlocacoes,
      });

      if (!snapshotDepois) {
        return {
          error: "FATURA_NOT_FOUND" as const,
          message: "Não foi possível reconstruir a fatura após desfazer o pagamento.",
        };
      }

      const resumoAtualizado = buildCardLimitSummary({
        cartaoId: cartao.id,
        limiteTotal: cartao.limite,
        monthReference,
        installments: parcelasAtualizadas.map((parcela) => ({
          id: parcela.id,
          cartaoId: cartao.id,
          valor: parcela.valor,
          statusCartao: parcela.statusCartao,
          dataVencimento: parcela.dataVencimento,
        })),
        invoicePayments: pagamentosAtualizadosComAlocacoes.filter((payment) => payment.cartaoId === cartao.id),
        getDueDayForCard: () => cartao.diaVencimento,
        referenceDate: format(new Date(), "yyyy-MM-dd"),
      });

      return {
        pagamentoCancelado,
        saldoAnterior: round2(snapshotAntes.remainingAmount),
        saldoRestante: round2(snapshotDepois.remainingAmount),
        statusFatura: snapshotDepois.status,
        valorOriginalFatura: round2(snapshotAntes.originalTotal),
        snapshotAtualizado: snapshotDepois,
        limiteComprometidoAtualizado: round2(resumoAtualizado.limiteComprometido),
        limiteDisponivelEstimadoAtualizado: round2(resumoAtualizado.limiteDisponivel),
        parcelasAfetadas: affectedInstallmentIds,
      };
    });
  }

  async deleteFaturaDoCartao(userId: string, input: DeleteFaturaInput) {
    return runFinancialTransaction(this.repository, async (repository) => {
      const cartoes = await repository.getCartoes(userId);
      const cartoesById = new Map(cartoes.map((cartao) => [cartao.id, cartao]));

      if (input.cartaoId && !cartoesById.has(input.cartaoId)) {
        return { error: "CARTAO_NOT_FOUND" as const };
      }

      const compras = input.cartaoId
        ? await repository.getComprasByCartao(input.cartaoId, userId)
        : await repository.getComprasCartao(userId);

      const comprasDoMes = compras.filter((compra) => getMonth(compra.dataCompra) === input.mes);
      const compraIds = new Set(comprasDoMes.map((compra) => compra.id));
      const parcelasCompra = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));

      const parcelasByCompra = new Map<string, typeof parcelasCompra>();
      for (const parcela of parcelasCompra) {
        const rows = parcelasByCompra.get(parcela.compraCartaoId) ?? [];
        rows.push(parcela);
        parcelasByCompra.set(parcela.compraCartaoId, rows);
      }

      const impactByCard = new Map<string, FaturaDeleteImpactPorCartao>();
      let comprasRemovidas = 0;
      let parcelasRemovidas = 0;
      let valorTotalRemovido = 0;

      for (const compra of comprasDoMes) {
        const linkedParcelas = parcelasByCompra.get(compra.id) ?? [];
        const cartao = cartoesById.get(compra.cartaoId);
        if (!cartao) continue;

        const cardImpact = impactByCard.get(cartao.id) ?? {
          cartaoId: cartao.id,
          cartaoNome: cartao.nome,
          comprasRemovidas: 0,
          parcelasRemovidas: 0,
          valorTotalRemovido: 0,
        };

        const parcelasDaCompra = countCompraParcelas(compra, linkedParcelas);
        const valorDaCompra = sumCompraValorTotal(compra, linkedParcelas);

        cardImpact.comprasRemovidas += 1;
        cardImpact.parcelasRemovidas += parcelasDaCompra;
        cardImpact.valorTotalRemovido = round2(cardImpact.valorTotalRemovido + valorDaCompra);
        impactByCard.set(cartao.id, cardImpact);

        comprasRemovidas += 1;
        parcelasRemovidas += parcelasDaCompra;
        valorTotalRemovido += valorDaCompra;
      }

      const impact: FaturaDeleteImpact = {
        mes: input.mes,
        comprasRemovidas,
        parcelasRemovidas,
        valorTotalRemovido: round2(valorTotalRemovido),
        cartoesAfetados: Array.from(impactByCard.values()),
      };

      if (!input.dryRun && comprasDoMes.length > 0) {
        for (const compra of comprasDoMes) {
          await repository.deleteCompraCartao(compra.id, userId);
        }
      }

      return { dryRun: Boolean(input.dryRun), impact } satisfies DeleteFaturaResult;
    });
  }
}
