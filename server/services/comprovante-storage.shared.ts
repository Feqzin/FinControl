import { randomBytes } from "crypto";
import path from "path";
import type { PagamentoSourceType } from "../validators/pagamentos-timeline.validators";

const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

const MIME_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

export function getAllowedComprovanteMimeTypes(): string[] {
  return Object.keys(MIME_EXTENSION);
}

export function resolveComprovanteExtensionOrThrow(mimeType: string): string {
  const extension = MIME_EXTENSION[mimeType];
  if (!extension) {
    throw new Error("INVALID_FILE_TYPE");
  }
  return extension;
}

export function getComprovanteMaxBytesFromEnv(): number {
  const raw = process.env.PAYMENT_PROOF_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BYTES;
  return Math.min(Math.trunc(parsed), DEFAULT_MAX_BYTES);
}

export function buildComprovanteRelativePath(input: {
  userId: string;
  sourceType: PagamentoSourceType;
  sourceId: string;
  extension: string;
}): string {
  const fileToken = randomBytes(8).toString("hex");
  const fileName = `${Date.now()}-${fileToken}.${input.extension}`;
  return path.posix.join(input.userId, input.sourceType, input.sourceId, fileName);
}

export function sanitizeComprovanteFileName(fileName: string): string {
  const normalized = fileName.replace(/[^\w.\-() ]+/g, "_").trim();
  if (normalized.length === 0) return "comprovante";
  return normalized.slice(0, 120);
}

export function decodeComprovanteBase64OrThrow(contentBase64: string): Buffer {
  const cleaned = contentBase64.includes(",")
    ? (contentBase64.split(",").pop() ?? "")
    : contentBase64;
  const compact = cleaned.replace(/\s+/g, "");
  if (!compact) {
    throw new Error("INVALID_FILE_CONTENT");
  }
  const decoded = Buffer.from(compact, "base64");
  if (decoded.length === 0) {
    throw new Error("INVALID_FILE_CONTENT");
  }
  const normalizedInput = compact.replace(/=+$/g, "");
  const normalizedDecoded = decoded.toString("base64").replace(/=+$/g, "");
  if (normalizedInput !== normalizedDecoded) {
    throw new Error("INVALID_FILE_CONTENT");
  }
  return decoded;
}
