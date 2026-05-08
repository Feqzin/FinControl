import type { Request, Response } from "express";
import { sanitizeForLog, writeTechnicalLog } from "../logger.js";
import { PagamentosTimelineService } from "../services/pagamentos-timeline.service.js";
import {
  pagamentoComprovanteBody,
  pagamentoObservacaoBody,
  pagamentoSourceParams,
} from "../validators/pagamentos-timeline.validators.js";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

function safeFileName(value: string): string {
  return value.replace(/["\r\n]/g, "_").slice(0, 120) || "comprovante";
}

function isComprovanteValidationError(errorCode: string): boolean {
  return errorCode === "INVALID_FILE_TYPE"
    || errorCode === "INVALID_FILE_CONTENT"
    || errorCode === "FILE_TOO_LARGE";
}

const INVALID_COMPROVANTE_MESSAGE = "Arquivo invalido ou nao permitido.";

export function createPagamentosTimelineController(service: PagamentosTimelineService) {
  return {
    listByPessoa: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");

      const result = await service.listByPessoa(pessoaId, userId);
      if ("error" in result) {
        return sendNotFound(res, "Pessoa not found");
      }
      return res.json(result.events);
    },

    updateObservacao: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const sourceType = getParam(req, "sourceType");
      const sourceId = getParam(req, "sourceId");

      const params = pagamentoSourceParams.safeParse({ sourceType, sourceId });
      if (!params.success) {
        return sendBadRequest(res, params.error.message);
      }

      const parsedBody = pagamentoObservacaoBody.safeParse(req.body);
      if (!parsedBody.success) {
        return sendBadRequest(res, parsedBody.error.message);
      }

      const result = await service.updateObservacao(
        params.data.sourceType,
        params.data.sourceId,
        userId,
        parsedBody.data,
      );

      if ("error" in result) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "pagamentos_timeline",
          userId,
          targetId: params.data.sourceId,
          details: { reason: "not_found", sourceType: params.data.sourceType },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "pagamentos_timeline",
        userId,
        targetId: params.data.sourceId,
        details: {
          sourceType: params.data.sourceType,
          hasObservacao: Boolean(result.observacaoPagamento),
        },
      });

      return res.json(result);
    },

    uploadComprovante: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const sourceType = getParam(req, "sourceType");
      const sourceId = getParam(req, "sourceId");

      const params = pagamentoSourceParams.safeParse({ sourceType, sourceId });
      if (!params.success) {
        return sendBadRequest(res, params.error.message);
      }

      const parsedBody = pagamentoComprovanteBody.safeParse(req.body);
      if (!parsedBody.success) {
        const rawBody = (req.body && typeof req.body === "object")
          ? (req.body as Record<string, unknown>)
          : {};
        const fileName = typeof rawBody.fileName === "string" ? rawBody.fileName : undefined;
        const mimeType = typeof rawBody.mimeType === "string" ? rawBody.mimeType : undefined;
        const payloadLength = typeof rawBody.contentBase64 === "string" ? rawBody.contentBase64.length : 0;

        writeTechnicalLog({
          event: "security.comprovante_upload.rejected",
          level: "warn",
          source: "pagamentos-timeline.controller",
          data: {
            userId,
            sourceType: params.data.sourceType,
            sourceId: params.data.sourceId,
            reason: "payload_validation_error",
            fileName,
            mimeType,
            payloadLength,
            issueCodes: parsedBody.error.issues.map((issue) => issue.code).slice(0, 5),
          },
        });

        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "pagamentos_timeline",
          userId,
          targetId: params.data.sourceId,
          details: {
            reason: "validation_error",
            sourceType: params.data.sourceType,
            payload: sanitizeForLog({ fileName, mimeType }),
          },
        });

        return res.status(400).json({
          error: INVALID_COMPROVANTE_MESSAGE,
          message: INVALID_COMPROVANTE_MESSAGE,
        });
      }

      const result = await service.uploadComprovante(
        params.data.sourceType,
        params.data.sourceId,
        userId,
        parsedBody.data,
      );

      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 400;
        const messageMap: Record<string, string> = {
          NOT_FOUND: "Not found",
          INVALID_FILE_TYPE: "Arquivo inválido ou não permitido.",
          INVALID_FILE_CONTENT: "Arquivo inválido ou não permitido.",
          FILE_TOO_LARGE: "Arquivo excede o tamanho máximo permitido.",
        };

        if (isComprovanteValidationError(result.error)) {
          writeTechnicalLog({
            event: "security.comprovante_upload.rejected",
            level: "warn",
            source: "pagamentos-timeline.controller",
            data: {
              userId,
              sourceType: params.data.sourceType,
              sourceId: params.data.sourceId,
              errorCode: result.error,
              fileName: parsedBody.data.fileName,
              mimeType: parsedBody.data.mimeType,
              payloadLength: parsedBody.data.contentBase64.length,
            },
          });
        }

        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "pagamentos_timeline",
          userId,
          targetId: params.data.sourceId,
          details: {
            reason: result.error.toLowerCase(),
            sourceType: params.data.sourceType,
            payload: sanitizeForLog({
              fileName: parsedBody.data.fileName,
              mimeType: parsedBody.data.mimeType,
            }),
          },
        });

        const resolvedMessage = messageMap[result.error] ?? "Erro no upload do comprovante";
        return res.status(status).json({
          error: resolvedMessage,
          message: resolvedMessage,
        });
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "pagamentos_timeline",
        userId,
        targetId: params.data.sourceId,
        details: {
          sourceType: params.data.sourceType,
          comprovante: {
            mimeType: result.comprovante.mimeType,
            tamanho: result.comprovante.tamanho,
          },
        },
      });

      return res.json(result);
    },

    getComprovante: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const sourceType = getParam(req, "sourceType");
      const sourceId = getParam(req, "sourceId");

      const params = pagamentoSourceParams.safeParse({ sourceType, sourceId });
      if (!params.success) {
        return sendBadRequest(res, params.error.message);
      }

      const result = await service.getComprovanteDownload(
        params.data.sourceType,
        params.data.sourceId,
        userId,
      );

      if ("error" in result) {
        return sendNotFound(res, "Comprovante not found");
      }

      res.setHeader("Content-Type", result.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${safeFileName(result.fileName)}"`);
      return res.send(result.buffer);
    },

    deleteComprovante: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const sourceType = getParam(req, "sourceType");
      const sourceId = getParam(req, "sourceId");

      const params = pagamentoSourceParams.safeParse({ sourceType, sourceId });
      if (!params.success) {
        return sendBadRequest(res, params.error.message);
      }

      const result = await service.deleteComprovante(
        params.data.sourceType,
        params.data.sourceId,
        userId,
      );

      if ("error" in result) {
        return sendNotFound(res, "Comprovante not found");
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "pagamentos_timeline",
        userId,
        targetId: params.data.sourceId,
        details: {
          sourceType: params.data.sourceType,
          comprovanteRemoved: true,
        },
      });

      return res.status(204).send();
    },
  };
}
