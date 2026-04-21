import type { Request, Response } from "express";
import { MetasService } from "../services/metas.service";
import { metaBody, metaUpdateBody } from "../validators/core-domain.validators";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

export function createMetasController(service: MetasService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = metaBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      return res.json(await service.create(userId, parsed.data));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const metaId = getParam(req, "id");
      const parsed = metaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.update(metaId, userId, parsed.data);
      if (!updated) {
        return sendNotFound(res);
      }
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const metaId = getParam(req, "id");
      const deleted = await service.delete(metaId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },
  };
}
