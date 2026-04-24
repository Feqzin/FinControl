import { parseMoney } from "../../utils/money";
import type { Cartao, CompraCartao } from "@shared/schema";
import type { FinancialRepository } from "../repositories/financial.repository";
import type { CartaoBodyInput, CartaoUpdateBodyInput } from "../validators/financial.validators";
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

  async create(userId: string, data: CartaoBodyInput) {
    return this.repository.createCartao({ ...data, userId });
  }

  async update(id: string, userId: string, data: CartaoUpdateBodyInput) {
    return this.repository.updateCartao(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.repository.deleteCartao(id, userId);
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
