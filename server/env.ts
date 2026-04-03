import "dotenv/config";
import { resolveDemoSeedConfig } from "./seed-policy";

function fail(message: string): never {
  throw new Error(`\n[ENV] ${message}\n`);
}

function requireEnv(name: string, help: string): string {
  const raw = process.env[name];
  const value = raw?.trim();
  if (!value) {
    fail(`Variavel obrigatoria ausente: ${name}\n${help}`);
  }
  return value;
}

function resolvePort(raw: string | undefined): number {
  const fallback = 5000;
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    fail(
      `PORT invalida: "${raw}". Use um numero entre 1 e 65535.\n` +
      `Exemplo no .env: PORT=5000`
    );
  }
  return parsed;
}

const databaseUrl = requireEnv(
  "DATABASE_URL",
  "Defina no arquivo .env na raiz do projeto.\n" +
  "Exemplo: DATABASE_URL=postgres://postgres:postgres@localhost:5432/debt_control"
);

const sessionSecret = requireEnv(
  "SESSION_SECRET",
  "Defina no arquivo .env com pelo menos 16 caracteres.\n" +
  "Exemplo: SESSION_SECRET=fincontrol_dev_secret_123456"
);

if (sessionSecret === "troque-por-um-segredo-forte") {
  fail(
    'SESSION_SECRET ainda esta com valor de exemplo ("troque-por-um-segredo-forte").\n' +
    "Troque por um segredo real no arquivo .env."
  );
}

if (sessionSecret.length < 16) {
  fail("SESSION_SECRET muito curto. Use pelo menos 16 caracteres.");
}

const nodeEnv = (process.env.NODE_ENV || "development").trim();
const demoSeed = resolveDemoSeedConfig({
  nodeEnv,
  enableDemoSeed: process.env.ENABLE_DEMO_SEED,
  demoSeedUsername: process.env.DEMO_SEED_USERNAME,
  demoSeedPassword: process.env.DEMO_SEED_PASSWORD,
});

export const ENV = {
  nodeEnv,
  databaseUrl,
  sessionSecret,
  port: resolvePort(process.env.PORT),
  demoSeed,
} as const;
