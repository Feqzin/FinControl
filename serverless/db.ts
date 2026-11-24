import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "../shared/schema.js";
import { ENV } from "./env.js";

const connectionString = ENV.databaseUrl;
const shouldConfigureSsl =
  ENV.nodeEnv === "production" || ENV.database.ssl.fromEnv;

const poolConfig: PoolConfig = {
  connectionString,
  // Bound concurrency while allowing overview queries and session reads to run together.
  max: 3,
  min: 0,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
  keepAlive: true,
  ...(shouldConfigureSsl
    ? {
      ssl: {
        rejectUnauthorized: ENV.database.ssl.rejectUnauthorized,
      },
    }
    : {}),
};

type GlobalWithPgPool = typeof globalThis & {
  __debtControlPgPool?: Pool;
  __debtControlPgPoolAttached?: boolean;
};

const globalWithPgPool = globalThis as GlobalWithPgPool;

export const pool = globalWithPgPool.__debtControlPgPool ?? new Pool(poolConfig);

if (!globalWithPgPool.__debtControlPgPool) {
  const sslMode = shouldConfigureSsl
    ? `enabled (rejectUnauthorized=${ENV.database.ssl.rejectUnauthorized ? "true" : "false"})`
    : "disabled";
  console.info(`[db.pool][ssl] mode=${sslMode}; env=${ENV.nodeEnv}; runtime=serverless`);

  globalWithPgPool.__debtControlPgPool = pool;
  pool.on("error", (error) => {
    console.error("[db.pool] unexpected idle client error", error);
  });
}

if (!globalWithPgPool.__debtControlPgPoolAttached) {
  // Register synchronously before serving requests; release idle clients on suspension.
  attachDatabasePool(pool);
  globalWithPgPool.__debtControlPgPoolAttached = true;
}

export const db = drizzle(pool, { schema });
