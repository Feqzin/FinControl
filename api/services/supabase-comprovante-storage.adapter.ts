import type {
  ComprovanteStorage,
  PersistComprovanteInput,
  PersistComprovanteOutput,
} from "./comprovante-storage.contract.js";
import {
  buildComprovanteRelativePath,
  decodeComprovanteBase64OrThrow,
  getAllowedComprovanteMimeTypes,
  getComprovanteMaxBytesFromEnv,
  resolveComprovanteExtensionOrThrow,
  sanitizeComprovanteFileName,
} from "./comprovante-storage.shared.js";
import { SupabaseStorageServerClient } from "./supabase-storage.client.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";

type SupabaseUploadErrorCode =
  | "STORAGE_UNAUTHORIZED"
  | "STORAGE_CONFIGURATION_ERROR"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_UPLOAD_FAILED";

type PreviousDeleteResult =
  | { status: "skipped" }
  | { status: "deleted" }
  | {
    status: "failed";
    reason: "storage_error" | "exception";
    statusCode?: number;
  };

function mapSupabaseUploadStatusToErrorCode(statusCode?: number): SupabaseUploadErrorCode {
  if (statusCode === 401 || statusCode === 403) {
    return "STORAGE_UNAUTHORIZED";
  }

  if (statusCode === 400 || statusCode === 404 || statusCode === 409 || statusCode === 422) {
    return "STORAGE_CONFIGURATION_ERROR";
  }

  if (statusCode === 429 || statusCode === 503) {
    return "STORAGE_UNAVAILABLE";
  }

  if (typeof statusCode === "number" && statusCode >= 500) {
    return "STORAGE_UNAVAILABLE";
  }

  return "STORAGE_UPLOAD_FAILED";
}

export class SupabaseComprovanteStorageAdapter implements ComprovanteStorage {
  private readonly client: SupabaseStorageServerClient;

  constructor(client?: SupabaseStorageServerClient) {
    this.client = client ?? new SupabaseStorageServerClient();
  }

  getAllowedComprovanteMimeTypes(): string[] {
    return getAllowedComprovanteMimeTypes();
  }

  async persistComprovante(input: PersistComprovanteInput): Promise<PersistComprovanteOutput> {
    const extension = resolveComprovanteExtensionOrThrow(input.mimeType);
    const buffer = decodeComprovanteBase64OrThrow(input.contentBase64);

    const maxBytes = getComprovanteMaxBytesFromEnv();
    if (buffer.byteLength > maxBytes) {
      throw new Error("FILE_TOO_LARGE");
    }

    const relativePath = buildComprovanteRelativePath({
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      extension,
    });

    let uploadResult;
    try {
      uploadResult = await this.client.uploadObject(
        relativePath,
        buffer,
        input.mimeType,
      );
    } catch {
      throw new Error("STORAGE_UPLOAD_FAILED");
    }

    if (uploadResult.error) {
      throw new Error(mapSupabaseUploadStatusToErrorCode(uploadResult.error.statusCode));
    }

    const previousDeleteResult = await this.deletePreviousIfPresent(input.previousRelativePath);
    if (previousDeleteResult.status === "failed") {
      // Upload atual deve permanecer valido; a remocao do arquivo anterior e nao-bloqueante.
    }

    return {
      relativePath,
      fileName: sanitizeComprovanteFileName(input.fileName),
      mimeType: input.mimeType,
      size: buffer.byteLength,
      uploadedAt: new Date(),
    };
  }

  async loadComprovanteFile(relativePath: string): Promise<Buffer | null> {
    const result = await this.client.downloadObject(relativePath);
    if (result.error || !result.data) {
      return null;
    }
    return result.data;
  }

  private async deletePreviousIfPresent(relativePath: string | null | undefined): Promise<PreviousDeleteResult> {
    if (!relativePath) return { status: "skipped" };

    try {
      const result = await this.client.removeObject(relativePath);
      if (result.error) {
        writeTechnicalLog({
          event: "storage.comprovante.previous_delete_failed",
          level: "warn",
          source: "supabase-comprovante-storage.adapter",
          data: {
            bucket: this.client.getBucket(),
            previousRelativePath: relativePath,
            reason: "storage_error",
            statusCode: result.error.statusCode ?? null,
            providerMessage: result.error.message,
          },
        });
        return {
          status: "failed",
          reason: "storage_error",
          statusCode: result.error.statusCode,
        };
      }

      return { status: "deleted" };
    } catch (error) {
      writeTechnicalLog({
        event: "storage.comprovante.previous_delete_failed",
        level: "warn",
        source: "supabase-comprovante-storage.adapter",
        data: {
          bucket: this.client.getBucket(),
          previousRelativePath: relativePath,
          reason: "exception",
          error: toErrorLog(error),
        },
      });
      return {
        status: "failed",
        reason: "exception",
      };
    }
  }
}
