import { format } from "date-fns";
import type { Divida, Parcela, ParcelaCompra } from "@shared/schema";
import type { FinancialRepository } from "../repositories/financial.repository";
import {
  comprovanteStorage as defaultComprovanteStorage,
  type ComprovanteStorage,
} from "./comprovante-storage.service";
import type {
  PagamentoComprovanteBodyInput,
  PagamentoObservacaoBodyInput,
  PagamentoSourceType,
} from "../validators/pagamentos-timeline.validators";

type TimelineStatus = "pago" | "vencido" | "pendente";
type TimelineKind = "pagamento_realizado" | "pagamento_vencido" | "pagamento_pendente";

type ComprovanteResumo = {
  nome: string;
  mimeType: string;
  tamanho: number;
  enviadoEm: string | null;
  downloadUrl: string;
};

export type TimelinePagamentoEvent = {
  id: string;
  sourceType: PagamentoSourceType;
  sourceId: string;
  dividaId: string;
  tipoDivida: Divida["tipo"];
  titulo: string;
  kind: TimelineKind;
  status: TimelineStatus;
  dataEvento: string;
  dataPagamento: string | null;
  dataVencimento: string | null;
  valor: string;
  observacaoPagamento: string | null;
  comprovante: ComprovanteResumo | null;
};

type TimelineSourceRecord = {
  sourceType: PagamentoSourceType;
  sourceId: string;
  observacaoPagamento: string | null;
  comprovantePath: string | null;
  comprovanteNome: string | null;
  comprovanteMimeType: string | null;
  comprovanteTamanho: number | null;
  comprovanteEnviadoEm: Date | null;
};

type SourceDetails = {
  source: TimelineSourceRecord;
};

type ComprovanteDownload = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

type UploadValidationErrorCode = "INVALID_FILE_TYPE" | "INVALID_FILE_CONTENT" | "FILE_TOO_LARGE";
type UploadStorageInfraErrorCode =
  | "STORAGE_UNAUTHORIZED"
  | "STORAGE_CONFIGURATION_ERROR"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_UPLOAD_FAILED";

const UPLOAD_VALIDATION_ERRORS: Record<UploadValidationErrorCode, true> = {
  INVALID_FILE_TYPE: true,
  INVALID_FILE_CONTENT: true,
  FILE_TOO_LARGE: true,
};

const UPLOAD_STORAGE_INFRA_ERRORS: Record<UploadStorageInfraErrorCode, true> = {
  STORAGE_UNAUTHORIZED: true,
  STORAGE_CONFIGURATION_ERROR: true,
  STORAGE_UNAVAILABLE: true,
  STORAGE_UPLOAD_FAILED: true,
};

function isUploadValidationErrorCode(value: string): value is UploadValidationErrorCode {
  return Object.prototype.hasOwnProperty.call(UPLOAD_VALIDATION_ERRORS, value);
}

function isUploadStorageInfraErrorCode(value: string): value is UploadStorageInfraErrorCode {
  return Object.prototype.hasOwnProperty.call(UPLOAD_STORAGE_INFRA_ERRORS, value);
}

type HttpErrorWithStatus = Error & {
  status?: number;
  statusCode?: number;
  code?: string;
};

function createComprovanteUploadInfraError(statusCode: number): HttpErrorWithStatus {
  const error = new Error("Erro interno ao processar upload do comprovante.") as HttpErrorWithStatus;
  error.status = statusCode;
  error.statusCode = statusCode;
  error.code = "COMPROVANTE_UPLOAD_INFRA_ERROR";
  return error;
}

const todayIso = () => format(new Date(), "yyyy-MM-dd");

function isPaidStatus(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "pago";
}

function isOpenStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "pendente" || normalized === "vencido" || normalized === "parcial";
}

function isOverdueDate(dateValue: string | null | undefined): boolean {
  if (!dateValue) return false;
  return dateValue < todayIso();
}

