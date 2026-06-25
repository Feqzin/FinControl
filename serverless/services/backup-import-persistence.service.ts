import { eq } from "drizzle-orm";
import type {
  InsertCartao,
  InsertCompraCartao,
  InsertDivida,
  InsertMeta,
  InsertParcelaCompra,
  InsertPessoa,
  InsertPessoaSaldoMovimentacao,
  InsertServico,
  InsertServicoPagamento,
  InsertServicoPessoa,
} from "../../shared/schema.js";
import {
  cartoes as cartoesTable,
  comprasCartao as comprasCartaoTable,
  dividas as dividasTable,
  importLogs as importLogsTable,
  metas as metasTable,
  parcelas as parcelasTable,
  parcelasCompra as parcelasCompraTable,
  pessoaSaldoMovimentacoes as pessoaSaldoMovimentacoesTable,
  pessoas as pessoasTable,
  servicoPagamentos as servicoPagamentosTable,
  servicoPessoas as servicoPessoasTable,
  servicos as servicosTable,
} from "../../shared/schema.js";
import { db } from "../db.js";
import { DatabaseStorage } from "../storage.js";
import type { BackupImportTransformResult } from "./backup-import-transform.service.js";
import type { BackupImportMode } from "../validators/backup-import.validators.js";
import { resolveServicoBackupBillingFields } from "./backup-import-servicos.utils.js";
import { resolveServicoCategoryValue } from "../../shared/service-categories.js";
import {
  BACKUP_RESTORE_SUPPORTED_MODULE_KEYS,
  type BackupRestoreAction,
  type BackupRestoreModuleKey,
} from "../../shared/backup-restore-modules.js";

type JsonRow = Record<string, unknown>;

type InsertPessoaWithId = InsertPessoa & { id: string };
type InsertCartaoWithId = InsertCartao & { id: string };
type InsertDividaWithId = InsertDivida & { id: string };
type InsertCompraCartaoWithId = InsertCompraCartao & { id: string };
type InsertParcelaCompraWithId = InsertParcelaCompra & { id: string };
type InsertServicoWithId = InsertServico & { id: string };
type InsertServicoPessoaWithId = InsertServicoPessoa & { id: string };
type InsertServicoPagamentoWithId = InsertServicoPagamento & { id: string };
type InsertPessoaSaldoMovimentacaoWithId = InsertPessoaSaldoMovimentacao & { id: string };
type InsertMetaWithId = InsertMeta & { id: string };

export type BackupImportPersistenceResult = {
  pessoasInseridas: number;
  cartoesInseridos: number;
  dividasInseridas: number;
  comprasInseridas: number;
  parcelasCompraInseridas: number;
  servicosInseridos: number;
  servicoPessoasInseridas: number;
  servicoPagamentosInseridos: number;
  saldoMovimentacoesInseridas: number;
  metasInseridas: number;
};

type BackupImportPersistenceOptions = {
  modo?: BackupImportMode;
  moduleActions?: Partial<Record<BackupRestoreModuleKey, BackupRestoreAction>>;
  userId: string;
};

type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0];

function asRow(value: unknown, label: string): JsonRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Registro invalido em ${label}`);
  }
  return value as JsonRow;
}

function readRequiredString(row: JsonRow, field: string, label: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Campo obrigatorio invalido: ${label}.${field}`);
  }
  return value.trim();
}

