export const subscriptionTierValues = ["free", "premium"] as const;
export type SubscriptionTier = (typeof subscriptionTierValues)[number];

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "free";

export type PremiumFeature = "cloudBackup";

export type SubscriptionFeatures = {
  cloudBackup: boolean;
};

export type SubscriptionAccess = {
  subscriptionTier: SubscriptionTier;
  features: SubscriptionFeatures;
};

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  return value === "premium" ? "premium" : DEFAULT_SUBSCRIPTION_TIER;
}

export function hasFeatureAccess(tier: SubscriptionTier, feature: PremiumFeature): boolean {
  if (feature === "cloudBackup") return tier === "premium";
  return false;
}

export function buildSubscriptionAccess(value: unknown): SubscriptionAccess {
  const subscriptionTier = normalizeSubscriptionTier(value);
  return {
    subscriptionTier,
    features: {
      cloudBackup: hasFeatureAccess(subscriptionTier, "cloudBackup"),
    },
  };
}
