import type { Request, Response } from "express";
import { VacationPlansService } from "../services/vacation-plans.service.js";
import { vacationPlanCreateBody } from "../validators/vacation-plans.validators.js";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

export function createVacationPlansController(service: VacationPlansService) {
  return {
    list: async (req: Request, res: Response) => {
      return res.json(await service.list(getUserId(req)));
    },

    create: async (req: Request, res: Response) => {
      const parsed = vacationPlanCreateBody.safeParse(req.body);
      if (!parsed.success) return sendBadRequest(res, parsed.error.message);

      const result = await service.create(getUserId(req), parsed.data);
      if ("error" in result) {
        const messages = {
          INCOME_NOT_FOUND: "Renda não encontrada.",
          INCOME_NOT_FIXED: "O Modo férias só pode pausar uma renda fixa.",
          INCOME_INACTIVE: "Selecione uma renda fixa ativa.",
          OVERLAPPING_PLAN: "Já existe um período de férias sobreposto para esta renda.",
        } as const;
        return sendBadRequest(res, messages[result.error]);
      }

      return res.status(201).json(result.created);
    },

    remove: async (req: Request, res: Response) => {
      const id = getParam(req, "id");
      if (!id) return sendBadRequest(res, "Período de férias inválido.");
      const deleted = await service.delete(getUserId(req), id);
      if (!deleted) return sendNotFound(res, "Período de férias não encontrado.");
      return res.json({ success: true });
    },
  };
}
