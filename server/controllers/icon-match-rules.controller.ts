import type { Request, Response } from "express";
import { IconMatchRulesService } from "../services/icon-match-rules.service";
import { iconMatchRuleCreateBody } from "../validators/icon-match-rules.validators";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

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
        return sendBadRequest(res, parsed.error.message);
      }

      const rules = await service.createOrUpdate(userId, parsed.data);
      return res.status(201).json({ rules });
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
