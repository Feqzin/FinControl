import type { PagamentoSourceType } from "../validators/pagamentos-timeline.validators";

export type PersistComprovanteInput = {
  userId: string;
  sourceType: PagamentoSourceType;
  sourceId: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  previousRelativePath?: string | null;
};

export type PersistComprovanteOutput = {
  relativePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
};

export interface ComprovanteStorage {
  getAllowedComprovanteMimeTypes(): string[];
  persistComprovante(input: PersistComprovanteInput): Promise<PersistComprovanteOutput>;
  loadComprovanteFile(relativePath: string): Promise<Buffer | null>;
  deleteComprovanteFile?(relativePath: string): Promise<void>;
}
