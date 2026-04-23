import { z } from "zod";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Meta,
  ParcelaCompra,
  Pessoa,
  PessoaSaldoMovimentacao,
  Servico,
  ServicoPagamento,
  ServicoPessoa,
} from "../../shared/schema.js";

const backupItemSchema = z.object({
  userId: z.unknown().optional(),
}).passthrough();

const backupSectionSchema = z.array(backupItemSchema);

export const backupJsonImportSchema = z.object({
  exportadoEm: z.string().min(1, "Campo obrigatorio: exportadoEm"),
  usuario: z.string().optional().nullable(),
  pessoas: backupSectionSchema.optional().default([]),
  dividas: backupSectionSchema.optional().default([]),
  cartoes: backupSectionSchema.optional().default([]),
  compras: backupSectionSchema.optional().default([]),
  parcelasCompra: backupSectionSchema.optional().default([]),
  servicos: backupSectionSchema.optional().default([]),
  servicoPessoas: backupSectionSchema.optional().default([]),
  servicoPagamentos: backupSectionSchema.optional().default([]),
  pessoaSaldoMovimentacoes: backupSectionSchema.optional().default([]),
  metas: backupSectionSchema.optional().default([]),
}).passthrough();

type Row = Record<string, unknown>;
type WithoutUserId<T> = T extends { userId?: unknown } ? Omit<T, "userId"> : T;

export class BackupJsonParseError extends Error {
  readonly details?: string[];

  constructor(message: string, details?: string[]) {
    super(message);
    this.name = "BackupJsonParseError";
    this.details = details;
  }
}

export type BackupJsonImportPayload = {
  exportadoEm: string;
  usuarioInformado: string | null;
  pessoas: WithoutUserId<Pessoa>[];
  dividas: WithoutUserId<Divida>[];
  cartoes: WithoutUserId<Cartao>[];
  compras: WithoutUserId<CompraCartao>[];
  parcelasCompra: WithoutUserId<ParcelaCompra>[];
  servicos: WithoutUserId<Servico>[];
  servicoPessoas: WithoutUserId<ServicoPessoa>[];
  servicoPagamentos: WithoutUserId<ServicoPagamento>[];
  pessoaSaldoMovimentacoes: WithoutUserId<PessoaSaldoMovimentacao>[];
  metas: WithoutUserId<Meta>[];
};

export type BackupImportMode = "merge" | "replace";

export type BackupJsonImportRequest = {
  modo: BackupImportMode;
  backup: BackupJsonImportPayload;
};

function removeUserIdFromRow(row: Row): Row {
  if (!Object.prototype.hasOwnProperty.call(row, "userId")) return row;
  const { userId: _ignoredUserId, ...rest } = row;
  return rest;
}

function sanitizeRows<T>(rows: Row[]): WithoutUserId<T>[] {
  return rows.map((row) => removeUserIdFromRow(row)) as WithoutUserId<T>[];
}

function parseJsonInput(input: string | unknown): unknown {
  if (typeof input !== "string") return input;

  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new BackupJsonParseError("JSON de backup invalido. Verifique o arquivo e tente novamente.");
  }
}

export function parseBackupJsonImport(input: string | unknown): BackupJsonImportPayload {
  const payload = parseJsonInput(input);
  const parsed = backupJsonImportSchema.safeParse(payload);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "raiz";
      return `${path}: ${issue.message}`;
    });

    throw new BackupJsonParseError(
      `Backup JSON invalido: ${details[0] ?? "estrutura nao reconhecida"}`,
      details,
    );
  }

  return {
    exportadoEm: parsed.data.exportadoEm,
    usuarioInformado: parsed.data.usuario ?? null, // Informativo; nao usar para autenticacao.
    pessoas: sanitizeRows<Pessoa>(parsed.data.pessoas),
    dividas: sanitizeRows<Divida>(parsed.data.dividas),
    cartoes: sanitizeRows<Cartao>(parsed.data.cartoes),
    compras: sanitizeRows<CompraCartao>(parsed.data.compras),
    parcelasCompra: sanitizeRows<ParcelaCompra>(parsed.data.parcelasCompra),
    servicos: sanitizeRows<Servico>(parsed.data.servicos),
    servicoPessoas: sanitizeRows<ServicoPessoa>(parsed.data.servicoPessoas),
    servicoPagamentos: sanitizeRows<ServicoPagamento>(parsed.data.servicoPagamentos),
    pessoaSaldoMovimentacoes: sanitizeRows<PessoaSaldoMovimentacao>(parsed.data.pessoaSaldoMovimentacoes),
    metas: sanitizeRows<Meta>(parsed.data.metas),
  };
}

function parseImportMode(value: unknown): BackupImportMode {
  if (value == null || value === "") return "merge";
  if (typeof value !== "string") {
    throw new BackupJsonParseError("Modo de importacao invalido. Use 'merge' ou 'replace'.");
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "merge" || normalized === "replace") {
    return normalized;
  }

  throw new BackupJsonParseError("Modo de importacao invalido. Use 'merge' ou 'replace'.");
}

export function parseBackupJsonImportRequest(input: string | unknown): BackupJsonImportRequest {
  const payload = parseJsonInput(input);

  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const row = payload as Row;
    if (Object.prototype.hasOwnProperty.call(row, "backup")) {
      return {
        modo: parseImportMode(row.modo ?? row.mode ?? row.importMode),
        backup: parseBackupJsonImport(row.backup),
      };
    }
  }

  return {
    modo: "merge",
    backup: parseBackupJsonImport(payload),
  };
}
