import { addMonths, format } from "date-fns";
import type { FinancialRepository } from "../repositories/financial.repository";
import {
  type AnteciparParcelasBodyInput,
  type ParcelaCompraUpdateBodyInput,
  type ParcelaUpdateBodyInput,
  type ParcelasCompraBulkBodyInput,
} from "../validators/financial.validators";

export class ParcelasService {
  constructor(private readonly repository: FinancialRepository) {}

  async list(userId: string) {
    return this.repository.getParcelas(userId);
  }

  async listByDivida(dividaId: string, userId: string) {
    const rows = await this.repository.getParcelasByDivida(dividaId, userId);
    return rows.sort((a, b) => a.numero - b.numero);
  }

  async update(id: string, userId: string, data: ParcelaUpdateBodyInput) {
    return this.repository.updateParcela(id, userId, data);
  }

  async antecipar(userId: string, data: AnteciparParcelasBodyInput) {
    const { dividaId, quantidade, formaPagamento } = data;
    const all = await this.repository.getParcelasByDivida(dividaId, userId);
    const pendentes = all
      .filter((p) => p.status === "pendente")
      .sort((a, b) => a.numero - b.numero)
      .slice(0, quantidade);
    const hoje = format(new Date(), "yyyy-MM-dd");

    const updated = await Promise.all(
      pendentes.map((p) => this.repository.updateParcela(p.id, userId, {
        status: "pago",
        dataPagamento: hoje,
        formaPagamento: formaPagamento || "pix",
      })),
    );

    const allUpdated = await this.repository.getParcelasByDivida(dividaId, userId);
    const todasPagas = allUpdated.every((p) => p.status === "pago");
    if (todasPagas) {
      await this.repository.updateDivida(dividaId, userId, {
        status: "pago",
        dataPagamento: hoje,
        formaPagamento: formaPagamento || "pix",
      });
    }

    return {
      dividaId,
      quantidadeSolicitada: quantidade,
      quantidadeAtualizada: updated.length,
      formaPagamento: formaPagamento || "pix",
      dataPagamento: hoje,
      todasPagas,
    };
  }

  async delete(id: string, userId: string) {
    return this.repository.deleteParcela(id, userId);
  }

  async listParcelasCompra(compraId: string, userId: string) {
    let rows = await this.repository.getParcelasCompra(compraId, userId);
    if (rows.length === 0) {
      const compra = (await this.repository.getComprasCartao(userId)).find((c) => c.id === compraId);
      if (!compra) return { error: "COMPRA_NOT_FOUND" as const };

      const valorParcela = Number(compra.valorParcela);
      const total = Number(compra.parcelas);
      const atual = Number(compra.parcelaAtual);
      const baseDate = new Date(`${compra.dataCompra}T12:00:00`);

      const parcelasData = Array.from({ length: total }, (_, i) => {
        const num = i + 1;
        return {
          userId,
          compraCartaoId: compraId,
          numero: num,
          valor: String(valorParcela),
          dataVencimento: format(addMonths(baseDate, i), "yyyy-MM-dd"),
          statusCartao: num < atual ? "pago" : "pendente",
          dataPagamentoCartao: num < atual ? compra.dataCompra : null,
          statusPessoa: num < atual
            ? (compra.statusPessoa || null)
            : (num === atual && compra.pessoaId ? (compra.statusPessoa || "pendente") : null),
          dataPagamentoPessoa: num < atual ? (compra.dataPagamentoPessoa || null) : null,
        };
      });

      rows = await this.repository.createParcelasCompraBulk(parcelasData);
    }

    return { rows };
  }

  async updateParcelaCompra(id: string, userId: string, data: ParcelaCompraUpdateBodyInput) {
    return this.repository.updateParcelaCompra(id, userId, data);
  }

  async replaceParcelasCompraBulk(userId: string, data: ParcelasCompraBulkBodyInput) {
    const { compraCartaoId, parcelas } = data;
    const compra = (await this.repository.getComprasCartao(userId)).find((c) => c.id === compraCartaoId);
    if (!compra) return { error: "COMPRA_NOT_FOUND" as const };

    await this.repository.deleteParcelasCompraBulk(compraCartaoId, userId);
    const created = await this.repository.createParcelasCompraBulk(
      parcelas.map((row) => ({ ...row, userId, compraCartaoId })),
    );
    return { created };
  }
}
