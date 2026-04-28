import { useQuery } from "@tanstack/react-query";
import { buildSubscriptionAccess, type PremiumFeature } from "@shared/subscription";
import { useAuth } from "@/hooks/use-auth";
import { getBillingStatus } from "@/services/api/billing";

const BILLING_STATUS_QUERY_KEY = ["/api/billing/status"] as const;

export function usePremiumAccess() {
  const { user } = useAuth();
  const billingStatusQuery = useQuery({
    queryKey: BILLING_STATUS_QUERY_KEY,
    queryFn: getBillingStatus,
    enabled: Boolean(user),
    retry: false,
    staleTime: Infinity,
  });

  const fallbackAccess = buildSubscriptionAccess(user?.subscriptionTier);
  const effectiveTier = billingStatusQuery.data?.effectiveTier ?? fallbackAccess.subscriptionTier;
  const features = billingStatusQuery.data?.features ?? user?.features ?? fallbackAccess.features;
  const limits = billingStatusQuery.data?.limits ?? user?.limits ?? fallbackAccess.limits;

  const hasFeature = (feature: PremiumFeature): boolean => features[feature] === true;

  return {
    effectiveTier,
    billingStatus: billingStatusQuery.data?.billingStatus ?? null,
    isTrialing: billingStatusQuery.data?.billingStatus === "trialing",
    hasPremium: effectiveTier === "premium",
    hasFeature,
    features,
    limits,
    isLoading: billingStatusQuery.isLoading,
    isError: billingStatusQuery.isError,
    refetch: billingStatusQuery.refetch,
  };
}

