import { useQuery } from "@tanstack/react-query";
import {
  getSubscriptionUsage,
  type SubscriptionUsageResponse,
} from "@/services/api/subscription";

export const SUBSCRIPTION_USAGE_QUERY_KEY = ["/api/subscription/usage"] as const;

export function useSubscriptionUsage() {
  return useQuery<SubscriptionUsageResponse>({
    queryKey: SUBSCRIPTION_USAGE_QUERY_KEY,
    queryFn: getSubscriptionUsage,
    staleTime: 30_000,
  });
}