function readOptionalString(row: JsonRow, field: string, label: string): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Campo invalido: ${label}.${field}`);
  }
  return value;
}

function readRequiredInteger(row: JsonRow, field: string, label: string): number {
  const value = row[field];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  throw new Error(`Campo obrigatorio invalido: ${label}.${field}`);
}

function readOptionalInteger(row: JsonRow, field: string, label: string): number | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  throw new Error(`Campo invalido: ${label}.${field}`);
}

function readOptionalMonth(row: JsonRow, field: string, label: string): number | null {
  const value = readOptionalInteger(row, field, label);
  if (value == null) return null;
  if (value < 1 || value > 12) {
    throw new Error(`Campo invalido: ${label}.${field}`);
  }
  return value;
}

function readRequiredDecimal(row: JsonRow, field: string, label: string): string {
  const value = row[field];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new Error(`Campo obrigatorio invalido: ${label}.${field}`);
}

function readOptionalDecimal(row: JsonRow, field: string, label: string): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new Error(`Campo invalido: ${label}.${field}`);
}

function readOptionalBoolean(row: JsonRow, field: string, label: string): boolean | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  throw new Error(`Campo invalido: ${label}.${field}`);
}

function readOptionalDate(row: JsonRow, field: string, label: string): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Campo invalido: ${label}.${field}`);
  }
  return value;
}

function readRequiredMonth(row: JsonRow, field: string, label: string): string {
  const value = row[field];
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim())) {
    throw new Error(`Campo obrigatorio invalido: ${label}.${field}`);
  }
  return value.trim();
}

function readOptionalTimestamp(row: JsonRow, field: string, label: string): Date | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new Error(`Campo invalido: ${label}.${field}`);
}

function toPessoaInsert(row: JsonRow, label: string): InsertPessoaWithId {
  const deletedAt =
    readOptionalTimestamp(row, "deletedAt", label)
    ?? readOptionalTimestamp(row, "deleted_at", label);

  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    nome: readRequiredString(row, "nome", label),
    tipo: readRequiredString(row, "tipo", label),
    telefone: readOptionalString(row, "telefone", label),
    observacao: readOptionalString(row, "observacao", label),
    deletedAt,
  };
}

function toCartaoInsert(row: JsonRow, label: string): InsertCartaoWithId {
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    nome: readRequiredString(row, "nome", label),
    limite: readRequiredDecimal(row, "limite", label),
    melhorDiaCompra: readRequiredInteger(row, "melhorDiaCompra", label),
    diaVencimento: readRequiredInteger(row, "diaVencimento", label),
    iconeId: readOptionalString(row, "iconeId", label),
  };
}

function toDividaInsert(row: JsonRow, label: string): InsertDividaWithId {
  const deletedAt =
    readOptionalTimestamp(row, "deletedAt", label)
    ?? readOptionalTimestamp(row, "deleted_at", label);

  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    pessoaId: readRequiredString(row, "pessoaId", label),
    tipo: readRequiredString(row, "tipo", label),
    valor: readRequiredDecimal(row, "valor", label),
    dataVencimento: readOptionalDate(row, "dataVencimento", label),
    status: readOptionalString(row, "status", label) ?? "pendente",
    dataPagamento: readOptionalDate(row, "dataPagamento", label),
    formaPagamento: readOptionalString(row, "formaPagamento", label),
    observacaoPagamento: readOptionalString(row, "observacaoPagamento", label),
    comprovantePath: readOptionalString(row, "comprovantePath", label),
    comprovanteNome: readOptionalString(row, "comprovanteNome", label),
    comprovanteMimeType: readOptionalString(row, "comprovanteMimeType", label),
    comprovanteTamanho: readOptionalInteger(row, "comprovanteTamanho", label),
    comprovanteEnviadoEm: readOptionalTimestamp(row, "comprovanteEnviadoEm", label),
    descricao: readOptionalString(row, "descricao", label),
    totalParcelas: readOptionalInteger(row, "totalParcelas", label),
    valorTotal: readOptionalDecimal(row, "valorTotal", label),
    deletedAt,
  };
}

