import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { ENV } from "./env";

const isServerlessRuntime =
  ENV.isVercel || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const poolConfig: pg.PoolConfig = {
  connectionString: ENV.databaseUrl,
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

// Mantem o fluxo padrao do Drizzle+pg sem prepared statements nomeados customizados.

export const db = drizzle(pool, { schema });
