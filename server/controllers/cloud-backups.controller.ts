import type { Request, Response } from "express";
import { auditRequest, getParam, getUserId } from "./controller-utils";
import { toErrorLog, writeTechnicalLog } from "../logger";
import { CloudBackupsService, CloudBackupsServiceError } from "../services/cloud-backups.service";
import type { BackupImportMode, BackupJsonModulesSelection } from "../../serverless/validators/backup-import.validators";
import { isBackupRestoreModuleKey, type BackupRestoreAction } from "@shared/backup-restore-modules";

function parseRestoreMode(value: unknown): BackupImportMode {
  if (value == null || value === "") return "merge";
  if (typeof value !== "string") {
    throw new CloudBackupsServiceError(400, "Modo de restauracao invalido. Use 'merge', 'replace' ou 'custom'.");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "merge" || normalized === "replace" || normalized === "custom") {
    return normalized;
  }
  throw new CloudBackupsServiceError(400, "Modo de restauracao invalido. Use 'merge', 'replace' ou 'custom'.");
}

function parseModulesSelection(value: unknown): BackupJsonModulesSelection {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CloudBackupsServiceError(400, "Selecao de modulos invalida.");
  }

  const row = value as Record<string, unknown>;
  const modules: BackupJsonModulesSelection = {};
  for (const [rawKey, rawAction] of Object.entries(row)) {
    if (!isBackupRestoreModuleKey(rawKey)) continue;
    if (typeof rawAction !== "string") {
      throw new CloudBackupsServiceError(400, `Acao invalida para o modulo '${rawKey}'.`);
    }
    const action = rawAction.trim().toLowerCase();
    if (action !== "merge" && action !== "replace" && action !== "ignore") {
      throw new CloudBackupsServiceError(400, `Acao invalida para o modulo '${rawKey}'.`);
    }
    modules[rawKey] = action as BackupRestoreAction;
  }

  return modules;
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

    previewById: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const backupId = getParam(req, "id");
      try {
        const preview = await service.previewById(userId, backupId);
        auditRequest(req, {
          action: "import",
          status: "success",
          domain: "cloud_backup.preview",
          userId,
          targetId: backupId,
          details: {
            fileName: preview.backupInfo.fileName,
            mode: "preview",
            modules: preview.modules.map((module) => ({
              key: module.key,
              count: module.count,
              foundInBackup: module.foundInBackup,
            })),
          },
        });
        return res.status(200).json(preview);
      } catch (error) {
        if (error instanceof CloudBackupsServiceError) {
          auditRequest(req, {
            action: "import",
            status: "failure",
            domain: "cloud_backup.preview",
            userId,
            targetId: backupId,
            details: { message: error.message },
          });
          return res.status(error.status).json({ message: error.message });
        }

        writeTechnicalLog({
          event: "cloud_backup.preview.unexpected_error",
          source: "cloud-backups.controller",
          level: "error",
          requestId: req.requestId,
          data: { userId, backupId, error: toErrorLog(error) },
        });
        return res.status(500).json({ message: "Falha ao analisar backup na nuvem." });
      }
    },

    restoreById: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const backupId = getParam(req, "id");
      try {
        const modo = parseRestoreMode((req.body as { modo?: unknown; mode?: unknown } | undefined)?.modo
          ?? (req.body as { mode?: unknown } | undefined)?.mode);
        const modules = modo === "custom"
          ? parseModulesSelection((req.body as { modules?: unknown; modulos?: unknown } | undefined)?.modules
            ?? (req.body as { modulos?: unknown } | undefined)?.modulos)
          : undefined;
        const result = await service.restoreById(userId, backupId, {
          modo,
          modules,
        });

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
            avisos: result.avisos.length,
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
