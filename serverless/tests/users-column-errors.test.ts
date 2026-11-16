import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/fincontrol_test";
process.env.SESSION_SECRET ??= "test-session-secret-123456";

const { isMissingUsersOptionalColumnsError } = await import("../storage.js");

test("does not mistake a connection failure for an absent users column", () => {
  const connectionError = Object.assign(new Error("tenant or user not found"), { code: "XX000" });
  const drizzleError = new Error(
    'Failed query: select "users"."id", "users"."email" from "users"',
    { cause: connectionError },
  );
  assert.equal(isMissingUsersOptionalColumnsError(drizzleError), false);
});

test("falls back only when PostgreSQL identifies a missing optional column", () => {
  const missingOptional = Object.assign(new Error('column "users"."email" does not exist'), { code: "42703" });
  assert.equal(isMissingUsersOptionalColumnsError(new Error("Failed query", { cause: missingOptional })), true);

  const missingRequired = Object.assign(new Error('column "users"."username" does not exist'), { code: "42703" });
  assert.equal(isMissingUsersOptionalColumnsError(new Error("Failed query", { cause: missingRequired })), false);
});
