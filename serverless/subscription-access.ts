import type { NextFunction, Request, Response } from "express";
import {
  buildSubscriptionAccess,
  isLimitReached,
  type PremiumFeature,
  type SubscriptionLimitKey,
  type SubscriptionLimitValue,
  type SubscriptionAccess,
} from "../shared/subscription.js";

type UserLike = {
  subscriptionTier?: unknown;
} | null | undefined;

export function getUserSubscriptionAccess(user: UserLike): SubscriptionAccess {
  return buildSubscriptionAccess(user?.subscriptionTier);
}

export function userHasFeature(user: UserLike, feature: PremiumFeature): boolean {
  return getUserSubscriptionAccess(user).features[feature] === true;
}

export function getUserLimit(user: UserLike, key: SubscriptionLimitKey): SubscriptionLimitValue {
  return getUserSubscriptionAccess(user).limits[key];
}

export function isUserLimitReached(user: UserLike, key: SubscriptionLimitKey, currentCount: number): boolean {
  return isLimitReached(currentCount, getUserLimit(user, key));
}

export function requirePremiumFeature(feature: PremiumFeature) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (typeof req.isAuthenticated === "function" && !req.isAuthenticated()) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }

    const access = getUserSubscriptionAccess(req.user as UserLike);
    if (userHasFeature(req.user as UserLike, feature)) {
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
