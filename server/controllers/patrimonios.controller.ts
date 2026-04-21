import type { Request, Response } from "express";
import { PatrimoniosService } from "../services/patrimonios.service";
import { patrimonioCreateBody, patrimonioUpdateBody } from "../validators/core-domain.validators";
import { getParam, getUserId, sendBadRequest } from "./controller-utils";

export function createPatrimoniosController(service: PatrimoniosService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = patrimonioCreateBody.safeParse({ ...req.body, userId });
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.issues[0]?.message ?? parsed.error.message);
      }
      return res.json(await service.create(parsed.data));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const patrimonioId = getParam(req, "id");
      const parsed = patrimonioUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.update(patrimonioId, userId, parsed.data);
      if (!updated) {
        return res.status(404).json({ message: "Patrimonio nao encontrado" });
      }
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const patrimonioId = getParam(req, "id");
      await service.delete(patrimonioId, userId);
      return res.json({ success: true });
    },
  };
}
