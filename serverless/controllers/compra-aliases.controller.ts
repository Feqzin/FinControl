import type { Request, Response } from "express";
import { CompraAliasesService } from "../services/compra-aliases.service.js";
import { compraAliasCreateBody } from "../validators/compra-aliases.validators.js";
import {
  getParam,
  getUserId,
  sendBadRequest,
  sendNotFound,
} from "./controller-utils.js";

export function createCompraAliasesController(service: CompraAliasesService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = compraAliasCreateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.create(userId, parsed.data);
      if ("error" in result) {
        if (result.error === "COMPRA_NOT_FOUND") {
          return sendNotFound(res, "Compra de cartão não encontrada.");
        }
        if (result.error === "CARTAO_NOT_FOUND") {
          return sendBadRequest(res, "Cartão inválido para o usuário.");
        }
        return sendBadRequest(res, "Compra e cartão informados não correspondem.");
      }

      return res.status(result.reusedExisting ? 200 : 201).json({
        alias: result.created,
        reusedExisting: result.reusedExisting,
      });
    },

    remove: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const aliasId = getParam(req, "id");
      if (!aliasId) {
        return sendBadRequest(res, "Alias id obrigatório.");
      }
      const deleted = await service.delete(userId, aliasId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },
  };
}

