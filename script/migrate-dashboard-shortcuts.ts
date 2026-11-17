import pg from "pg";
import { readFile } from "node:fs/promises";

if (process.env.VERCEL_ENV === "production") {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL obrigatória para criar preferências por usuário.");

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    const migration = await readFile(new URL("../migrations/0052_user_dashboard_shortcuts.sql", import.meta.url), "utf8");
    await pool.query(migration);
    const groupsMigration = await readFile(new URL("../migrations/0053_user_debt_groups.sql", import.meta.url), "utf8");
    await pool.query(groupsMigration);
    const appearanceMigration = await readFile(new URL("../migrations/0054_user_appearance.sql", import.meta.url), "utf8");
    await pool.query(appearanceMigration);
    console.log("[migrate] preferências, grupos e aparência prontos");
  } finally {
    await pool.end();
  }
}
