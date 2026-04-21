import type { FinancialRepository } from "../repositories/financial.repository.js";

type MaybeTransactionalRepository = FinancialRepository | {
  withTransaction?: <T>(callback: (repository: FinancialRepository) => Promise<T>) => Promise<T>;
};

export async function runFinancialTransaction<T>(
  repository: MaybeTransactionalRepository,
  callback: (repository: FinancialRepository) => Promise<T>,
): Promise<T> {
  if (typeof repository.withTransaction === "function") {
    return repository.withTransaction(callback);
  }

  return callback(repository as FinancialRepository);
}
