import "dotenv/config";
import { resolveDemoSeedConfig } from "./seed-policy.js";

const PRODUCTION_REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
] as const;

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

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  const value = raw?.trim();
  return value ? value : undefined;
}

function parseCsvEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseBooleanEnv(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  fail(
    `${name} invalida: "${raw}". Use true/false, 1/0, yes/no ou on/off.`
  );
}

function hasPlaceholder(value: string): boolean {
  return value.includes("<") || value.includes(">");
}

function parseUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    fail(`${name} invalida. Informe uma URL valida.`);
  }
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

function resolveNodeEnv(raw: string | undefined): "development" | "test" | "production" {
  const normalized = (raw || "development").trim().toLowerCase();
  if (normalized === "development" || normalized === "test" || normalized === "production") {
    return normalized;
  }
  fail(
    `NODE_ENV invalido: "${raw}". Use development, test ou production.`
  );
}

const nodeEnv = resolveNodeEnv(process.env.NODE_ENV);
const isProduction = nodeEnv === "production";
const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

const databaseUrl = requireEnv(
  "DATABASE_URL",
  "Defina no arquivo .env na raiz do projeto.\n" +
  "Exemplo: DATABASE_URL=postgres://postgres:postgres@localhost:5432/debt_control"
);

if (hasPlaceholder(databaseUrl)) {
  fail(
    "DATABASE_URL parece estar com placeholder do .env.example.\n" +
    "Substitua pelos dados reais de conexao do PostgreSQL."
  );
}

const parsedDatabaseUrl = parseUrl("DATABASE_URL", databaseUrl);
const hasPostgresProtocol =
  parsedDatabaseUrl.protocol === "postgres:" ||
  parsedDatabaseUrl.protocol === "postgresql:";

if (!hasPostgresProtocol) {
  fail(
    `DATABASE_URL deve usar protocolo postgres/postgresql.\n` +
    `Valor atual: ${parsedDatabaseUrl.protocol}`
  );
}

if (
  isProduction &&
  (parsedDatabaseUrl.hostname === "localhost" || parsedDatabaseUrl.hostname === "127.0.0.1")
) {
  fail(
    "DATABASE_URL em producao nao pode apontar para localhost/127.0.0.1."
  );
}

if (isProduction && isVercel) {
  // Em producao na Vercel, use a connection string do Supabase Transaction Pooler.
  const normalizedHost = parsedDatabaseUrl.hostname.toLowerCase();
  const isSupabasePoolerHost =
    normalizedHost.includes("pooler.") && normalizedHost.includes("supabase.");

  if (!isSupabasePoolerHost) {
    fail(
      "DATABASE_URL na Vercel deve usar o host do Supabase pooler transacional (pooler.supabase.*)."
    );
  }

  if (parsedDatabaseUrl.port !== "6543") {
    fail(
      "DATABASE_URL na Vercel deve usar a porta 6543 do Supabase pooler transacional."
    );
  }

  if (parsedDatabaseUrl.searchParams.has("sslmode")) {
    fail(
      "DATABASE_URL na Vercel nao deve incluir sslmode. " +
      "Remova esse parametro da URL para evitar conflito com a configuracao SSL do Pool (serverless/db.ts)."
    );
  }
}

const databaseSslRejectUnauthorizedRaw = parseBooleanEnv(
  "DATABASE_SSL_REJECT_UNAUTHORIZED",
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
);
const databaseSslRejectUnauthorized = databaseSslRejectUnauthorizedRaw ?? isProduction;

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

if (isProduction) {
  const normalizedSecret = sessionSecret.toLowerCase();
  const hasInsecurePattern =
    normalizedSecret.includes("dev_secret") ||
    normalizedSecret.includes("changeme") ||
    normalizedSecret.includes("default") ||
    normalizedSecret.includes("example");

  if (hasInsecurePattern) {
    fail(
      "SESSION_SECRET com padrao inseguro para producao.\n" +
      "Use um segredo forte e exclusivo do ambiente produtivo."
    );
  }

  if (sessionSecret.length < 32) {
    fail("SESSION_SECRET em producao deve ter pelo menos 32 caracteres.");
  }
}

