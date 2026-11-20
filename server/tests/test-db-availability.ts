import pg from "pg";

const DB_PROBE_TIMEOUT_MS = 1500;
let cachedAvailabilityPromise: Promise<boolean> | null = null;

function resolveTestDatabaseUrl(): string | null {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  if (testDatabaseUrl) return testDatabaseUrl;

  const legacyTestDatabaseUrl = process.env.DATABASE_URL_TEST?.trim();
  if (legacyTestDatabaseUrl) return legacyTestDatabaseUrl;

  return null;
}

function hasRequiredDbEnv(): boolean {
  return Boolean(resolveTestDatabaseUrl()) && Boolean(process.env.SESSION_SECRET?.trim());
}

async function probeDatabaseConnection(databaseUrl: string): Promise<boolean> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: DB_PROBE_TIMEOUT_MS,
    statement_timeout: DB_PROBE_TIMEOUT_MS,
    query_timeout: DB_PROBE_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function shouldRunDbIntegrationTests(): Promise<boolean> {
  if (cachedAvailabilityPromise) {
    return cachedAvailabilityPromise;
  }

  cachedAvailabilityPromise = (async () => {
    if (!hasRequiredDbEnv()) {
      if (process.env.REQUIRE_TEST_DATABASE === "true") {
        throw new Error("Testes de integração exigem TEST_DATABASE_URL e SESSION_SECRET.");
      }
      return false;
    }
    const databaseUrl = resolveTestDatabaseUrl();
    if (!databaseUrl) return false;

    try {
      const available = await Promise.race<boolean>([
        probeDatabaseConnection(databaseUrl),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), DB_PROBE_TIMEOUT_MS + 500);
        }),
      ]);
      if (!available && process.env.REQUIRE_TEST_DATABASE === "true") {
        throw new Error("Banco de teste inacessível; testes de integração não podem ser ignorados.");
      }
      return available;
    } catch {
      if (process.env.REQUIRE_TEST_DATABASE === "true") {
        throw new Error("Banco de teste inacessível; testes de integração não podem ser ignorados.");
      }
      return false;
    }
  })();

  return cachedAvailabilityPromise;
}
