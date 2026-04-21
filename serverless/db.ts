import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";
import { ENV } from "./env.js";
import { writeTechnicalLog } from "./logger.js";

const isServerlessRuntime =
  ENV.isVercel || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const poolConfig: pg.PoolConfig = {
  connectionString: ENV.databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
  max: isServerlessRuntime ? 3 : 10,
  min: 0,
  idleTimeoutMillis: isServerlessRuntime ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: ENV.nodeEnv !== "production",
  keepAlive: true,
  maxUses: isServerlessRuntime ? 7_500 : undefined,
};

type GlobalWithPgPool = typeof globalThis & {
  __debtControlPgPool?: pg.Pool;
  __debtControlDbDiagLogged?: boolean;
};

const globalWithPgPool = globalThis as GlobalWithPgPool;

// Reusa uma unica Pool por processo para evitar excesso de conexoes em ambiente serverless.
export const pool =
  globalWithPgPool.__debtControlPgPool ??
  new pg.Pool(poolConfig);

if (!globalWithPgPool.__debtControlPgPool) {
  globalWithPgPool.__debtControlPgPool = pool;
  pool.on("error", (error) => {
    console.error("[db.pool] unexpected idle client error", error);
  });
}

function getSanitizedDatabaseUrlInfo(): {
  hostFromUrl: string | null;
  databaseNameFromUrl: string | null;
} {
  try {
    const parsed = new URL(ENV.databaseUrl);
    return {
      hostFromUrl: parsed.hostname || null,
      databaseNameFromUrl: parsed.pathname.replace(/^\/+/, "") || null,
    };
  } catch {
    return {
      hostFromUrl: null,
      databaseNameFromUrl: null,
    };
  }
}

async function logDatabaseConnectionDiagnosticOnce(): Promise<void> {
  if (globalWithPgPool.__debtControlDbDiagLogged) return;
  globalWithPgPool.__debtControlDbDiagLogged = true;

  const { hostFromUrl, databaseNameFromUrl } = getSanitizedDatabaseUrlInfo();

  try {
    const result = await pool.query<{
      current_user: string;
      current_database: string;
      current_schema: string;
    }>(
      `SELECT current_user AS current_user, current_database() AS current_database, current_schema() AS current_schema`,
    );
    const row = result.rows[0];

    writeTechnicalLog({
      event: "db.connection.diagnostic.temp",
      source: "db",
      level: "info",
      data: {
        hostFromUrl,
        databaseNameFromUrl,
        currentUser: row?.current_user ?? null,
        currentDatabase: row?.current_database ?? null,
        currentSchema: row?.current_schema ?? null,
      },
    });
  } catch (error) {
    writeTechnicalLog({
      event: "db.connection.diagnostic.temp.error",
      source: "db",
      level: "error",
      data: {
        hostFromUrl,
        databaseNameFromUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

void logDatabaseConnectionDiagnosticOnce();

// Mantem o fluxo padrao do Drizzle+pg sem prepared statements nomeados customizados.

export const db = drizzle(pool, { schema });
