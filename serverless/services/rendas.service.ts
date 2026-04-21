import type { IStorage } from "../storage.js";
import type { RendaCreateBodyInput, RendaUpdateBodyInput } from "../validators/core-domain.validators.js";

export class RendasService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string) {
    return this.storage.getRendas(userId);
  }

  async create(data: RendaCreateBodyInput) {
    return this.storage.createRenda(data);
  }

  async update(id: string, userId: string, data: RendaUpdateBodyInput) {
    return this.storage.updateRenda(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.storage.deleteRenda(id, userId);
  }
}
