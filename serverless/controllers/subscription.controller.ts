import type { Request, Response } from "express";
import { getUserId } from "./controller-utils.js";
import { SubscriptionService } from "../services/subscription.service.js";

export function createSubscriptionController(service: SubscriptionService) {
  return {
    getUsage: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const usage = await service.getUsage(userId);
      return res.json(usage);
    },
  };
}
