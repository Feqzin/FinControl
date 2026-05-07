import { promises as fs } from "fs";
import path from "path";
import type {
  ComprovanteStorage,
  PersistComprovanteInput,
  PersistComprovanteOutput,
} from "./comprovante-storage.contract";
import {
  buildComprovanteRelativePath,
  decodeComprovanteBase64OrThrow,
  getAllowedComprovanteMimeTypes,
  getComprovanteMaxBytesFromEnv,
  resolveComprovanteExtensionOrThrow,
  sanitizeComprovanteFileName,
  validateComprovanteBinarySignatureOrThrow,
} from "./comprovante-storage.shared";

export class FilesystemComprovanteStorageAdapter implements ComprovanteStorage {
  getComprovanteStorageRoot(): string {
    const configured = process.env.PAYMENT_PROOF_STORAGE_DIR?.trim();
    if (configured) {
      return path.resolve(configured);
    }
    return path.resolve(process.cwd(), "uploads", "comprovantes");
  }

  getAllowedComprovanteMimeTypes(): string[] {
    return getAllowedComprovanteMimeTypes();
  }

  async persistComprovante(input: PersistComprovanteInput): Promise<PersistComprovanteOutput> {
    const extension = resolveComprovanteExtensionOrThrow(input.mimeType);

    const buffer = decodeComprovanteBase64OrThrow(input.contentBase64);
    validateComprovanteBinarySignatureOrThrow(buffer, input.mimeType);
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
    const absolute = this.resolveInsideRoot(relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);

    await this.deleteFileIfPresent(input.previousRelativePath);

    return {
      relativePath,
      fileName: sanitizeComprovanteFileName(input.fileName),
      mimeType: input.mimeType,
      size: buffer.byteLength,
      uploadedAt: new Date(),
    };
  }

  async loadComprovanteFile(relativePath: string): Promise<Buffer | null> {
    try {
      const absolute = this.resolveInsideRoot(relativePath);
      return await fs.readFile(absolute);
    } catch {
      return null;
    }
  }

  private resolveInsideRoot(relativePath: string): string {
    const root = this.getComprovanteStorageRoot();
    const absolute = path.resolve(root, relativePath);
    const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (!absolute.startsWith(normalizedRoot) && absolute !== root) {
      throw new Error("INVALID_STORAGE_PATH");
    }
    return absolute;
  }

  private async deleteFileIfPresent(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;
    try {
      const absolute = this.resolveInsideRoot(relativePath);
      await fs.rm(absolute, { force: true });
    } catch {
      // best-effort cleanup: se o arquivo nao existir, segue o fluxo.
    }
  }
}
