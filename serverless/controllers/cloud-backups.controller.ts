import type { Request, Response } from "express";
import { auditRequest, getParam, getUserId } from "./controller-utils.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";
import { CloudBackupsService, CloudBackupsServiceError } from "../services/cloud-backups.service.js";
import type { BackupImportMode } from "../validators/backup-import.validators.js";

function parseRestoreMode(value: unknown): BackupImportMode {
  if (value == null || value === "") return "merge";
  if (typeof value !== "string") {
    throw new CloudBackupsServiceError(400, "Modo de restauracao invalido. Use 'merge' ou 'replace'.");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "merge" || normalized === "replace") {
    return normalized;
  }
  throw new CloudBackupsServiceError(400, "Modo de restauracao invalido. Use 'merge' ou 'replace'.");
}

function toAttachmentFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

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

    downloadById: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const backupId = getParam(req, "id");
      try {
        const downloaded = await service.downloadById(userId, backupId);
        auditRequest(req, {
          action: "import",
          status: "success",
          domain: "cloud_backup.download",
          userId,
          targetId: backupId,
          details: {
            fileName: downloaded.fileName,
            sizeBytes: downloaded.content.byteLength,
          },
        });

        const safeFileName = toAttachmentFileName(downloaded.fileName);
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("content-disposition", `attachment; filename="${safeFileName}"`);
        return res.status(200).send(downloaded.content);
      } catch (error) {
        if (error instanceof CloudBackupsServiceError) {
          auditRequest(req, {
            action: "import",
            status: "failure",
            domain: "cloud_backup.download",
            userId,
            targetId: backupId,
            details: { message: error.message },
          });
          return res.status(error.status).json({ message: error.message });
        }

        writeTechnicalLog({
          event: "cloud_backup.download.unexpected_error",
          source: "cloud-backups.controller",
          level: "error",
          requestId: req.requestId,
          data: { userId, backupId, error: toErrorLog(error) },
        });
        return res.status(500).json({ message: "Falha ao baixar backup na nuvem." });
      }
    },

    restoreById: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const backupId = getParam(req, "id");
      try {
        const modo = parseRestoreMode((req.body as { modo?: unknown; mode?: unknown } | undefined)?.modo
          ?? (req.body as { mode?: unknown } | undefined)?.mode);
        const result = await service.restoreById(userId, backupId, modo);

        auditRequest(req, {
          action: "import",
          status: "success",
          domain: "cloud_backup.restore",
          userId,
          targetId: backupId,
          details: {
            modoImportacao: result.modoImportacao,
            pessoasImportadas: result.pessoasImportadas,
            cartoesImportados: result.cartoesImportados,
            dividasImportadas: result.dividasImportadas,
            comprasImportadas: result.comprasImportadas,
            servicosImportados: result.servicosImportados,
          },
        });

        return res.status(201).json({
          backupId,
          ...result,
        });
      } catch (error) {
        if (error instanceof CloudBackupsServiceError) {
          auditRequest(req, {
            action: "import",
            status: "failure",
            domain: "cloud_backup.restore",
            userId,
            targetId: backupId,
            details: { message: error.message },
          });
          return res.status(error.status).json({ message: error.message });
        }

        writeTechnicalLog({
          event: "cloud_backup.restore.unexpected_error",
          source: "cloud-backups.controller",
          level: "error",
          requestId: req.requestId,
          data: { userId, backupId, error: toErrorLog(error) },
        });
        return res.status(500).json({ message: "Falha ao restaurar backup na nuvem." });
      }
    },
  };
}
