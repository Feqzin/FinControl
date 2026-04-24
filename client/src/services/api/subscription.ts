import { apiRequest } from "@/lib/queryClient";
import type {
  SubscriptionRemaining,
  SubscriptionTier,
  SubscriptionUsage,
  SubscriptionLimits,
} from "@shared/subscription";

export type SubscriptionUsageResponse = {
  subscriptionTier: SubscriptionTier;
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  remaining: SubscriptionRemaining;
};

export async function getSubscriptionUsage(): Promise<SubscriptionUsageResponse> {
  const res = await apiRequest("GET", "/api/subscription/usage");
  return res.json() as Promise<SubscriptionUsageResponse>;
}

