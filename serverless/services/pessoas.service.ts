import type { IStorage } from "../storage.js";
import type { PessoaBodyInput, PessoaUpdateBodyInput } from "../validators/core-domain.validators.js";

export class PessoasService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string) {
    return this.storage.getPessoas(userId);
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
}
