import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStorage } from "../storage";

function createDatabaseFixture() {
  let queryAttempts = 0;
  let schemaExecutions = 0;
  const database = {
    select() {
      return {
        from() {
          return {
            async where() {
              queryAttempts += 1;
              if (queryAttempts === 1) {
                const error = new Error("relation vacation_plans does not exist") as Error & { code: string };
                error.code = "42P01";
                throw error;
              }
              return [];
            },
          };
        },
      };
    },
    async execute() {
      schemaExecutions += 1;
      return [];
    },
  };

  return {
    database,
    getQueryAttempts: () => queryAttempts,
    getSchemaExecutions: () => schemaExecutions,
  };
}

test("storage de férias cria a tabela ausente e repete a consulta uma vez", async () => {
  const fixture = createDatabaseFixture();
  const storage = new DatabaseStorage(fixture.database as any);

  const rows = await storage.getVacationPlans("user-1");

  assert.deepEqual(rows, []);
  assert.equal(fixture.getQueryAttempts(), 2);
  assert.equal(fixture.getSchemaExecutions(), 1);
});
