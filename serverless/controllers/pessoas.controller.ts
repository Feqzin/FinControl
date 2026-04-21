import type { Request, Response } from "express";
import { PessoasService } from "../services/pessoas.service.js";
import { pessoaBody, pessoaUpdateBody } from "../validators/core-domain.validators.js";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

export function createPessoasController(service: PessoasService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = pessoaBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      return res.json(await service.create(userId, parsed.data));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const parsed = pessoaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.update(pessoaId, userId, parsed.data);
      if (!updated) {
        return sendNotFound(res);
      }
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const deleted = await service.delete(pessoaId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },
  };
}
