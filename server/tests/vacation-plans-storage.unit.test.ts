import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStorage } from "../storage";

function createDatabaseFixture() {
  let queryAttempts = 0;
  let schemaExecutions = 0;
  const insertedBatches: any[][] = [];
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
    insert() {
      return {
        values(rows: any[]) {
          insertedBatches.push(rows);
          return {
            async returning() {
              return rows.map((row, index) => ({ ...row, id: `plan-${index + 1}` }));
            },
          };
        },
      };
    },
  };

  return {
    database,
    getQueryAttempts: () => queryAttempts,
    getSchemaExecutions: () => schemaExecutions,
    getInsertedBatches: () => insertedBatches,
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

test("storage de férias insere várias rendas em uma única operação", async () => {
  const fixture = createDatabaseFixture();
  const storage = new DatabaseStorage(fixture.database as any);
  const rows = [
    {
      userId: "user-1",
      rendaId: "income-1",
      startDate: "2026-09-01",
      durationDays: 30,
      vacationPayReceived: false,
      vacationPayDate: "2026-08-30",
      vacationPayAmount: "3200.00",
      includedInPatrimony: false,
    },
    {
      userId: "user-1",
      rendaId: "income-2",
      startDate: "2026-09-01",
      durationDays: 30,
      vacationPayReceived: false,
      vacationPayDate: "2026-08-30",
      vacationPayAmount: "1600.00",
      includedInPatrimony: false,
    },
  ];

  const created = await storage.createVacationPlans(rows);

  assert.equal(fixture.getInsertedBatches().length, 1);
  assert.deepEqual(fixture.getInsertedBatches()[0], rows);
  assert.deepEqual(created.map((row) => row.id), ["plan-1", "plan-2"]);
});