function toCompraInsert(row: JsonRow, label: string): InsertCompraCartaoWithId {
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    cartaoId: readRequiredString(row, "cartaoId", label),
    descricao: readRequiredString(row, "descricao", label),
    valorTotal: readRequiredDecimal(row, "valorTotal", label),
    parcelas: readRequiredInteger(row, "parcelas", label),
    parcelaAtual: readRequiredInteger(row, "parcelaAtual", label),
    valorParcela: readRequiredDecimal(row, "valorParcela", label),
    dataCompra: readRequiredString(row, "dataCompra", label),
    pessoaId: readOptionalString(row, "pessoaId", label),
    statusPessoa: readOptionalString(row, "statusPessoa", label),
    dataPagamentoPessoa: readOptionalDate(row, "dataPagamentoPessoa", label),
  };
}

function toParcelaCompraInsert(row: JsonRow, label: string): InsertParcelaCompraWithId {
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    compraCartaoId: readRequiredString(row, "compraCartaoId", label),
    numero: readRequiredInteger(row, "numero", label),
    valor: readRequiredDecimal(row, "valor", label),
    dataVencimento: readOptionalDate(row, "dataVencimento", label),
    statusCartao: readOptionalString(row, "statusCartao", label) ?? "pendente",
    dataPagamentoCartao: readOptionalDate(row, "dataPagamentoCartao", label),
    statusPessoa: readOptionalString(row, "statusPessoa", label),
    dataPagamentoPessoa: readOptionalDate(row, "dataPagamentoPessoa", label),
  };
}

function toServicoInsert(row: JsonRow, label: string): InsertServicoWithId {
  const categoriaRaw = readRequiredString(row, "categoria", label);
  const categoria = resolveServicoCategoryValue(categoriaRaw);
  if (!categoria) {
    throw new Error(`Campo invalido: ${label}.categoria`);
  }
  const valorMensal = readOptionalDecimal(row, "valorMensal", label);
  const valorCobranca = readOptionalDecimal(row, "valorCobranca", label);
  const periodicidadeCobranca = readOptionalString(row, "periodicidadeCobranca", label);
  const billing = resolveServicoBackupBillingFields(
    {
      valorMensal,
      valorCobranca,
      periodicidadeCobranca,
    },
    label,
  );

  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    nome: readRequiredString(row, "nome", label),
    categoria,
    valorMensal: billing.valorMensal,
    valorCobranca: billing.valorCobranca,
    periodicidadeCobranca: billing.periodicidadeCobranca,
    dataCobranca: readOptionalInteger(row, "dataCobranca", label),
    mesCobranca: readOptionalMonth(row, "mesCobranca", label)
      ?? (billing.periodicidadeCobranca === "anual" ? (new Date().getMonth() + 1) : null),
    formaPagamento: readRequiredString(row, "formaPagamento", label),
    cartaoId: readOptionalString(row, "cartaoId", label),
    projetarNaFaturaCartao: readOptionalBoolean(row, "projetarNaFaturaCartao", label) ?? false,
    compraCartaoId: readOptionalString(row, "compraCartaoId", label),
    status: readOptionalString(row, "status", label) ?? "ativo",
    iconeId: readOptionalString(row, "iconeId", label),
  };
}

function toServicoPessoaInsert(row: JsonRow, label: string): InsertServicoPessoaWithId {
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    servicoId: readRequiredString(row, "servicoId", label),
    pessoaId: readRequiredString(row, "pessoaId", label),
    valorDevido: readRequiredDecimal(row, "valorDevido", label),
  };
}

function toServicoPagamentoInsert(row: JsonRow, label: string): InsertServicoPagamentoWithId {
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    servicoPessoaId: readRequiredString(row, "servicoPessoaId", label),
    mes: readRequiredMonth(row, "mes", label),
    status: readOptionalString(row, "status", label) ?? "pago",
    dataPagamento: readOptionalDate(row, "dataPagamento", label),
  };
}

