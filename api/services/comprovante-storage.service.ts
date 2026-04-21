import { ENV } from "../env.js";
import { FilesystemComprovanteStorageAdapter } from "./filesystem-comprovante-storage.adapter.js";
import { SupabaseComprovanteStorageAdapter } from "./supabase-comprovante-storage.adapter.js";
import { hasSupabaseStorageConfig } from "./supabase-storage.client.js";
import type {
  ComprovanteStorage,
  PersistComprovanteInput,
  PersistComprovanteOutput,
} from "./comprovante-storage.contract.js";
import { getAllowedComprovanteMimeTypes as getAllowedComprovanteMimeTypesShared } from "./comprovante-storage.shared.js";

const LOCAL_FALLBACK_ENV_VAR = "ALLOW_LOCAL_FILESYSTEM_STORAGE_FALLBACK";

function getMissingSupabaseStorageVars(): string[] {
  return [
    !ENV.supabase.url ? "SUPABASE_URL" : null,
    !ENV.supabase.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !ENV.supabase.storageBucket ? "SUPABASE_STORAGE_BUCKET" : null,
  ].filter((value): value is string => Boolean(value));
}

function resolveComprovanteStorage(): ComprovanteStorage {
  if (hasSupabaseStorageConfig()) {
    return new SupabaseComprovanteStorageAdapter();
  }

  const missingVars = getMissingSupabaseStorageVars();
  const missingVarsMessage = missingVars.length > 0
    ? `Variaveis ausentes: ${missingVars.join(", ")}.`
    : "Variaveis do Supabase Storage nao foram reconhecidas.";

  if (ENV.nodeEnv === "production") {
    throw new Error(
      `[comprovante-storage][BOOT] Supabase Storage e obrigatorio em producao. ${missingVarsMessage}`,
    );
  }

  if (ENV.storage.allowLocalFilesystemFallback) {
    return new FilesystemComprovanteStorageAdapter();
  }

  throw new Error(
    "[comprovante-storage][BOOT] Supabase Storage nao configurado para este ambiente.\n" +
    `${missingVarsMessage}\n` +
    `Para desenvolvimento local, habilite fallback explicitamente com ${LOCAL_FALLBACK_ENV_VAR}=true.`,
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
