import type { Request, Response } from "express";
import { UserIconLibraryService } from "../services/user-icon-library.service.js";
import { userIconLibraryCreateBody, userIconLibraryUpdateBody } from "../validators/user-icon-library.validators.js";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

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

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const id = getParam(req, "id");
      if (!id) {
        return sendBadRequest(res, "Ícone obrigatório.");
      }

      const parsed = userIconLibraryUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      try {
        const updated = await service.update(userId, id, parsed.data);
        if (!updated) {
          return sendNotFound(res, "Ícone não encontrado.");
        }
        return res.json({ icon: updated });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível atualizar o ícone.";
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
