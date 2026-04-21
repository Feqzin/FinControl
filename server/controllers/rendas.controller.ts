import type { Request, Response } from "express";
import { RendasService } from "../services/rendas.service";
import { rendaCreateBody, rendaUpdateBody } from "../validators/core-domain.validators";
import { getParam, getUserId, sendBadRequest } from "./controller-utils";

export function createRendasController(service: RendasService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = rendaCreateBody.safeParse({ ...req.body, userId });
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.issues[0]?.message ?? parsed.error.message);
      }
      return res.json(await service.create(parsed.data));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const rendaId = getParam(req, "id");
      const parsed = rendaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.update(rendaId, userId, parsed.data);
      if (!updated) {
        return res.status(404).json({ message: "Renda nao encontrada" });
      }
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const rendaId = getParam(req, "id");
      await service.delete(rendaId, userId);
      return res.json({ success: true });
    },
  };
}
