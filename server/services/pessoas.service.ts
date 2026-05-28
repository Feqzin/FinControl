import type { IStorage } from "../storage";
import type { PessoaBodyInput, PessoaUpdateBodyInput } from "../validators/core-domain.validators";

export type PessoaListStatus = "active" | "removed" | "all";

export class PessoasService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string, status: PessoaListStatus = "active") {
    return this.storage.getPessoasByStatus(userId, status);
  }

  async create(userId: string, data: PessoaBodyInput) {
    return this.storage.createPessoa({ ...data, userId });
  }

  async update(id: string, userId: string, data: PessoaUpdateBodyInput) {
    return this.storage.updatePessoa(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.storage.deletePessoa(id, userId);
  }

  async restore(id: string, userId: string) {
    return this.storage.restorePessoa(id, userId);
  }
}
