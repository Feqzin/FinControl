import type { NextFunction, Request, Response } from "express";
import {
  buildSubscriptionAccess,
  type PremiumFeature,
  type SubscriptionAccess,
} from "@shared/subscription";

type UserLike = {
  subscriptionTier?: unknown;
} | null | undefined;

export function getUserSubscriptionAccess(user: UserLike): SubscriptionAccess {
  return buildSubscriptionAccess(user?.subscriptionTier);
}

export function requirePremiumFeature(feature: PremiumFeature) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (typeof req.isAuthenticated === "function" && !req.isAuthenticated()) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }

    const access = getUserSubscriptionAccess(req.user as UserLike);
    if (access.features[feature]) {
      next();
      return;
    }

    res.status(403).json({
      message: "Recurso disponivel apenas para plano premium.",
      feature,
      requiredTier: "premium",
      currentTier: access.subscriptionTier,
    });
  };
}