function toPessoaSaldoMovimentacaoInsert(row: JsonRow, label: string): InsertPessoaSaldoMovimentacaoWithId {
  const tipo = readRequiredString(row, "tipo", label);
  if (tipo !== "credito" && tipo !== "debito") {
    throw new Error(`Campo obrigatorio invalido: ${label}.tipo`);
  }

  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    pessoaId: readRequiredString(row, "pessoaId", label),
    tipo,
    valor: readRequiredDecimal(row, "valor", label),
    data: readRequiredString(row, "data", label),
    origem: readOptionalString(row, "origem", label) ?? "manual",
    categoria: readOptionalString(row, "categoria", label),
    observacao: readOptionalString(row, "observacao", label),
    comprovanteReferencia: readOptionalString(row, "comprovanteReferencia", label),
    dividaId: readOptionalString(row, "dividaId", label),
    compraCartaoId: readOptionalString(row, "compraCartaoId", label),
    parcelaCompraId: readOptionalString(row, "parcelaCompraId", label),
    servicoPessoaId: readOptionalString(row, "servicoPessoaId", label),
  };
}

function toMetaInsert(row: JsonRow, label: string): InsertMetaWithId {
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    nome: readRequiredString(row, "nome", label),
    descricao: readOptionalString(row, "descricao", label),
    valorAlvo: readRequiredDecimal(row, "valorAlvo", label),
    valorAtual: readOptionalDecimal(row, "valorAtual", label) ?? "0",
    prazo: readRequiredString(row, "prazo", label),
    status: readOptionalString(row, "status", label) ?? "ativa",
  };
}

async function clearUserFinancialDataForReplace(tx: TxLike, userId: string): Promise<void> {
  // Ordem explicita: filhos -> pais para manter compatibilidade com bancos legados.
  await tx.delete(importLogsTable).where(eq(importLogsTable.userId, userId));
  await tx.delete(pessoaSaldoMovimentacoesTable).where(eq(pessoaSaldoMovimentacoesTable.userId, userId));
  await tx.delete(servicoPagamentosTable).where(eq(servicoPagamentosTable.userId, userId));
  await tx.delete(servicoPessoasTable).where(eq(servicoPessoasTable.userId, userId));
  await tx.delete(servicosTable).where(eq(servicosTable.userId, userId));
  await tx.delete(parcelasCompraTable).where(eq(parcelasCompraTable.userId, userId));
  await tx.delete(comprasCartaoTable).where(eq(comprasCartaoTable.userId, userId));
  await tx.delete(parcelasTable).where(eq(parcelasTable.userId, userId));
  await tx.delete(dividasTable).where(eq(dividasTable.userId, userId));
  await tx.delete(metasTable).where(eq(metasTable.userId, userId));
  await tx.delete(cartoesTable).where(eq(cartoesTable.userId, userId));
  await tx.delete(pessoasTable).where(eq(pessoasTable.userId, userId));
}

function resolveModuleActions(
  modo: BackupImportMode,
  actions?: Partial<Record<BackupRestoreModuleKey, BackupRestoreAction>>,
): Record<BackupRestoreModuleKey, BackupRestoreAction> {
  if (modo === "merge" || modo === "replace") {
    return BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.reduce((acc, moduleKey) => {
      acc[moduleKey] = modo;
      return acc;
    }, {} as Record<BackupRestoreModuleKey, BackupRestoreAction>);
  }

  return BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.reduce((acc, moduleKey) => {
    const requested = actions?.[moduleKey];
    acc[moduleKey] = requested === "merge" || requested === "replace" || requested === "ignore"
      ? requested
      : "ignore";
    return acc;
  }, {} as Record<BackupRestoreModuleKey, BackupRestoreAction>);
}

