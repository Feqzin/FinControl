import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money";
import { CartoesService } from "../services/cartoes.service";
import { cartaoBody, cartaoUpdateBody } from "../validators/financial.validators";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

export function createCartoesController(service: CartoesService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = cartaoBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "cartoes",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const created = await service.create(userId, parsed.data);
      auditRequest(req, {
        action: "create",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: created.id,
        details: {
          nome: created.nome,
          limite: formatMoneyFixed(created.limite),
          melhorDiaCompra: created.melhorDiaCompra,
          diaVencimento: created.diaVencimento,
        },
      });
      return res.json(created);
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "id");
      const parsed = cartaoUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const updated = await service.update(cartaoId, userId, parsed.data);
      if (!updated) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: updated.id,
        details: {
          nome: updated.nome,
          limite: formatMoneyFixed(updated.limite),
          melhorDiaCompra: updated.melhorDiaCompra,
          diaVencimento: updated.diaVencimento,
        },
      });
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "id");
      const deleted = await service.delete(cartaoId, userId);
      if (!deleted) {
        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: cartaoId,
      });
      return res.json({ success: true });
    },
  };
}
