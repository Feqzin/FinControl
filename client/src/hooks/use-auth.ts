import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";

type AuthUser = {
  id: string;
  username: string;
  nomeCompleto: string | null;
};

function resetSessionCache(nextUser: AuthUser | null): void {
  // Evita reutilizar dados de outra sessao/usuario no mesmo navegador.
  queryClient.clear();
  queryClient.setQueryData(["/api/auth/me"], nextUser);
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (loggedUser) => {
      resetSessionCache(loggedUser);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; nomeCompleto?: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (registeredUser) => {
      resetSessionCache(registeredUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      resetSessionCache(null);
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