const supabaseUrl = optionalEnv("SUPABASE_URL");
if (supabaseUrl) {
  if (hasPlaceholder(supabaseUrl)) {
    fail("SUPABASE_URL parece estar com placeholder. Substitua por valor real.");
  }
  const parsedSupabaseUrl = parseUrl("SUPABASE_URL", supabaseUrl);
  if (parsedSupabaseUrl.protocol !== "https:") {
    fail("SUPABASE_URL deve usar https.");
  }
}

const supabaseAnonKey = optionalEnv("SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseStorageBucket = optionalEnv("SUPABASE_STORAGE_BUCKET");
const cloudBackupBucket = optionalEnv("CLOUD_BACKUP_BUCKET");
const allowLocalFilesystemStorageFallbackRaw = parseBooleanEnv(
  "ALLOW_LOCAL_FILESYSTEM_STORAGE_FALLBACK",
  process.env.ALLOW_LOCAL_FILESYSTEM_STORAGE_FALLBACK,
);

if (supabaseAnonKey && hasPlaceholder(supabaseAnonKey)) {
  fail("SUPABASE_ANON_KEY parece estar com placeholder. Substitua por valor real.");
}

if (supabaseServiceRoleKey && hasPlaceholder(supabaseServiceRoleKey)) {
  fail("SUPABASE_SERVICE_ROLE_KEY parece estar com placeholder. Substitua por valor real.");
}

if (supabaseStorageBucket) {
  if (hasPlaceholder(supabaseStorageBucket)) {
    fail("SUPABASE_STORAGE_BUCKET parece estar com placeholder. Substitua por valor real.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(supabaseStorageBucket)) {
    fail(
      "SUPABASE_STORAGE_BUCKET invalido. Use apenas letras, numeros, ponto, underline ou hifen."
    );
  }
}

if (cloudBackupBucket) {
  if (hasPlaceholder(cloudBackupBucket)) {
    fail("CLOUD_BACKUP_BUCKET parece estar com placeholder. Substitua por valor real.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(cloudBackupBucket)) {
    fail(
      "CLOUD_BACKUP_BUCKET invalido. Use apenas letras, numeros, ponto, underline ou hifen."
    );
  }
}

if (isProduction && allowLocalFilesystemStorageFallbackRaw === true) {
  fail(
    "ALLOW_LOCAL_FILESYSTEM_STORAGE_FALLBACK nao pode ser habilitado em producao."
  );
}

const missingSupabaseStorageVars = [
  !supabaseUrl ? "SUPABASE_URL" : null,
  !supabaseServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  !supabaseStorageBucket ? "SUPABASE_STORAGE_BUCKET" : null,
].filter((value): value is string => Boolean(value));

if (isProduction) {
  if (missingSupabaseStorageVars.length > 0) {
    fail(
      "Boot bloqueado em producao: o storage de comprovantes exige Supabase Storage.\n" +
      `Variaveis obrigatorias ausentes: ${missingSupabaseStorageVars.join(", ")}\n` +
      `Checklist obrigatorio de producao: ${PRODUCTION_REQUIRED_ENV_VARS.join(", ")}`
    );
  }
}

const allowLocalFilesystemStorageFallback =
  nodeEnv === "development" && allowLocalFilesystemStorageFallbackRaw === true;

const officialIconAdminIdentifiers = parseCsvEnv(process.env.OFFICIAL_ICON_ADMIN_IDENTIFIERS);

const demoSeed = resolveDemoSeedConfig({
  nodeEnv,
  enableDemoSeed: process.env.ENABLE_DEMO_SEED,
  demoSeedUsername: process.env.DEMO_SEED_USERNAME,
  demoSeedPassword: process.env.DEMO_SEED_PASSWORD,
});

export const ENV = {
  nodeEnv,
  isVercel,
  databaseUrl,
  database: {
    ssl: {
      rejectUnauthorized: databaseSslRejectUnauthorized,
      fromEnv: databaseSslRejectUnauthorizedRaw !== undefined,
    },
  },
  sessionSecret,
  port: resolvePort(process.env.PORT),
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
    storageBucket: supabaseStorageBucket,
    cloudBackupBucket: cloudBackupBucket ?? supabaseStorageBucket,
    storageConfigured: missingSupabaseStorageVars.length === 0,
  },
  storage: {
    allowLocalFilesystemFallback: allowLocalFilesystemStorageFallback,
  },
  officialIcons: {
    adminIdentifiers: officialIconAdminIdentifiers,
  },
  demoSeed,
} as const;