async function clearUserFinancialDataForCustomReplace(
  tx: TxLike,
  userId: string,
  moduleActions: Record<BackupRestoreModuleKey, BackupRestoreAction>,
): Promise<void> {
  if (moduleActions.servicoPagamentos === "replace") {
    await tx.delete(servicoPagamentosTable).where(eq(servicoPagamentosTable.userId, userId));
  }
  if (moduleActions.servicoPessoas === "replace") {
    await tx.delete(servicoPessoasTable).where(eq(servicoPessoasTable.userId, userId));
  }
  if (moduleActions.pessoaSaldoMovimentacoes === "replace") {
    await tx.delete(pessoaSaldoMovimentacoesTable).where(eq(pessoaSaldoMovimentacoesTable.userId, userId));
  }
  if (moduleActions.parcelasCompra === "replace") {
    await tx.delete(parcelasCompraTable).where(eq(parcelasCompraTable.userId, userId));
  }
  if (moduleActions.servicos === "replace") {
    await tx.delete(servicosTable).where(eq(servicosTable.userId, userId));
  }
  if (moduleActions.compras === "replace") {
    await tx.delete(comprasCartaoTable).where(eq(comprasCartaoTable.userId, userId));
  }
  if (moduleActions.dividas === "replace") {
    await tx.delete(dividasTable).where(eq(dividasTable.userId, userId));
  }
  if (moduleActions.metas === "replace") {
    await tx.delete(metasTable).where(eq(metasTable.userId, userId));
  }
  if (moduleActions.cartoes === "replace") {
    await tx.delete(cartoesTable).where(eq(cartoesTable.userId, userId));
  }
  if (moduleActions.pessoas === "replace") {
    await tx.delete(pessoasTable).where(eq(pessoasTable.userId, userId));
  }
}

