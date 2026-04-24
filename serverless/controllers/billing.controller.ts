import type { Request, Response } from "express";
import { auditRequest, getUserId } from "./controller-utils.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";
import { BillingService, BillingServiceError } from "../services/billing.service.js";

export function createBillingController(service: BillingService) {
  return {
    getStatus: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const status = await service.getStatus(userId, req.user as { subscriptionTier?: unknown } | undefined);
      return res.json(status);
    },

    createMercadoPagoCheckout: async (req: Request, res: Response) => {
      const userId = getUserId(req);

      try {
        const result = await service.createMercadoPagoCheckout(userId);
        auditRequest(req, {
          action: "create",
          status: "success",
          domain: "billing.checkout.mercado_pago",
          userId,
          targetId: result.subscription.id,
          details: {
            provider: result.provider,
            billingStatus: result.billingStatus,
            externalReference: result.externalReference,
          },
        });
        return res.status(201).json(result);
      } catch (error) {
        if (error instanceof BillingServiceError) {
          auditRequest(req, {
            action: "create",
            status: "failure",
            domain: "billing.checkout.mercado_pago",
            userId,
            details: { message: error.message },
          });
          return res.status(error.status).json({ message: error.message });
        }

        writeTechnicalLog({
          event: "billing.checkout.unexpected_error",
          source: "billing.controller",
          level: "error",
          requestId: req.requestId,
          data: {
            userId,
            error: toErrorLog(error),
          },
        });

        auditRequest(req, {
          action: "create",
          status: "error",
          domain: "billing.checkout.mercado_pago",
          userId,
          error: error instanceof Error ? error.message : "Erro inesperado",
        });

        return res.status(500).json({ message: "Falha ao iniciar checkout de assinatura." });
      }
    },
  };
}
