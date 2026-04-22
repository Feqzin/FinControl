import type {
  InsertCartao,
  InsertCompraCartao,
  InsertDivida,
  InsertMeta,
  InsertParcelaCompra,
  InsertPessoa,
  InsertServico,
} from "../../shared/schema.js";
import { db } from "../db.js";
import { DatabaseStorage } from "../storage.js";
import type { BackupImportTransformResult } from "./backup-import-transform.service.js";

type JsonRow = Record<string, unknown>;

type InsertPessoaWithId = InsertPessoa & { id: string };
type InsertCartaoWithId = InsertCartao & { id: string };
type InsertDividaWithId = InsertDivida & { id: string };
type InsertCompraCartaoWithId = InsertCompraCartao & { id: string };
type InsertParcelaCompraWithId = InsertParcelaCompra & { id: string };
type InsertServicoWithId = InsertServico & { id: string };
type InsertMetaWithId = InsertMeta & { id: string };

export type BackupImportPersistenceResult = {
  pessoasInseridas: number;
  cartoesInseridos: number;
  dividasInseridas: number;
  comprasInseridas: number;
  parcelasCompraInseridas: number;
  servicosInseridos: number;
  metasInseridas: number;
};

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

function readOptionalDate(row: JsonRow, field: string, label: string): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Campo invalido: ${label}.${field}`);
  }
  return value;
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
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    nome: readRequiredString(row, "nome", label),
    tipo: readRequiredString(row, "tipo", label),
    telefone: readOptionalString(row, "telefone", label),
    observacao: readOptionalString(row, "observacao", label),
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
  return {
    id: readRequiredString(row, "id", label),
    userId: readRequiredString(row, "userId", label),
    nome: readRequiredString(row, "nome", label),
    categoria: readRequiredString(row, "categoria", label),
    valorMensal: readRequiredDecimal(row, "valorMensal", label),
    dataCobranca: readRequiredInteger(row, "dataCobranca", label),
    formaPagamento: readRequiredString(row, "formaPagamento", label),
    status: readOptionalString(row, "status", label) ?? "ativo",
    iconeId: readOptionalString(row, "iconeId", label),
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

export async function persistTransformedBackupImport(
  transformed: BackupImportTransformResult,
): Promise<BackupImportPersistenceResult> {
  const pessoasRows = transformed.pessoas.map((item, index) => toPessoaInsert(asRow(item, `pessoas[${index}]`), `pessoas[${index}]`));
  const cartoesRows = transformed.cartoes.map((item, index) => toCartaoInsert(asRow(item, `cartoes[${index}]`), `cartoes[${index}]`));
  const dividasRows = transformed.dividas.map((item, index) => toDividaInsert(asRow(item, `dividas[${index}]`), `dividas[${index}]`));
  const comprasRows = transformed.compras.map((item, index) => toCompraInsert(asRow(item, `compras[${index}]`), `compras[${index}]`));
  const parcelasCompraRows = transformed.parcelasCompra.map((item, index) =>
    toParcelaCompraInsert(asRow(item, `parcelasCompra[${index}]`), `parcelasCompra[${index}]`),
  );
  const servicosRows = transformed.servicos.map((item, index) => toServicoInsert(asRow(item, `servicos[${index}]`), `servicos[${index}]`));
  const metasRows = transformed.metas.map((item, index) => toMetaInsert(asRow(item, `metas[${index}]`), `metas[${index}]`));

  await db.transaction(async (tx) => {
    const txStorage = new DatabaseStorage(tx);

    for (const pessoa of pessoasRows) {
      await txStorage.createPessoa(pessoa as unknown as InsertPessoa);
    }

    for (const cartao of cartoesRows) {
      await txStorage.createCartao(cartao as unknown as InsertCartao);
    }

    for (const divida of dividasRows) {
      await txStorage.createDivida(divida as unknown as InsertDivida);
    }

    for (const compra of comprasRows) {
      await txStorage.createCompraCartao(compra as unknown as InsertCompraCartao);
    }

    if (parcelasCompraRows.length > 0) {
      await txStorage.createParcelasCompraBulk(parcelasCompraRows as unknown as InsertParcelaCompra[]);
    }

    for (const servico of servicosRows) {
      await txStorage.createServico(servico as unknown as InsertServico);
    }

    for (const meta of metasRows) {
      await txStorage.createMeta(meta as unknown as InsertMeta);
    }
  });

  return {
    pessoasInseridas: pessoasRows.length,
    cartoesInseridos: cartoesRows.length,
    dividasInseridas: dividasRows.length,
    comprasInseridas: comprasRows.length,
    parcelasCompraInseridas: parcelasCompraRows.length,
    servicosInseridos: servicosRows.length,
    metasInseridas: metasRows.length,
  };
}