function buildComprovanteResumo(
  sourceType: PagamentoSourceType,
  sourceId: string,
  source: TimelineSourceRecord,
): ComprovanteResumo | null {
  if (!source.comprovantePath || !source.comprovanteNome || !source.comprovanteMimeType || source.comprovanteTamanho == null) {
    return null;
  }
  return {
    nome: source.comprovanteNome,
    mimeType: source.comprovanteMimeType,
    tamanho: source.comprovanteTamanho,
    enviadoEm: source.comprovanteEnviadoEm ? source.comprovanteEnviadoEm.toISOString() : null,
    downloadUrl: `/api/pagamentos/${sourceType}/${sourceId}/comprovante`,
  };
}

function toTimelineEventFromParcela(divida: Divida, parcela: Parcela): TimelinePagamentoEvent | null {
  const paid = isPaidStatus(parcela.status);
  const overdue = isOpenStatus(parcela.status) && isOverdueDate(parcela.dataVencimento);

  const eventDate = paid ? parcela.dataPagamento : parcela.dataVencimento;
  if (!eventDate) return null;

  const source: TimelineSourceRecord = {
    sourceType: "parcela",
    sourceId: parcela.id,
    observacaoPagamento: parcela.observacaoPagamento ?? null,
    comprovantePath: parcela.comprovantePath ?? null,
    comprovanteNome: parcela.comprovanteNome ?? null,
    comprovanteMimeType: parcela.comprovanteMimeType ?? null,
    comprovanteTamanho: parcela.comprovanteTamanho ?? null,
    comprovanteEnviadoEm: parcela.comprovanteEnviadoEm ?? null,
  };

  const tituloBase = divida.descricao
    ? `${divida.descricao}`
    : (divida.tipo === "receber" ? "Dívida a receber" : "Dívida a pagar");

  return {
    id: `parcela:${parcela.id}`,
    sourceType: "parcela",
    sourceId: parcela.id,
    dividaId: divida.id,
    tipoDivida: divida.tipo,
    titulo: `${tituloBase} · Parcela ${parcela.numero}`,
    kind: paid ? "pagamento_realizado" : (overdue ? "pagamento_vencido" : "pagamento_pendente"),
    status: paid ? "pago" : (overdue ? "vencido" : "pendente"),
    dataEvento: eventDate,
    dataPagamento: parcela.dataPagamento ?? null,
    dataVencimento: parcela.dataVencimento ?? null,
    valor: parcela.valor,
    observacaoPagamento: source.observacaoPagamento,
    comprovante: buildComprovanteResumo("parcela", parcela.id, source),
  };
}

function toTimelineEventFromDivida(divida: Divida): TimelinePagamentoEvent | null {
  const paid = isPaidStatus(divida.status);
  const dueDate = divida.dataVencimento ?? null;
  const overdue = isOpenStatus(divida.status) && dueDate !== null && dueDate < todayIso();

  const eventDate = paid ? divida.dataPagamento : divida.dataVencimento;
  if (!eventDate) return null;

  const source: TimelineSourceRecord = {
    sourceType: "divida",
    sourceId: divida.id,
    observacaoPagamento: divida.observacaoPagamento ?? null,
    comprovantePath: divida.comprovantePath ?? null,
    comprovanteNome: divida.comprovanteNome ?? null,
    comprovanteMimeType: divida.comprovanteMimeType ?? null,
    comprovanteTamanho: divida.comprovanteTamanho ?? null,
    comprovanteEnviadoEm: divida.comprovanteEnviadoEm ?? null,
  };

  return {
    id: `divida:${divida.id}`,
    sourceType: "divida",
    sourceId: divida.id,
    dividaId: divida.id,
    tipoDivida: divida.tipo,
    titulo: divida.descricao
      ? divida.descricao
      : (divida.tipo === "receber" ? "Dívida a receber" : "Dívida a pagar"),
    kind: paid ? "pagamento_realizado" : (overdue ? "pagamento_vencido" : "pagamento_pendente"),
    status: paid ? "pago" : (overdue ? "vencido" : "pendente"),
    dataEvento: eventDate,
    dataPagamento: divida.dataPagamento ?? null,
    dataVencimento: divida.dataVencimento ?? null,
    valor: divida.valor,
    observacaoPagamento: source.observacaoPagamento,
    comprovante: buildComprovanteResumo("divida", divida.id, source),
  };
}

