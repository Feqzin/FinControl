import { format } from "date-fns";
import { findCardInvoiceSnapshot } from "../../shared/card-invoice-payments.js";
import { formatMoneyFixed, parseMoney } from "../../utils/money.js";
import type { Cartao, CartaoFaturaPagamento, CompraCartao, ParcelaCompra } from "../../shared/schema.js";
import type { FinancialRepository } from "../repositories/financial.repository.js";
import type {
  CartaoBodyInput,
  CartaoFaturaPagamentoBodyInput,
  CartaoUpdateBodyInput,
} from "../validators/financial.validators.js";
import { recomputeCardPurchaseAggregate } from "./financial-aggregate-consistency.js";
import { materializeParcelasCompraIfMissing } from "./parcelas-compra-materialization.js";
import { runFinancialTransaction } from "./transaction-utils.js";

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
    error: "CARTAO_NOT_FOUND" | "FATURA_NOT_FOUND" | "FATURA_JA_QUITADA" | "VALOR_INVALIDO";
    message?: string;
  }
  | {
    pagamento: CartaoFaturaPagamento;
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
  pagamentos: CartaoFaturaPagamento[];
}): ReturnType<typeof findCardInvoiceSnapshot> {
  return findCardInvoiceSnapshot({
    cartaoId: params.cartao.id,
    monthReference: params.monthReference,
    installments: params.parcelasCompra.map((parcela) => ({
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

export class CartoesService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getCartoes(userId);
  }

  async listInvoicePayments(userId: string) {
    return this.repository.getCartaoFaturaPagamentos(userId);
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
      const parcelasCompra = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));
      const pagamentos = await repository.getCartaoFaturaPagamentosByCartao(cartaoId, userId);

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

      if (quitacaoTotal) {
        const pagamentosParciaisAtivos = pagamentos.filter((pagamento) => (
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

        const parcelasAbertasDaCompetencia = parcelasCompra.filter((parcela) => (
          getMonth(parcela.dataVencimento) === monthReference
          && String(parcela.statusCartao ?? "").trim().toLowerCase() !== "pago"
          && String(parcela.statusCartao ?? "").trim().toLowerCase() !== "cancelado"
        ));

        for (const parcela of parcelasAbertasDaCompetencia) {
          await repository.updateParcelaCompra(parcela.id, userId, {
            statusCartao: "pago",
            dataPagamentoCartao: data.dataPagamento,
          });
        }

        const compraIdsAfetadas = Array.from(new Set(parcelasAbertasDaCompetencia.map((parcela) => parcela.compraCartaoId)));
        for (const compraId of compraIdsAfetadas) {
          await recomputeCardPurchaseAggregate(repository, compraId, userId);
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
        considerarNoSaldoCompetencia: !quitacaoTotal,
        conciliadoEm: quitacaoTotal ? nowTimestamp : null,
      });

      const parcelasAtualizadas = (await repository.getParcelasCompraByUser(userId))
        .filter((parcela) => compraIds.has(parcela.compraCartaoId));
      const pagamentosAtualizados = await repository.getCartaoFaturaPagamentosByCartao(cartaoId, userId);
      const snapshotDepois = buildFaturaSnapshot({
        cartao,
        monthReference,
        parcelasCompra: parcelasAtualizadas,
        pagamentos: pagamentosAtualizados,
      });

      return {
        pagamento,
        valorSolicitado: round2(valorSolicitado),
        valorAplicado: round2(valorAplicado),
        saldoAnterior: round2(snapshotAntes.remainingAmount),
        saldoRestante: round2(snapshotDepois?.remainingAmount ?? 0),
        statusFatura: snapshotDepois?.status ?? "paga",
        valorOriginalFatura: round2(snapshotAntes.originalTotal),
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
