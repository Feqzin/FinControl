import type { Request, Response } from "express";
import { getUserId } from "./controller-utils.js";
import { BillingService } from "../services/billing.service.js";

export function createBillingController(service: BillingService) {
  return {
    getStatus: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const status = await service.getStatus(userId, req.user as { subscriptionTier?: unknown } | undefined);
      return res.json(status);
    },
  };
}