function sortTimeline(events: TimelinePagamentoEvent[]): TimelinePagamentoEvent[] {
  return [...events].sort((a, b) => {
    const dateCompare = b.dataEvento.localeCompare(a.dataEvento);
    if (dateCompare !== 0) return dateCompare;
    return b.id.localeCompare(a.id);
  });
}

export class PagamentosTimelineService {
  constructor(
    private readonly repository: FinancialRepository,
    private readonly storage: ComprovanteStorage = defaultComprovanteStorage,
  ) {}

  async listByPessoa(pessoaId: string, userId: string): Promise<{ events: TimelinePagamentoEvent[] } | { error: "PESSOA_NOT_FOUND" }> {
    const pessoa = await this.repository.getPessoa(pessoaId, userId);
    if (!pessoa) return { error: "PESSOA_NOT_FOUND" };

    const dividas = await this.repository.getDividasByPessoa(pessoaId, userId);
    const events: TimelinePagamentoEvent[] = [];

    for (const divida of dividas) {
      const linkedParcelas = await this.repository.getParcelasByDivida(divida.id, userId);
      if (linkedParcelas.length > 0) {
        for (const parcela of linkedParcelas) {
          const event = toTimelineEventFromParcela(divida, parcela);
          if (event) events.push(event);
        }
        continue;
      }

      const event = toTimelineEventFromDivida(divida);
      if (event) events.push(event);
    }

    return { events: sortTimeline(events) };
  }

  private async getSourceDetails(
    sourceType: PagamentoSourceType,
    sourceId: string,
    userId: string,
  ): Promise<SourceDetails | null> {
    if (sourceType === "parcela") {
      const parcela = await this.repository.getParcela(sourceId, userId);
      if (!parcela) return null;
      return {
        source: {
          sourceType,
          sourceId: parcela.id,
          observacaoPagamento: parcela.observacaoPagamento ?? null,
          comprovantePath: parcela.comprovantePath ?? null,
          comprovanteNome: parcela.comprovanteNome ?? null,
          comprovanteMimeType: parcela.comprovanteMimeType ?? null,
          comprovanteTamanho: parcela.comprovanteTamanho ?? null,
          comprovanteEnviadoEm: parcela.comprovanteEnviadoEm ?? null,
        },
      };
    }

    if (sourceType === "parcela_compra") {
      const parcelaCompra: ParcelaCompra | undefined = await this.repository.getParcelaCompraById(sourceId, userId);
      if (!parcelaCompra) return null;
      return {
        source: {
          sourceType,
          sourceId: parcelaCompra.id,
          observacaoPagamento: null,
          comprovantePath: parcelaCompra.comprovantePath ?? null,
          comprovanteNome: parcelaCompra.comprovanteNome ?? null,
          comprovanteMimeType: parcelaCompra.comprovanteMimeType ?? null,
          comprovanteTamanho: parcelaCompra.comprovanteTamanho ?? null,
          comprovanteEnviadoEm: parcelaCompra.comprovanteEnviadoEm ?? null,
        },
      };
    }

    if (sourceType === "cnpj_das_importacao") {
      const importacao = await this.repository.getCnpjDasImportacao(sourceId, userId);
      if (!importacao) return null;
      return {
        source: {
          sourceType,
          sourceId: importacao.id,
          observacaoPagamento: null,
          comprovantePath: importacao.comprovantePath ?? null,
          comprovanteNome: importacao.comprovanteNome ?? null,
          comprovanteMimeType: importacao.comprovanteMimeType ?? null,
          comprovanteTamanho: importacao.comprovanteTamanho ?? null,
          comprovanteEnviadoEm: importacao.comprovanteEnviadoEm ?? null,
        },
      };
    }

    const divida = await this.repository.getDivida(sourceId, userId);
    if (!divida) return null;
    return {
      source: {
        sourceType,
        sourceId: divida.id,
        observacaoPagamento: divida.observacaoPagamento ?? null,
        comprovantePath: divida.comprovantePath ?? null,
        comprovanteNome: divida.comprovanteNome ?? null,
        comprovanteMimeType: divida.comprovanteMimeType ?? null,
        comprovanteTamanho: divida.comprovanteTamanho ?? null,
        comprovanteEnviadoEm: divida.comprovanteEnviadoEm ?? null,
      },
    };
  }

