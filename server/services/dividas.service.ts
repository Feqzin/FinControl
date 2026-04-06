import { addMonths, format } from "date-fns";
import { buildDividaRecalculoPlan } from "../divida-recalculo";
import type { FinancialRepository } from "../repositories/financial.repository";
import {
  type DividaBodyInput,
  type DividaParceladoBodyInput,
  type DividaUpdateBodyInput,
} from "../validators/financial.validators";

type RecalcularDividaResult =
  | { ok: true; data: { pagas: number; novas: number; valorRestante: string } }
  | { ok: false; status: number; message: string };

export class DividasService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getDividas(userId);
  }

  async listByPessoa(pessoaId: string, userId: string) {
    return this.repository.getDividasByPessoa(pessoaId, userId);
  }

  async create(data: DividaBodyInput, userId: string) {
    const pessoa = await this.repository.getPessoa(data.pessoaId, userId);
    if (!pessoa) return { error: "PESSOA_NOT_FOUND" as const };

    const created = await this.repository.createDivida({ ...data, userId });
    return { created };
  }

  async createParcelado(data: DividaParceladoBodyInput, userId: string) {
    const { pessoaId, tipo, valorTotal, totalParcelas, primeiroVencimento, descricao, formaPagamento } = data;
    const pessoa = await this.repository.getPessoa(pessoaId, userId);
    if (!pessoa) return { error: "PESSOA_NOT_FOUND" as const };

    const valorParcela = Number((valorTotal / totalParcelas).toFixed(2));
    const firstDate = new Date(`${primeiroVencimento}T12:00:00`);

    const divida = await this.repository.createDivida({
      userId,
      pessoaId,
      tipo,
      valor: String(valorParcela),
      dataVencimento: primeiroVencimento,
      status: "pendente",
      descricao: descricao ?? null,
      formaPagamento: formaPagamento ?? null,
      totalParcelas,
      valorTotal: String(valorTotal),
    });

    const parcelasData = Array.from({ length: totalParcelas }, (_, i) => ({
      userId,
      dividaId: divida.id,
      numero: i + 1,
      valor: i === totalParcelas - 1
        ? String(Number((valorTotal - valorParcela * (totalParcelas - 1)).toFixed(2)))
        : String(valorParcela),
      dataVencimento: format(addMonths(firstDate, i), "yyyy-MM-dd"),
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    }));

    const parcelas = await this.repository.createParcelasBulk(parcelasData);
    return { divida, parcelas };
  }

  async update(id: string, userId: string, data: DividaUpdateBodyInput) {
    return this.repository.updateDivida(id, userId, data);
  }

  async delete(id: string, userId: string) {
    await this.repository.deleteParcelasByDivida(id, userId);
    return this.repository.deleteDivida(id, userId);
  }

  async recalcular(
    id: string,
    userId: string,
    payload: { novoTotal: unknown; primeiroVencimento?: string },
  ): Promise<RecalcularDividaResult> {
    const novoTotalNum = Number(payload.novoTotal);
    if (!Number.isInteger(novoTotalNum) || novoTotalNum < 1) {
      return { ok: false, status: 400, message: "novoTotal obrigatorio e deve ser inteiro >= 1" };
    }

    const divida = await this.repository.getDivida(id, userId);
    if (!divida) return { ok: false, status: 404, message: "Not found" };

    const parcelasExistentes = await this.repository.getParcelasByDivida(id, userId);
    if (parcelasExistentes.length === 0) {
      return { ok: false, status: 400, message: "Divida nao possui parcelas para recalculo" };
    }

    const pagas = parcelasExistentes.filter((p) => p.status === "pago");
    const pendentes = parcelasExistentes.filter((p) => p.status !== "pago");

    const valorTotalDivida = Number(divida.valorTotal ?? divida.valor);
    const pendenteOrdenadas = [...pendentes].sort((a, b) => a.numero - b.numero);
    const firstPendingDate =
      payload.primeiroVencimento ||
      pendenteOrdenadas[0]?.dataVencimento ||
      divida.dataVencimento ||
      format(new Date(), "yyyy-MM-dd");
    const baseDate = new Date(`${firstPendingDate}T12:00:00`);
    if (Number.isNaN(baseDate.getTime())) {
      return { ok: false, status: 400, message: "primeiroVencimento invalido" };
    }

    let plan;
    try {
      plan = buildDividaRecalculoPlan({
        valorTotal: valorTotalDivida,
        novoTotal: novoTotalNum,
        parcelasPagas: pagas.map((p) => ({ valor: Number(p.valor) })),
        primeiroVencimento: baseDate,
      });
    } catch (error) {
      return { ok: false, status: 400, message: error instanceof Error ? error.message : "Erro no recalculo" };
    }

    for (const p of pendentes) {
      await this.repository.deleteParcela(p.id, userId);
    }

    const criadas = await this.repository.createParcelasBulk(
      plan.parcelasPendentes.map((parcela) => ({
        ...parcela,
        userId,
        dividaId: divida.id,
      })),
    );

    await this.repository.updateDivida(divida.id, userId, {
      totalParcelas: novoTotalNum,
      valorTotal: plan.valorTotal,
      valor: plan.valorParcelaReferencia,
    });

    return {
      ok: true,
      data: { pagas: pagas.length, novas: criadas.length, valorRestante: plan.valorRestante },
    };
  }
}
