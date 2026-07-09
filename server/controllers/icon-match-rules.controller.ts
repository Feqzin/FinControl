import type { Request, Response } from "express";
import { IconMatchRulesService } from "../services/icon-match-rules.service";
import { iconMatchRuleCreateBody } from "../validators/icon-match-rules.validators";
import {
  INVALID_ICON_ID_REFERENCE_ERROR_CODE,
  INVALID_ICON_ID_REFERENCE_MESSAGE,
} from "@shared/icon-persistence";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";
import { toErrorLog, writeTechnicalLog } from "../logger";

const ICON_SCHEMA_ERROR_CODES = new Set(["42P01", "42703"]);

function isIconMatchSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const normalizedCode = typeof code === "string" ? code.trim() : "";
  if (ICON_SCHEMA_ERROR_CODES.has(normalizedCode)) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("icon_match_rules");
}

function hasInvalidIconReferenceIssue(error: { issues?: Array<{ message?: string }> }): boolean {
  return Array.isArray(error.issues) && error.issues.some((issue) => issue.message === INVALID_ICON_ID_REFERENCE_MESSAGE);
}

export function createIconMatchRulesController(service: IconMatchRulesService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const rows = await service.list(userId);
      return res.json(rows);
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = iconMatchRuleCreateBody.safeParse(req.body);
      if (!parsed.success) {
        if (hasInvalidIconReferenceIssue(parsed.error)) {
          return res.status(400).json({
            message: INVALID_ICON_ID_REFERENCE_MESSAGE,
            errorCode: INVALID_ICON_ID_REFERENCE_ERROR_CODE,
          });
        }
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const rules = await service.createOrUpdate(userId, parsed.data);
        return res.status(201).json({ rules });
      } catch (error) {
        writeTechnicalLog({
          event: "icon_match_rules.create_from_compra.error",
          source: "icon-match-rules.controller",
          level: "error",
          requestId: req.requestId,
          data: {
            userId,
            hasIconId: typeof parsed.data.iconId === "string" && parsed.data.iconId.trim().length > 0,
            termsCount: Array.isArray(parsed.data.terms) ? parsed.data.terms.length : 0,
            error: toErrorLog(error),
          },
        });

        if (isIconMatchSchemaError(error)) {
          return sendBadRequest(
            res,
            "Não foi possível salvar o reconhecimento automático do ícone. A estrutura de ícones do banco parece desatualizada.",
          );
        }
        throw error;
      }
    },

    remove: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const id = getParam(req, "id");
      if (!id) {
        return sendBadRequest(res, "Regra de ícone obrigatória.");
      }
      const deleted = await service.remove(userId, id);
      if (!deleted) {
        return sendNotFound(res, "Regra de ícone não encontrada.");
      }
      return res.json({ success: true });
    },
  };
}