  async updateObservacao(
    sourceType: PagamentoSourceType,
    sourceId: string,
    userId: string,
    body: PagamentoObservacaoBodyInput,
  ): Promise<{ ok: true; observacaoPagamento: string | null } | { error: "NOT_FOUND" }> {
    const source = await this.getSourceDetails(sourceType, sourceId, userId);
    if (!source) return { error: "NOT_FOUND" };

    if (sourceType === "parcela") {
      const updated = await this.repository.updateParcela(sourceId, userId, {
        observacaoPagamento: body.observacaoPagamento ?? null,
      });
      if (!updated) return { error: "NOT_FOUND" };
      return { ok: true, observacaoPagamento: updated.observacaoPagamento ?? null };
    }

    if (sourceType === "parcela_compra") {
      return { error: "NOT_FOUND" };
    }
    if (sourceType === "cnpj_das_importacao") {
      return { error: "NOT_FOUND" };
    }

    const updated = await this.repository.updateDivida(sourceId, userId, {
      observacaoPagamento: body.observacaoPagamento ?? null,
    });
    if (!updated) return { error: "NOT_FOUND" };
    return { ok: true, observacaoPagamento: updated.observacaoPagamento ?? null };
  }

  async uploadComprovante(
    sourceType: PagamentoSourceType,
    sourceId: string,
    userId: string,
    body: PagamentoComprovanteBodyInput,
  ): Promise<{ comprovante: ComprovanteResumo } | { error: "NOT_FOUND" | "INVALID_FILE_TYPE" | "INVALID_FILE_CONTENT" | "FILE_TOO_LARGE" }> {
    if (sourceType === "cnpj_das_importacao" && body.mimeType !== "application/pdf") {
      return { error: "INVALID_FILE_TYPE" };
    }
    const source = await this.getSourceDetails(sourceType, sourceId, userId);
    if (!source) return { error: "NOT_FOUND" };

    let persisted;
    try {
      persisted = await this.storage.persistComprovante({
        userId,
        sourceType,
        sourceId,
        fileName: body.fileName,
        mimeType: body.mimeType,
        contentBase64: body.contentBase64,
        previousRelativePath: source.source.comprovantePath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "STORAGE_UPLOAD_FAILED";
      if (isUploadValidationErrorCode(message)) {
        return { error: message };
      }

      if (isUploadStorageInfraErrorCode(message)) {
        const status = message === "STORAGE_UNAVAILABLE" ? 503 : 500;
        throw createComprovanteUploadInfraError(status);
      }

      throw createComprovanteUploadInfraError(500);
    }

    if (sourceType === "parcela") {
      const updated = await this.repository.updateParcela(sourceId, userId, {
        comprovantePath: persisted.relativePath,
        comprovanteNome: persisted.fileName,
        comprovanteMimeType: persisted.mimeType,
        comprovanteTamanho: persisted.size,
        comprovanteEnviadoEm: persisted.uploadedAt,
      });
      if (!updated) return { error: "NOT_FOUND" };
    } else if (sourceType === "parcela_compra") {
      const updated = await this.repository.updateParcelaCompra(sourceId, userId, {
        comprovantePath: persisted.relativePath,
        comprovanteNome: persisted.fileName,
        comprovanteMimeType: persisted.mimeType,
        comprovanteTamanho: persisted.size,
        comprovanteEnviadoEm: persisted.uploadedAt,
      });
      if (!updated) return { error: "NOT_FOUND" };
    } else if (sourceType === "cnpj_das_importacao") {
      const updated = await this.repository.updateCnpjDasImportacao(sourceId, userId, {
        comprovantePath: persisted.relativePath,
        comprovanteNome: persisted.fileName,
        comprovanteMimeType: persisted.mimeType,
        comprovanteTamanho: persisted.size,
        comprovanteEnviadoEm: persisted.uploadedAt,
      });
      if (!updated) return { error: "NOT_FOUND" };
    } else {
      const updated = await this.repository.updateDivida(sourceId, userId, {
        comprovantePath: persisted.relativePath,
        comprovanteNome: persisted.fileName,
        comprovanteMimeType: persisted.mimeType,
        comprovanteTamanho: persisted.size,
        comprovanteEnviadoEm: persisted.uploadedAt,
      });
      if (!updated) return { error: "NOT_FOUND" };
    }

    return {
      comprovante: {
        nome: persisted.fileName,
        mimeType: persisted.mimeType,
        tamanho: persisted.size,
        enviadoEm: persisted.uploadedAt.toISOString(),
        downloadUrl: `/api/pagamentos/${sourceType}/${sourceId}/comprovante`,
      },
    };
  }

  async deleteComprovante(
    sourceType: PagamentoSourceType,
    sourceId: string,
    userId: string,
  ): Promise<{ ok: true } | { error: "NOT_FOUND" }> {
    const source = await this.getSourceDetails(sourceType, sourceId, userId);
    if (!source || !source.source.comprovantePath) {
      return { error: "NOT_FOUND" };
    }

    if (this.storage.deleteComprovanteFile) {
      await this.storage.deleteComprovanteFile(source.source.comprovantePath);
    }

    if (sourceType === "parcela") {
      const updated = await this.repository.updateParcela(sourceId, userId, {
        comprovantePath: null,
        comprovanteNome: null,
        comprovanteMimeType: null,
        comprovanteTamanho: null,
        comprovanteEnviadoEm: null,
      });
      if (!updated) return { error: "NOT_FOUND" };
      return { ok: true };
    }

    if (sourceType === "parcela_compra") {
      const updated = await this.repository.updateParcelaCompra(sourceId, userId, {
        comprovantePath: null,
        comprovanteNome: null,
        comprovanteMimeType: null,
        comprovanteTamanho: null,
        comprovanteEnviadoEm: null,
      });
      if (!updated) return { error: "NOT_FOUND" };
      return { ok: true };
    }

    if (sourceType === "cnpj_das_importacao") {
      const updated = await this.repository.updateCnpjDasImportacao(sourceId, userId, {
        comprovantePath: null,
        comprovanteNome: null,
        comprovanteMimeType: null,
        comprovanteTamanho: null,
        comprovanteEnviadoEm: null,
      });
      if (!updated) return { error: "NOT_FOUND" };
      return { ok: true };
    }

    const updated = await this.repository.updateDivida(sourceId, userId, {
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    });
    if (!updated) return { error: "NOT_FOUND" };
    return { ok: true };
  }

  async getComprovanteDownload(
    sourceType: PagamentoSourceType,
    sourceId: string,
    userId: string,
  ): Promise<ComprovanteDownload | { error: "NOT_FOUND" }> {
    const source = await this.getSourceDetails(sourceType, sourceId, userId);
    if (!source || !source.source.comprovantePath || !source.source.comprovanteMimeType || !source.source.comprovanteNome) {
      return { error: "NOT_FOUND" };
    }
    const buffer = await this.storage.loadComprovanteFile(source.source.comprovantePath);
    if (!buffer) return { error: "NOT_FOUND" };

    return {
      buffer,
      mimeType: source.source.comprovanteMimeType,
      fileName: source.source.comprovanteNome,
    };
  }
}
