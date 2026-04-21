import type { Request, Response } from "express";
import { auditRequest, getParam, getUserId } from "./controller-utils";
import { ImportPipelineError, ImportsService } from "../services/imports.service";
import { importConfirmBody, importPreviewBody } from "../validators/import.validators";

function handleError(req: Request, res: Response, userId: string, domain: string, error: unknown, targetId?: string) {
  if (error instanceof ImportPipelineError) {
    auditRequest(req, {
      action: "import",
      status: "failure",
      domain,
      userId,
      targetId,
      details: { message: error.message, details: error.details as any },
    });
    return res.status(error.status).json({
      message: error.message,
      details: error.details ?? null,
    });
  }

  auditRequest(req, {
    action: "import",
    status: "error",
    domain,
    userId,
    targetId,
    error: error instanceof Error ? error.message : "Unexpected error",
  });
  return res.status(500).json({ message: "Erro interno no pipeline de importacao" });
}

export function createImportsController(service: ImportsService) {
  return {
    preview: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = importPreviewBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "import",
          status: "failure",
          domain: "imports_preview",
          userId,
          details: { reason: "validation_error" },
        });
        return res.status(400).json({ message: parsed.error.message });
      }

      try {
        const result = await service.preview(userId, parsed.data);
        auditRequest(req, {
          action: "import",
          status: "success",
          domain: "imports_preview",
          userId,
          targetId: result.importLogId,
          details: {
            sourceType: parsed.data.sourceType,
            totalItems: result.summary.totalItems,
            importItems: result.summary.importItems,
            reviewItems: result.summary.reviewItems,
          },
        });
        return res.json(result);
      } catch (error) {
        return handleError(req, res, userId, "imports_preview", error);
      }
    },

    confirm: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = importConfirmBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "import",
          status: "failure",
          domain: "imports_confirm",
          userId,
          details: { reason: "validation_error" },
        });
        return res.status(400).json({ message: parsed.error.message });
      }

      try {
        const result = await service.confirm(userId, parsed.data);
        auditRequest(req, {
          action: "import",
          status: "success",
          domain: "imports_confirm",
          userId,
          targetId: result.importLogId,
          details: {
            createdCount: result.createdCount,
            skippedCount: result.skippedCount,
            alreadyConfirmed: result.alreadyConfirmed ?? false,
          },
        });
        return res.json(result);
      } catch (error) {
        return handleError(req, res, userId, "imports_confirm", error, parsed.data.importLogId);
      }
    },

    rollback: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const importLogId = getParam(req, "id");
      if (!importLogId) {
        return res.status(400).json({ message: "Import log id obrigatorio" });
      }

      try {
        const result = await service.rollback(userId, importLogId);
        auditRequest(req, {
          action: "import",
          status: "success",
          domain: "imports_rollback",
          userId,
          targetId: result.importLogId,
          details: {
            deletedCount: result.deletedCount,
            alreadyRolledBack: result.alreadyRolledBack ?? false,
          },
        });
        return res.json(result);
      } catch (error) {
        return handleError(req, res, userId, "imports_rollback", error, importLogId);
      }
    },

    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const rawLimit = Number(req.query.limit);
      const limit = Number.isInteger(rawLimit) ? rawLimit : 20;
      return res.json(await service.list(userId, limit));
    },
  };
}
