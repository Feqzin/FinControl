import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

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

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} failed with code ${code ?? "unknown"}`));
    });
  });
}

async function main(): Promise<void> {
  const testDatabaseUrl = resolveTestDatabaseUrl();

  if (!testDatabaseUrl) {
    throw new Error(
      "Defina TEST_DATABASE_URL (ou DATABASE_URL_TEST) em .env.test para rodar test:security:db.",
    );
  }

  assertSafeTestDatabaseUrl(testDatabaseUrl);

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET?.trim() || "fincontrol_test_session_secret",
  };

  console.log("[test:security:db] Usando banco de teste isolado via TEST_DATABASE_URL.");
  await runCommand(npmCommand, ["run", "db:migrate"], env);
  await runCommand(npmCommand, ["run", "test:security"], env);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha ao executar test:security:db.";
  console.error(`[test:security:db] ${message}`);
  process.exit(1);
});
