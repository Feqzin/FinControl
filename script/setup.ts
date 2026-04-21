import { spawn } from "child_process";
import { constants } from "fs";
import { access, copyFile, readFile } from "fs/promises";
import path from "path";

const ROOT_DIR = process.cwd();
const ENV_FILE = path.resolve(ROOT_DIR, ".env");
const ENV_EXAMPLE_FILE = path.resolve(ROOT_DIR, ".env.example");
const SHOULD_RUN_MIGRATIONS = process.argv.includes("--migrate");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureEnvFile(): Promise<void> {
  const envExists = await fileExists(ENV_FILE);
  if (envExists) {
    console.log("[setup] .env ja existe. Nenhuma alteracao necessaria.");
    return;
  }

  const envExampleExists = await fileExists(ENV_EXAMPLE_FILE);
  if (!envExampleExists) {
    throw new Error(
      "[setup] .env.example nao encontrado. Crie o arquivo antes de executar o setup.",
    );
  }

  await copyFile(ENV_EXAMPLE_FILE, ENV_FILE);
  console.log("[setup] .env criado a partir do .env.example.");
}

async function warnOnPlaceholderValues(): Promise<void> {
  const envContent = await readFile(ENV_FILE, "utf8");
  const hasDatabasePlaceholder = envContent.includes("<db_user>") || envContent.includes("<db_host>") || envContent.includes("<db_name>");
  const hasSecretPlaceholder = envContent.includes("troque-por-um-segredo-forte");

  if (hasDatabasePlaceholder || hasSecretPlaceholder) {
    console.log(
      "[setup] AVISO: .env contem placeholders de seguranca. " +
      "Atualize DATABASE_URL e SESSION_SECRET antes de rodar o sistema.",
    );
  }
}

function runNpmScript(scriptName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmCommand, ["run", scriptName], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`[setup] npm run ${scriptName} falhou com codigo ${code}.`));
    });
  });
}

async function run(): Promise<void> {
  console.log("[setup] Validando ambiente...");
  await ensureEnvFile();
  await warnOnPlaceholderValues();

  if (SHOULD_RUN_MIGRATIONS) {
    console.log("[setup] Executando migrations...");
    await runNpmScript("db:migrate");
  }

  console.log("[setup] Concluido.");
  console.log("[setup] Proximo passo: npm run dev");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
