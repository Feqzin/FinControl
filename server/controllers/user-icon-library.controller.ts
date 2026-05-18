import type { Request, Response } from "express";
import { UserIconLibraryService } from "../services/user-icon-library.service";
import { userIconLibraryCreateBody } from "../validators/user-icon-library.validators";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

export function createUserIconLibraryController(service: UserIconLibraryService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const rows = await service.list(userId);
      return res.json(rows);
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = userIconLibraryCreateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      try {
        const created = await service.create(userId, parsed.data);
        return res.status(201).json({ icon: created });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível salvar o ícone.";
        return sendBadRequest(res, message);
      }
    },

    remove: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const id = getParam(req, "id");
      if (!id) {
        return sendBadRequest(res, "Ícone obrigatório.");
      }

      const deleted = await service.remove(userId, id);
      if (!deleted) {
        return sendNotFound(res, "Ícone não encontrado.");
      }

      return res.json({ success: true });
    },
  };
}
