import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";

type AuthUser = {
  id: string;
  username: string;
  nomeCompleto: string | null;
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
