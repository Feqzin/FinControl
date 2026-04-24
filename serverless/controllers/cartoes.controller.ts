import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money.js";
import { enforcePlanLimit } from "../subscription-access.js";
import { BillingService } from "../services/billing.service.js";
import { CartoesService } from "../services/cartoes.service.js";
import { cartaoBody, cartaoUpdateBody } from "../validators/financial.validators.js";
import {
  auditRequest,
  getParam,
  getUserId,
  sendBadRequest,
  sendNotFound,
  sendPlanLimitConflict,
} from "./controller-utils.js";

export function createCartoesController(service: CartoesService) {
  const billingService = new BillingService();

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

      const currentUsage = (await service.list(userId)).length;
      const effectiveAccess = await billingService.syncUserSubscriptionTier(
        userId,
        "plan_limit_cartoes_create",
      );
      const limitResult = enforcePlanLimit(
        { subscriptionTier: effectiveAccess.effectiveTier },
        "cartoes",
        currentUsage,
      );
      if (!limitResult.allowed) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "cartoes",
          userId,
          details: {
            reason: "plan_limit_reached",
            resource: limitResult.error.resource,
            currentUsage: limitResult.error.currentUsage,
            limit: limitResult.error.limit,
            subscriptionTier: limitResult.error.subscriptionTier,
          },
        });
        return sendPlanLimitConflict(res, limitResult.error);
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
