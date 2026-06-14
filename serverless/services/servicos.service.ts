import type { IStorage } from "../storage.js";
import type {
  ServicoBodyInput,
  ServicoPagamentoBodyInput,
  ServicoPessoaBodyInput,
  ServicoPessoaUpdateBodyInput,
  ServicoUpdateBodyInput,
} from "../validators/core-domain.validators.js";
import { format } from "date-fns";
import { resolveServicoBillingFields } from "../../shared/servico-periodicidade.js";

type UpdateServicoPessoaResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "PESSOA_NOT_FOUND" }
  | { updated: Awaited<ReturnType<IStorage["updateServicoPessoa"]>> };

type CreateServicoResult =
  | { error: "COMPRA_NOT_FOUND" }
  | { created: Awaited<ReturnType<IStorage["createServico"]>> };

type UpdateServicoResult =
  | { error: "COMPRA_NOT_FOUND" }
  | { updated: Awaited<ReturnType<IStorage["updateServico"]>> };

type CreateServicoPessoaResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "PESSOA_NOT_FOUND" }
  | { created: Awaited<ReturnType<IStorage["createServicoPessoa"]>> };

type CreateServicoPagamentoResult =
  | { error: "SERVICO_PESSOA_NOT_FOUND" }
  | { created: Awaited<ReturnType<IStorage["createServicoPagamento"]>> };

export class ServicosService {
  constructor(private readonly storage: IStorage) {}

  async listServicos(userId: string) {
    return this.storage.getServicos(userId);
  }

  private async validateCompraCartaoOwnership(compraCartaoId: string | null | undefined, userId: string) {
    if (!compraCartaoId) return { ok: true as const };
    const compra = await this.storage.getCompraCartao(compraCartaoId, userId);
    if (!compra) return { ok: false as const };
    return { ok: true as const };
  }

  private shouldNormalizeServicoBilling(data: Partial<ServicoBodyInput> | Partial<ServicoUpdateBodyInput>): boolean {
    return Object.prototype.hasOwnProperty.call(data, "valorMensal")
      || Object.prototype.hasOwnProperty.call(data, "valorCobranca")
      || Object.prototype.hasOwnProperty.call(data, "periodicidadeCobranca")
      || Object.prototype.hasOwnProperty.call(data, "mesCobranca");
  }

  async createServico(userId: string, data: ServicoBodyInput): Promise<CreateServicoResult> {
    const compraValidation = await this.validateCompraCartaoOwnership(data.compraCartaoId, userId);
    if (!compraValidation.ok) return { error: "COMPRA_NOT_FOUND" };
    const billing = resolveServicoBillingFields(data);
    const created = await this.storage.createServico({
      ...data,
      userId,
      valorMensal: billing.valorMensal,
      valorCobranca: billing.valorCobranca,
      periodicidadeCobranca: billing.periodicidadeCobranca,
      mesCobranca: billing.mesCobranca,
    });
    return { created };
  }

  async updateServico(id: string, userId: string, data: ServicoUpdateBodyInput): Promise<UpdateServicoResult> {
    // Semantica do vinculo: quando informado, compraCartaoId deve pertencer ao usuario autenticado.
    if (Object.prototype.hasOwnProperty.call(data, "compraCartaoId")) {
      const compraValidation = await this.validateCompraCartaoOwnership(data.compraCartaoId, userId);
      if (!compraValidation.ok) return { error: "COMPRA_NOT_FOUND" };
    }

    if (!this.shouldNormalizeServicoBilling(data)) {
      const updatedWithoutBilling = await this.storage.updateServico(id, userId, data);
      return { updated: updatedWithoutBilling };
    }

    const current = await this.storage.getServico(id, userId);
    if (!current) return { updated: undefined };

    const billing = resolveServicoBillingFields(data, current);
    const updated = await this.storage.updateServico(id, userId, {
      ...data,
      valorMensal: billing.valorMensal,
      valorCobranca: billing.valorCobranca,
      periodicidadeCobranca: billing.periodicidadeCobranca,
      mesCobranca: billing.mesCobranca,
    });
    return { updated };
  }

  async deleteServico(id: string, userId: string) {
    return this.storage.deleteServico(id, userId);
  }

  async listServicoPessoas(userId: string) {
    return this.storage.getServicoPessoas(userId);
  }

  async createServicoPessoa(userId: string, data: ServicoPessoaBodyInput): Promise<CreateServicoPessoaResult> {
    const servico = await this.storage.getServico(data.servicoId, userId);
    if (!servico) return { error: "SERVICO_NOT_FOUND" };

    const pessoa = await this.storage.getPessoa(data.pessoaId, userId);
    if (!pessoa) return { error: "PESSOA_NOT_FOUND" };

    const created = await this.storage.createServicoPessoa({ ...data, userId });
    return { created };
  }

  async updateServicoPessoa(id: string, userId: string, data: ServicoPessoaUpdateBodyInput): Promise<UpdateServicoPessoaResult> {
    if (data.servicoId) {
      const servico = await this.storage.getServico(data.servicoId, userId);
      if (!servico) return { error: "SERVICO_NOT_FOUND" };
    }
    if (data.pessoaId) {
      const pessoa = await this.storage.getPessoa(data.pessoaId, userId);
      if (!pessoa) return { error: "PESSOA_NOT_FOUND" };
    }

    const updated = await this.storage.updateServicoPessoa(id, userId, data);
    return { updated };
  }

  async deleteServicoPessoa(id: string, userId: string) {
    await this.storage.deleteServicoPagamentosByServicoPessoa(id, userId);
    return this.storage.deleteServicoPessoa(id, userId);
  }

  async listServicoPagamentos(userId: string) {
    const rows = await this.storage.getServicoPagamentos(userId);
    return [...rows].sort(
      (a, b) => String(b.mes).localeCompare(String(a.mes))
        || String(b.dataPagamento ?? "").localeCompare(String(a.dataPagamento ?? "")),
    );
  }

  async createServicoPagamento(userId: string, data: ServicoPagamentoBodyInput): Promise<CreateServicoPagamentoResult> {
    const servicoPessoas = await this.storage.getServicoPessoas(userId);
    const belongsToUser = servicoPessoas.some((item) => item.id === data.servicoPessoaId);
    if (!belongsToUser) return { error: "SERVICO_PESSOA_NOT_FOUND" };

    // Protecao idempotente: evita duplicidade para o mesmo vinculo no mesmo mes.
    const existentes = await this.storage.getServicoPagamentosByServicoPessoa(data.servicoPessoaId, userId);
    const existentesNoMes = existentes.filter((item) => item.mes === data.mes);
    const jaPagoNoMes = existentesNoMes.find((item) => item.status === "pago");
    if (jaPagoNoMes) {
      return { created: jaPagoNoMes };
    }

    if (existentesNoMes.length > 0) {
      // Canonicaliza o mes para 1 registro "pago" e remove duplicidades legadas.
      for (const item of existentesNoMes) {
        await this.storage.deleteServicoPagamento(item.id, userId);
      }
    }

    const created = await this.storage.createServicoPagamento({
      ...data,
      userId,
      status: "pago",
      dataPagamento: data.dataPagamento ?? format(new Date(), "yyyy-MM-dd"),
    });
    return { created };
  }

  async deleteServicoPagamento(id: string, userId: string) {
    return this.storage.deleteServicoPagamento(id, userId);
  }
}
