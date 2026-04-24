import type { Request, Response } from "express";
import { auditRequest, getUserId } from "./controller-utils.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";
import { CloudBackupsService, CloudBackupsServiceError } from "../services/cloud-backups.service.js";

export function createCloudBackupsController(service: CloudBackupsService) {
  return {
    createManual: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      try {
        const backup = await service.createManualBackup(userId);
        auditRequest(req, {
          action: "create",
          status: "success",
          domain: "cloud_backup.create",
          userId,
          targetId: backup.id,
          details: {
            fileName: backup.fileName,
            sizeBytes: backup.sizeBytes,
            backupType: backup.backupType,
          },
        });
        return res.status(201).json({ backup });
      } catch (error) {
        if (error instanceof CloudBackupsServiceError) {
          auditRequest(req, {
            action: "create",
            status: "failure",
            domain: "cloud_backup.create",
            userId,
            details: { message: error.message },
          });
          return res.status(error.status).json({ message: error.message });
        }

        writeTechnicalLog({
          event: "cloud_backup.create.unexpected_error",
          source: "cloud-backups.controller",
          level: "error",
          requestId: req.requestId,
          data: { userId, error: toErrorLog(error) },
        });

        auditRequest(req, {
          action: "create",
          status: "error",
          domain: "cloud_backup.create",
          userId,
          error: error instanceof Error ? error.message : "Erro inesperado",
        });
        return res.status(500).json({ message: "Falha ao criar backup na nuvem." });
      }
    },

    listByUser: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
      try {
        const backups = await service.listByUser(userId, limit);
        return res.json({ backups });
      } catch (error) {
        writeTechnicalLog({
          event: "cloud_backup.list.unexpected_error",
          source: "cloud-backups.controller",
          level: "error",
          requestId: req.requestId,
          data: { userId, error: toErrorLog(error) },
        });
        return res.status(500).json({ message: "Falha ao listar backups na nuvem." });
      }
    },
  };
}
