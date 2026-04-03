import "dotenv/config";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import pg from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL obrigatoria para executar migrations.");
  }
  return value;
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function run(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const files = await listMigrationFiles();

  if (files.length === 0) {
    console.log("[migrate] Nenhum arquivo SQL em migrations/.");
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    for (const file of files) {
      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(migrationPath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      const existing = await client.query<{ checksum: string }>(
        `SELECT checksum FROM schema_migrations WHERE id = $1`,
        [file],
      );

      if (existing.rowCount && existing.rows[0].checksum !== checksum) {
        throw new Error(
          `[migrate] Checksum diferente para migration ja aplicada: ${file}. ` +
          "Nao altere migrations antigas; crie uma nova."
        );
      }

      if (existing.rowCount) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }

      console.log(`[migrate] apply ${file}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)`,
        [file, checksum],
      );
      console.log(`[migrate] done ${file}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
