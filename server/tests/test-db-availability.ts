import pg from "pg";

const DB_PROBE_TIMEOUT_MS = 1500;
let cachedAvailabilityPromise: Promise<boolean> | null = null;

function hasRequiredDbEnv(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim()) && Boolean(process.env.SESSION_SECRET?.trim());
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
    if (!hasRequiredDbEnv()) return false;
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) return false;

    try {
      return await Promise.race<boolean>([
        probeDatabaseConnection(databaseUrl),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), DB_PROBE_TIMEOUT_MS + 500);
        }),
      ]);
    } catch {
      return false;
    }
  })();

  return cachedAvailabilityPromise;
}
