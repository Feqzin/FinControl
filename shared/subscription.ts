export const subscriptionTierValues = ["free", "premium"] as const;
export type SubscriptionTier = (typeof subscriptionTierValues)[number];

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "free";

export const UNLIMITED_PLAN_LIMIT = null;

export type PremiumFeature =
  | "cloudBackup"
  | "cloudRestore"
  | "advancedReports"
  | "smartImport"
  | "automation"
  | "unlimitedHistory"
  | "forecast"
  | "simulator";

export type SubscriptionLimitValue = number | null;

export type SubscriptionLimitKey =
  | "maxCartoes"
  | "maxPessoas"
  | "maxServicos"
  | "maxMetas";

export type SubscriptionResourceKey =
  | "cartoes"
  | "pessoas"
  | "servicos"
  | "metas";

export type SubscriptionLimits = {
  maxCartoes: SubscriptionLimitValue;
  maxPessoas: SubscriptionLimitValue;
  maxServicos: SubscriptionLimitValue;
  maxMetas: SubscriptionLimitValue;
};

export type SubscriptionFeatures = {
  cloudBackup: boolean;
  cloudRestore: boolean;
  advancedReports: boolean;
  smartImport: boolean;
  automation: boolean;
  unlimitedHistory: boolean;
  forecast: boolean;
  simulator: boolean;
};

export type SubscriptionAccess = {
  subscriptionTier: SubscriptionTier;
  features: SubscriptionFeatures;
  limits: SubscriptionLimits;
};

export type SubscriptionPlanConfig = {
  features: SubscriptionFeatures;
  limits: SubscriptionLimits;
};

export type SubscriptionUsage = {
  cartoes: number;
  pessoas: number;
  servicos: number;
  metas: number;
};

export type SubscriptionRemaining = {
  cartoes: SubscriptionLimitValue;
  pessoas: SubscriptionLimitValue;
  servicos: SubscriptionLimitValue;
  metas: SubscriptionLimitValue;
};

export type SubscriptionUsageSnapshot = {
  subscriptionTier: SubscriptionTier;
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  remaining: SubscriptionRemaining;
};

const FREE_PLAN_CONFIG: SubscriptionPlanConfig = {
  features: {
    cloudBackup: false,
    cloudRestore: false,
    advancedReports: false,
    smartImport: false,
    automation: false,
    unlimitedHistory: false,
    forecast: false,
    simulator: false,
  },
  limits: {
    maxCartoes: 4,
    maxPessoas: 20,
    maxServicos: 10,
    maxMetas: 10,
  },
};

const PREMIUM_PLAN_CONFIG: SubscriptionPlanConfig = {
  features: {
    cloudBackup: true,
    cloudRestore: true,
    advancedReports: true,
    smartImport: true,
    automation: true,
    unlimitedHistory: true,
    forecast: true,
    simulator: true,
  },
  limits: {
    maxCartoes: UNLIMITED_PLAN_LIMIT,
    maxPessoas: UNLIMITED_PLAN_LIMIT,
    maxServicos: UNLIMITED_PLAN_LIMIT,
    maxMetas: UNLIMITED_PLAN_LIMIT,
  },
};

export const SUBSCRIPTION_PLAN_CONFIG: Record<SubscriptionTier, SubscriptionPlanConfig> = {
  free: FREE_PLAN_CONFIG,
  premium: PREMIUM_PLAN_CONFIG,
};

function clonePlanConfig(config: SubscriptionPlanConfig): SubscriptionPlanConfig {
  return {
    features: { ...config.features },
    limits: { ...config.limits },
  };
}

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  return value === "premium" ? "premium" : DEFAULT_SUBSCRIPTION_TIER;
}

export function hasFeatureAccess(tier: SubscriptionTier, feature: PremiumFeature): boolean {
  return SUBSCRIPTION_PLAN_CONFIG[tier].features[feature] === true;
}

export function isUnlimitedLimit(limit: SubscriptionLimitValue): boolean {
  return limit === UNLIMITED_PLAN_LIMIT;
}

export function isLimitReached(currentCount: number, limit: SubscriptionLimitValue): boolean {
  if (isUnlimitedLimit(limit)) return false;
  const safeLimit = typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(0, Math.trunc(limit))
    : 0;
  const safeCount = Number.isFinite(currentCount) ? Math.max(0, Math.trunc(currentCount)) : 0;
  return safeCount >= safeLimit;
}

export function calculateRemaining(limit: SubscriptionLimitValue, usageCount: number): SubscriptionLimitValue {
  if (isUnlimitedLimit(limit)) return UNLIMITED_PLAN_LIMIT;
  const safeLimit = typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(0, Math.trunc(limit))
    : 0;
  const safeUsage = Number.isFinite(usageCount) ? Math.max(0, Math.trunc(usageCount)) : 0;
  return Math.max(0, safeLimit - safeUsage);
}

export function getSubscriptionPlanConfig(value: unknown): SubscriptionPlanConfig {
  const subscriptionTier = normalizeSubscriptionTier(value);
  return clonePlanConfig(SUBSCRIPTION_PLAN_CONFIG[subscriptionTier]);
}

export function buildSubscriptionAccess(value: unknown): SubscriptionAccess {
  const subscriptionTier = normalizeSubscriptionTier(value);
  const plan = getSubscriptionPlanConfig(subscriptionTier);
  return {
    subscriptionTier,
    features: plan.features,
    limits: plan.limits,
  };
}
