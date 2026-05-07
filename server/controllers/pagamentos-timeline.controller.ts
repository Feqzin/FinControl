import type { Request, Response } from "express";
import { sanitizeForLog, writeTechnicalLog } from "../logger";
import { PagamentosTimelineService } from "../services/pagamentos-timeline.service";
import {
  pagamentoComprovanteBody,
  pagamentoObservacaoBody,
  pagamentoSourceParams,
} from "../validators/pagamentos-timeline.validators";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

function safeFileName(value: string): string {
  return value.replace(/["\r\n]/g, "_").slice(0, 120) || "comprovante";
}

function isComprovanteValidationError(errorCode: string): boolean {
  return errorCode === "INVALID_FILE_TYPE"
    || errorCode === "INVALID_FILE_CONTENT"
    || errorCode === "FILE_TOO_LARGE";
}

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
        return sendBadRequest(res, parsedBody.error.message);
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
  };
}
