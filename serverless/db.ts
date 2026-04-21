import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "../shared/schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("[DB] Variavel obrigatoria ausente: DATABASE_URL");
}

const poolConfig: PoolConfig = {
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 1,
  min: 0,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
};

type GlobalWithPgPool = typeof globalThis & {
  __debtControlPgPool?: Pool;
  __debtControlPgPoolAttached?: boolean;
};

const globalWithPgPool = globalThis as GlobalWithPgPool;

export const pool = globalWithPgPool.__debtControlPgPool ?? new Pool(poolConfig);

if (!globalWithPgPool.__debtControlPgPool) {
  globalWithPgPool.__debtControlPgPool = pool;
  pool.on("error", (error) => {
    console.error("[db.pool] unexpected idle client error", error);
  });
}

if (!globalWithPgPool.__debtControlPgPoolAttached) {
  globalWithPgPool.__debtControlPgPoolAttached = true;
  void (async () => {
    try {
      // @ts-ignore: dependencia opcional em ambiente local.
      const { attachDatabasePool } = await import("@vercel/functions");
      if (typeof attachDatabasePool === "function") {
        attachDatabasePool(pool);
      }
    } catch {
      // Ignora quando @vercel/functions nao estiver instalado localmente.
    }
  })();
}

export const db = drizzle(pool, { schema });
