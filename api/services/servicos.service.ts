import type { IStorage } from "../storage.js";
import type {
  ServicoBodyInput,
  ServicoPagamentoBodyInput,
  ServicoPessoaBodyInput,
  ServicoPessoaUpdateBodyInput,
  ServicoUpdateBodyInput,
} from "../validators/core-domain.validators.js";

type UpdateServicoPessoaResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "PESSOA_NOT_FOUND" }
  | { updated: Awaited<ReturnType<IStorage["updateServicoPessoa"]>> };

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

  async createServico(userId: string, data: ServicoBodyInput) {
    return this.storage.createServico({ ...data, userId });
  }

  async updateServico(id: string, userId: string, data: ServicoUpdateBodyInput) {
    return this.storage.updateServico(id, userId, data);
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
    return this.storage.getServicoPagamentos(userId);
  }

  async createServicoPagamento(userId: string, data: ServicoPagamentoBodyInput): Promise<CreateServicoPagamentoResult> {
    const servicoPessoas = await this.storage.getServicoPessoas(userId);
    const belongsToUser = servicoPessoas.some((item) => item.id === data.servicoPessoaId);
    if (!belongsToUser) return { error: "SERVICO_PESSOA_NOT_FOUND" };

    const created = await this.storage.createServicoPagamento({ ...data, userId });
    return { created };
  }

  async deleteServicoPagamento(id: string, userId: string) {
    return this.storage.deleteServicoPagamento(id, userId);
  }
}
