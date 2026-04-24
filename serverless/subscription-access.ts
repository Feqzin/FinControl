import type { NextFunction, Request, Response } from "express";
import {
  buildSubscriptionAccess,
  isLimitReached,
  type PremiumFeature,
  type SubscriptionResourceKey,
  type SubscriptionTier,
  type SubscriptionLimitKey,
  type SubscriptionLimitValue,
  type SubscriptionAccess,
} from "../shared/subscription.js";
import { BillingService } from "./services/billing.service.js";
import { toErrorLog, writeTechnicalLog } from "./logger.js";

type UserLike = {
  subscriptionTier?: unknown;
} | null | undefined;

export type PlanLimitExceededErrorPayload = {
  code: "PLAN_LIMIT_REACHED";
  message: string;
  resource: SubscriptionResourceKey;
  currentUsage: number;
  limit: number;
  subscriptionTier: SubscriptionTier;
};

export type PlanLimitEnforcementResult =
  | { allowed: true }
  | { allowed: false; error: PlanLimitExceededErrorPayload };

const RESOURCE_LIMIT_KEY_MAP: Record<SubscriptionResourceKey, SubscriptionLimitKey> = {
  cartoes: "maxCartoes",
  pessoas: "maxPessoas",
  servicos: "maxServicos",
  metas: "maxMetas",
};

const RESOURCE_LABEL_MAP: Record<SubscriptionResourceKey, string> = {
  cartoes: "cartões",
  pessoas: "pessoas",
  servicos: "serviços",
  metas: "metas",
};

const billingService = new BillingService();

function sanitizeUsageCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

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

export function enforcePlanLimit(
  user: UserLike,
  resource: SubscriptionResourceKey,
  currentUsage: number,
): PlanLimitEnforcementResult {
  const access = getUserSubscriptionAccess(user);
  const limitKey = RESOURCE_LIMIT_KEY_MAP[resource];
  const limit = access.limits[limitKey];

  if (limit === null) {
    return { allowed: true };
  }

  const usage = sanitizeUsageCount(currentUsage);
  if (!isLimitReached(usage, limit)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: {
      code: "PLAN_LIMIT_REACHED",
      message: `Limite de ${RESOURCE_LABEL_MAP[resource]} atingido no plano atual. Faça upgrade para Premium para continuar criando.`,
      resource,
      currentUsage: usage,
      limit,
      subscriptionTier: access.subscriptionTier,
    },
  };
}

export function requirePremiumFeature(feature: PremiumFeature) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (typeof req.isAuthenticated === "function" && !req.isAuthenticated()) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }

    const userId = (req.user as { id?: unknown } | undefined)?.id;
    if (typeof userId === "string" && userId.trim() !== "") {
      try {
        const effectiveAccess = await billingService.syncUserSubscriptionTier(
          userId,
          `premium_feature_guard:${feature}`,
        );
        if (effectiveAccess.features[feature]) {
          if (req.user && typeof req.user === "object") {
            (req.user as { subscriptionTier?: SubscriptionTier }).subscriptionTier = effectiveAccess.effectiveTier;
          }
          next();
          return;
        }

        res.status(403).json({
          message: "Recurso disponivel apenas para plano premium.",
          feature,
          requiredTier: "premium",
          currentTier: effectiveAccess.effectiveTier,
        });
        return;
      } catch (error) {
        writeTechnicalLog({
          event: "subscription.guard.premium.sync_failed",
          source: "subscription-access",
          level: "warn",
          requestId: req.requestId,
          data: {
            userId,
            feature,
            error: toErrorLog(error),
          },
        });
      }
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
