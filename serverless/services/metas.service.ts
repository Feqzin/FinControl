import type { IStorage } from "../storage.js";
import type { MetaBodyInput, MetaUpdateBodyInput } from "../validators/core-domain.validators.js";

export class MetasService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string) {
    return this.storage.getMetas(userId);
  }

  async create(userId: string, data: MetaBodyInput) {
    return this.storage.createMeta({ ...data, userId });
  }

  async update(id: string, userId: string, data: MetaUpdateBodyInput) {
    return this.storage.updateMeta(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.storage.deleteMeta(id, userId);
  }
}
