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
            checkoutMode: result.checkoutMode,
          },
        });
        return res.status(result.checkoutMode === "resume" ? 200 : 201).json(result);
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

    cancelMercadoPagoSubscription: async (req: Request, res: Response) => {
      const userId = getUserId(req);

      try {
        const result = await service.cancelMercadoPagoSubscription(userId);
        auditRequest(req, {
          action: "update",
          status: "success",
          domain: "billing.cancel.mercado_pago",
          userId,
          details: {
            billingStatus: result.status.billingStatus,
            subscriptionTier: result.status.subscriptionTier,
          },
        });
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof BillingServiceError) {
          auditRequest(req, {
            action: "update",
            status: "failure",
            domain: "billing.cancel.mercado_pago",
            userId,
            details: { message: error.message },
          });
          return res.status(error.status).json({ message: error.message });
        }

        writeTechnicalLog({
          event: "billing.cancel.unexpected_error",
          source: "billing.controller",
          level: "error",
          requestId: req.requestId,
          data: {
            userId,
            error: toErrorLog(error),
          },
        });

        auditRequest(req, {
          action: "update",
          status: "error",
          domain: "billing.cancel.mercado_pago",
          userId,
          error: error instanceof Error ? error.message : "Erro inesperado",
        });

        return res.status(500).json({ message: "Falha ao cancelar assinatura." });
      }
    },

    processMercadoPagoWebhook: async (req: Request, res: Response) => {
      const rawBody = Buffer.isBuffer(req.rawBody)
        ? req.rawBody.toString("utf8")
        : typeof req.rawBody === "string"
          ? req.rawBody
          : JSON.stringify(req.body ?? {});

      try {
        const result = await service.processMercadoPagoWebhook({
          query: req.query as Record<string, unknown>,
          payload: req.body,
          rawBody,
          xSignature: req.get("x-signature"),
          xRequestId: req.get("x-request-id"),
        });

        auditRequest(req, {
          action: "update",
          status: result.outcome === "processed" ? "success" : "failure",
          domain: "billing.webhook.mercado_pago",
          details: {
            provider: "mercado_pago",
            outcome: result.outcome,
            reason: result.reason,
            providerEventId: result.providerEventId,
          },
        });

        return res.status(200).json({ received: true });
      } catch (error) {
        writeTechnicalLog({
          event: "billing.webhook.unexpected_error",
          source: "billing.controller",
          level: "error",
          requestId: req.requestId,
          data: {
            error: toErrorLog(error),
          },
        });

        auditRequest(req, {
          action: "update",
          status: "error",
          domain: "billing.webhook.mercado_pago",
          error: error instanceof Error ? error.message : "Erro inesperado",
        });

        // Sempre responde 200 para evitar vazamento de erro tecnico
        // e permitir reprocessamento controlado por idempotencia local.
        return res.status(200).json({ received: true });
      }
    },
  };
}
