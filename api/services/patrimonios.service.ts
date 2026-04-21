import type { IStorage } from "../storage.js";
import type { PatrimonioCreateBodyInput, PatrimonioUpdateBodyInput } from "../validators/core-domain.validators.js";

export class PatrimoniosService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string) {
    return this.storage.getPatrimonios(userId);
  }

  async create(data: PatrimonioCreateBodyInput) {
    return this.storage.createPatrimonio(data);
  }

  async update(id: string, userId: string, data: PatrimonioUpdateBodyInput) {
    return this.storage.updatePatrimonio(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.storage.deletePatrimonio(id, userId);
  }
}
