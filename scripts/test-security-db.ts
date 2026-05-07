import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import pg from "pg";

const ENV_TEST_PATH = resolve(process.cwd(), ".env.test");

if (existsSync(ENV_TEST_PATH)) {
  loadDotenv({ path: ENV_TEST_PATH, override: true });
}

function resolveTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL?.trim()
    || process.env.DATABASE_URL_TEST?.trim()
    || "";
}

function isAllowedTestHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "postgres-test"
    || normalized === "postgres";
}

function assertSafeTestDatabaseUrl(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "TEST_DATABASE_URL/DATABASE_URL_TEST invalido. Use formato postgresql://user:pass@host:port/db.",
    );
  }

  if (!isAllowedTestHost(parsed.hostname)) {
    throw new Error(
      `Host de teste nao permitido: ${parsed.hostname}. ` +
      "Use apenas localhost/127.0.0.1/::1/postgres-test/postgres para evitar risco em producao.",
    );
  }
}

function assertSafeTestDatabaseName(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("URL de banco de teste invalida.");
  }

  const databaseName = parsed.pathname.replace(/^\//, "").trim().toLowerCase();
  if (!databaseName || !databaseName.includes("test")) {
    throw new Error(
      `Nome de banco nao permitido para testes: "${databaseName || "(vazio)"}". ` +
      "Use um banco dedicado contendo 'test' no nome.",
    );
  }
}

type CommandInvocation = {
  command: string;
  args: string[];
};

function resolveNpmInvocation(scriptName: string): CommandInvocation {
  const npmExecPath = process.env.npm_execpath?.trim();

  // Prefer executing npm CLI with the current Node binary for cross-platform stability.
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, "run", scriptName],
    };
  }

  if (process.platform === "win32") {
    // Fallback for Windows when npm_execpath is unavailable.
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", scriptName],
    };
  }

  return {
    command: "npm",
    args: ["run", scriptName],
  };
}

async function assertRequiredScriptsExist(): Promise<void> {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  const packageJsonRaw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};

  for (const name of ["db:push", "db:migrate", "test:security"]) {
    if (!scripts[name]) {
      throw new Error(`Script npm ausente: "${name}".`);
    }
  }
}

function runCommand(scriptName: string, env: NodeJS.ProcessEnv): Promise<void> {
  const { command, args } = resolveNpmInvocation(scriptName);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });

    child.on("error", (error) => {
      const detail = error instanceof Error
        ? (() => {
          const maybeCode = (error as NodeJS.ErrnoException).code;
          return maybeCode ? `${error.name} (${maybeCode})` : error.name;
        })()
        : "unknown_error";
      rejectPromise(new Error(`Falha ao executar npm script "${scriptName}": ${detail}.`));
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Script "${scriptName}" falhou com code ${code ?? "unknown"}.`));
    });
  });
}

async function resetPublicSchemaForTestDb(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE;");
    await pool.query("CREATE SCHEMA public;");
    await pool.query("DO $$ BEGIN EXECUTE format('GRANT ALL ON SCHEMA public TO %I', current_user); END $$;");
    await pool.query("GRANT ALL ON SCHEMA public TO public;");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function assertEssentialTablesExist(databaseUrl: string): Promise<void> {
  const essentialTables = [
    "users",
    "pessoas",
    "dividas",
    "cartoes",
    "compras_cartao",
    "parcelas_compra",
  ];

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
  });

  try {
    const query = `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `;

    const result = await pool.query<{ table_name: string }>(query, [essentialTables]);
    const found = new Set(result.rows.map((row) => row.table_name));
    const missing = essentialTables.filter((table) => !found.has(table));

    if (missing.length > 0) {
      throw new Error(
        `Schema de teste incompleto. Tabelas ausentes: ${missing.join(", ")}.`,
      );
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  await assertRequiredScriptsExist();

  const testDatabaseUrl = resolveTestDatabaseUrl();

  if (!testDatabaseUrl) {
    throw new Error(
      "Defina TEST_DATABASE_URL (ou DATABASE_URL_TEST) em .env.test para rodar test:security:db.",
    );
  }

  assertSafeTestDatabaseUrl(testDatabaseUrl);
  assertSafeTestDatabaseName(testDatabaseUrl);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    DATABASE_URL_TEST: testDatabaseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET?.trim() || "fincontrol_test_session_secret",
  };

  console.log("[test:security:db] Usando banco de teste isolado via TEST_DATABASE_URL.");
  console.log("[test:security:db] Resetando schema public do banco de teste...");
  await resetPublicSchemaForTestDb(testDatabaseUrl);

  // Cria schema base atual a partir do contrato Drizzle.
  await runCommand("db:push", env);

  // Aplica migrations incrementais/históricas para manter compatibilidade.
  await runCommand("db:migrate", env);

  await assertEssentialTablesExist(testDatabaseUrl);
  await runCommand("test:security", env);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha ao executar test:security:db.";
  console.error(`[test:security:db] ${message}`);
  process.exit(1);
});
