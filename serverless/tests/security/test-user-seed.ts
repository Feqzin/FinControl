import { eq } from "drizzle-orm";
import { users } from "../../../shared/schema";
import { shouldRunDbIntegrationTests } from "../../../server/tests/test-db-availability";
import { db } from "../../db";

type SeededTestUser = {
  id: string;
  cleanup: () => Promise<void>;
};

function sanitizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "security";
}

function buildTestUserId(label: string): string {
  const safeLabel = sanitizeLabel(label);
  return `user_${safeLabel}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

export async function createSecurityTestUser(label: string): Promise<SeededTestUser> {
  const userId = buildTestUserId(label);
  const shouldSeed = await shouldRunDbIntegrationTests();

  if (!shouldSeed) {
    return {
      id: userId,
      cleanup: async () => undefined,
    };
  }

  await db.insert(users).values({
    id: userId,
    username: `${userId}@security.test.local`,
    password: "hash_fake",
  });

  return {
    id: userId,
    cleanup: async () => {
      await db.delete(users).where(eq(users.id, userId));
    },
  };
}
