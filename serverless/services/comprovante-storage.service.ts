import { ENV } from "../env.js";
import { FilesystemComprovanteStorageAdapter } from "./filesystem-comprovante-storage.adapter.js";
import { SupabaseComprovanteStorageAdapter } from "./supabase-comprovante-storage.adapter.js";
import { hasSupabaseStorageConfig } from "./supabase-storage.client.js";
import { writeTechnicalLog } from "../logger.js";
import type {
  ComprovanteStorage,
  PersistComprovanteInput,
  PersistComprovanteOutput,
} from "./comprovante-storage.contract.js";
import { getAllowedComprovanteMimeTypes as getAllowedComprovanteMimeTypesShared } from "./comprovante-storage.shared.js";

const LOCAL_FALLBACK_ENV_VAR = "ALLOW_LOCAL_FILESYSTEM_STORAGE_FALLBACK";

function logStorageBoot(
  mode: "supabase" | "filesystem_fallback" | "boot_error",
  details?: Record<string, unknown>,
): void {
  writeTechnicalLog({
    event: "storage.comprovante.boot",
    level: mode === "boot_error" ? "error" : "info",
    source: "comprovante-storage.service",
    data: {
      mode,
      nodeEnv: ENV.nodeEnv,
      ...details,
    },
  });
}

function getMissingSupabaseStorageVars(): string[] {
  return [
    !ENV.supabase.url ? "SUPABASE_URL" : null,
    !ENV.supabase.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !ENV.supabase.storageBucket ? "SUPABASE_STORAGE_BUCKET" : null,
  ].filter((value): value is string => Boolean(value));
}

function resolveComprovanteStorage(): ComprovanteStorage {
  if (hasSupabaseStorageConfig()) {
    logStorageBoot("supabase", {
      bucket: ENV.supabase.storageBucket ?? ENV.supabase.cloudBackupBucket ?? null,
    });
    return new SupabaseComprovanteStorageAdapter();
  }

  const missingVars = getMissingSupabaseStorageVars();
  const missingVarsMessage = missingVars.length > 0
    ? `Variaveis ausentes: ${missingVars.join(", ")}.`
    : "Variaveis do Supabase Storage nao foram reconhecidas.";

  if (ENV.nodeEnv === "production") {
    logStorageBoot("boot_error", {
      reason: "missing_supabase_config_in_production",
      missingVars,
    });
    throw new Error(
      `[comprovante-storage][BOOT] Supabase Storage e obrigatorio em producao. ${missingVarsMessage}`,
    );
  }

  if (ENV.storage.allowLocalFilesystemFallback) {
    const fallbackAdapter = new FilesystemComprovanteStorageAdapter();
    logStorageBoot("filesystem_fallback", {
      root: fallbackAdapter.getComprovanteStorageRoot(),
      missingVars,
      fallbackEnvVar: LOCAL_FALLBACK_ENV_VAR,
    });
    return fallbackAdapter;
  }

  logStorageBoot("boot_error", {
    reason: "missing_supabase_config_and_fallback_disabled",
    missingVars,
    fallbackEnvVar: LOCAL_FALLBACK_ENV_VAR,
  });
  throw new Error(
    "[comprovante-storage][BOOT] Supabase Storage nao configurado para este ambiente.\n" +
    `${missingVarsMessage}\n` +
    `Para desenvolvimento local, habilite fallback com ${LOCAL_FALLBACK_ENV_VAR}=true.`,
  );
}

const defaultComprovanteStorage = resolveComprovanteStorage();

export const comprovanteStorage: ComprovanteStorage = defaultComprovanteStorage;

export function getComprovanteStorageRoot(): string {
  if (defaultComprovanteStorage instanceof FilesystemComprovanteStorageAdapter) {
    return defaultComprovanteStorage.getComprovanteStorageRoot();
  }
  return `supabase://${ENV.supabase.storageBucket ?? "undefined-bucket"}`;
}

export function getAllowedComprovanteMimeTypes(): string[] {
  return getAllowedComprovanteMimeTypesShared();
}

export function persistComprovante(input: PersistComprovanteInput): Promise<PersistComprovanteOutput> {
  return defaultComprovanteStorage.persistComprovante(input);
}

export function loadComprovanteFile(relativePath: string): Promise<Buffer | null> {
  return defaultComprovanteStorage.loadComprovanteFile(relativePath);
}

export type {
  ComprovanteStorage,
  PersistComprovanteInput,
  PersistComprovanteOutput,
};

export { FilesystemComprovanteStorageAdapter };
export { SupabaseComprovanteStorageAdapter };