export async function persistTransformedBackupImport(
  transformed: BackupImportTransformResult,
  options: BackupImportPersistenceOptions,
): Promise<BackupImportPersistenceResult> {
  const modo = options.modo ?? "merge";
  const userId = options.userId;
  const moduleActions = resolveModuleActions(modo, options.moduleActions);
  const pessoasRows = transformed.pessoas.map((item, index) => toPessoaInsert(asRow(item, `pessoas[${index}]`), `pessoas[${index}]`));
  const cartoesRows = transformed.cartoes.map((item, index) => toCartaoInsert(asRow(item, `cartoes[${index}]`), `cartoes[${index}]`));
  const dividasRows = transformed.dividas.map((item, index) => toDividaInsert(asRow(item, `dividas[${index}]`), `dividas[${index}]`));
  const comprasRows = transformed.compras.map((item, index) => toCompraInsert(asRow(item, `compras[${index}]`), `compras[${index}]`));
  const parcelasCompraRows = transformed.parcelasCompra.map((item, index) =>
    toParcelaCompraInsert(asRow(item, `parcelasCompra[${index}]`), `parcelasCompra[${index}]`),
  );
  const servicosRows = transformed.servicos.map((item, index) => toServicoInsert(asRow(item, `servicos[${index}]`), `servicos[${index}]`));
  const servicoPessoasRows = transformed.servicoPessoas.map((item, index) =>
    toServicoPessoaInsert(asRow(item, `servicoPessoas[${index}]`), `servicoPessoas[${index}]`),
  );
  const servicoPagamentosRowsRaw = transformed.servicoPagamentos.map((item, index) =>
    toServicoPagamentoInsert(asRow(item, `servicoPagamentos[${index}]`), `servicoPagamentos[${index}]`),
  );
  const pessoaSaldoMovimentacoesRows = transformed.pessoaSaldoMovimentacoes.map((item, index) =>
    toPessoaSaldoMovimentacaoInsert(
      asRow(item, `pessoaSaldoMovimentacoes[${index}]`),
      `pessoaSaldoMovimentacoes[${index}]`,
    ),
  );
  const servicoPagamentosByKey = new Map<string, InsertServicoPagamentoWithId>();
  for (const row of servicoPagamentosRowsRaw) {
    const key = `${row.servicoPessoaId}:${row.mes}`;
    const previous = servicoPagamentosByKey.get(key);
    if (!previous) {
      servicoPagamentosByKey.set(key, row);
      continue;
    }

    const prevDate = String(previous.dataPagamento ?? "");
    const currDate = String(row.dataPagamento ?? "");
    const pickCurrent = currDate > prevDate || (currDate === prevDate && row.id > previous.id);
    if (pickCurrent) {
      servicoPagamentosByKey.set(key, row);
    }
  }
  const servicoPagamentosRows = Array.from(servicoPagamentosByKey.values());
  const metasRows = transformed.metas.map((item, index) => toMetaInsert(asRow(item, `metas[${index}]`), `metas[${index}]`));

  await db.transaction(async (tx) => {
    if (modo === "replace") {
      await clearUserFinancialDataForReplace(tx, userId);
    } else if (modo === "custom") {
      await clearUserFinancialDataForCustomReplace(tx, userId, moduleActions);
    }

    const txStorage = new DatabaseStorage(tx);

    if (moduleActions.pessoas !== "ignore") {
      for (const pessoa of pessoasRows) {
        await txStorage.createPessoa(pessoa as unknown as InsertPessoa);
      }
    }

    if (moduleActions.cartoes !== "ignore") {
      for (const cartao of cartoesRows) {
        await txStorage.createCartao(cartao as unknown as InsertCartao);
      }
    }

    if (moduleActions.dividas !== "ignore") {
      for (const divida of dividasRows) {
        await txStorage.createDivida(divida as unknown as InsertDivida);
      }
    }

    if (moduleActions.compras !== "ignore") {
      for (const compra of comprasRows) {
        await txStorage.createCompraCartao(compra as unknown as InsertCompraCartao);
      }
    }

    if (moduleActions.parcelasCompra !== "ignore" && parcelasCompraRows.length > 0) {
      await txStorage.createParcelasCompraBulk(parcelasCompraRows as unknown as InsertParcelaCompra[]);
    }

    if (moduleActions.servicos !== "ignore") {
      for (const servico of servicosRows) {
        await txStorage.createServico(servico as unknown as InsertServico);
      }
    }

    if (moduleActions.servicoPessoas !== "ignore") {
      for (const servicoPessoa of servicoPessoasRows) {
        await txStorage.createServicoPessoa(servicoPessoa as unknown as InsertServicoPessoa);
      }
    }

    if (moduleActions.servicoPagamentos !== "ignore") {
      for (const servicoPagamento of servicoPagamentosRows) {
        await txStorage.createServicoPagamento(servicoPagamento as unknown as InsertServicoPagamento);
      }
    }

    if (moduleActions.pessoaSaldoMovimentacoes !== "ignore") {
      for (const movimentacao of pessoaSaldoMovimentacoesRows) {
        await txStorage.createPessoaSaldoMovimentacao(movimentacao as unknown as InsertPessoaSaldoMovimentacao);
      }
    }

    if (moduleActions.metas !== "ignore") {
      for (const meta of metasRows) {
        await txStorage.createMeta(meta as unknown as InsertMeta);
      }
    }
  });

  return {
    pessoasInseridas: moduleActions.pessoas === "ignore" ? 0 : pessoasRows.length,
    cartoesInseridos: moduleActions.cartoes === "ignore" ? 0 : cartoesRows.length,
    dividasInseridas: moduleActions.dividas === "ignore" ? 0 : dividasRows.length,
    comprasInseridas: moduleActions.compras === "ignore" ? 0 : comprasRows.length,
    parcelasCompraInseridas: moduleActions.parcelasCompra === "ignore" ? 0 : parcelasCompraRows.length,
    servicosInseridos: moduleActions.servicos === "ignore" ? 0 : servicosRows.length,
    servicoPessoasInseridas: moduleActions.servicoPessoas === "ignore" ? 0 : servicoPessoasRows.length,
    servicoPagamentosInseridos: moduleActions.servicoPagamentos === "ignore" ? 0 : servicoPagamentosRows.length,
    saldoMovimentacoesInseridas: moduleActions.pessoaSaldoMovimentacoes === "ignore" ? 0 : pessoaSaldoMovimentacoesRows.length,
    metasInseridas: moduleActions.metas === "ignore" ? 0 : metasRows.length,
  };
}
