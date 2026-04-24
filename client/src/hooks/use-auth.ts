import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import type { SubscriptionTier } from "@shared/subscription";

type AuthFeatures = {
  cloudBackup: boolean;
};

type AuthUser = {
  id: string;
  username: string;
  nomeCompleto: string | null;
  subscriptionTier?: SubscriptionTier | null;
  features?: AuthFeatures | null;
};

const AUTH_ME_QUERY_KEY = ["/api/auth/me"] as const;

function resetSessionCache(nextUser: AuthUser | null): void {
  queryClient.setQueryData(AUTH_ME_QUERY_KEY, nextUser);
}

async function refreshAuthenticatedUser(): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: AUTH_ME_QUERY_KEY,
    refetchType: "active",
  });
}

export function getUserSubscriptionTier(user: AuthUser | null | undefined): SubscriptionTier {
  return user?.subscriptionTier === "premium" ? "premium" : "free";
}

export function hasCloudBackupAccess(user: AuthUser | null | undefined): boolean {
  if (user?.features?.cloudBackup === true) return true;
  return getUserSubscriptionTier(user) === "premium";
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: async (loggedUser) => {
      resetSessionCache(loggedUser);
      await refreshAuthenticatedUser();
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; nomeCompleto?: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: async (registeredUser) => {
      resetSessionCache(registeredUser);
      await refreshAuthenticatedUser();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: async () => {
      resetSessionCache(null);
      await refreshAuthenticatedUser();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
  };
}
