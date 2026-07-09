import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  buildSubscriptionAccess,
  type SubscriptionFeatures,
  type SubscriptionLimits,
  type SubscriptionTier,
} from "@shared/subscription";

type AuthUser = {
  id: string;
  username: string | null;
  nomeCompleto: string | null;
  fullNameVisibility?: "private" | "public" | null;
  subscriptionTier?: SubscriptionTier | null;
  features?: SubscriptionFeatures | null;
  limits?: SubscriptionLimits | null;
};

const AUTH_ME_QUERY_KEY = ["/api/auth/me"] as const;
const AUTH_LOAD_TIMEOUT_MS = 10000;

type AuthQueryError = Error & {
  status?: number;
  responseBody?: string;
  errorCode?: string | null;
};

function createAuthQueryError(status: number, responseBody: string): AuthQueryError {
  const error = new Error(`${status}: ${responseBody || "Erro ao carregar sessao."}`) as AuthQueryError;
  error.status = status;
  error.responseBody = responseBody;

  try {
    const parsed = JSON.parse(responseBody) as { errorCode?: unknown };
    error.errorCode = typeof parsed.errorCode === "string" ? parsed.errorCode : null;
  } catch {
    error.errorCode = null;
  }

  return error;
}

function getAuthErrorStatus(error: unknown): number | null {
  return typeof (error as AuthQueryError | null)?.status === "number"
    ? ((error as AuthQueryError).status as number)
    : null;
}

function resetSessionCache(nextUser: AuthUser | null): void {
  queryClient.setQueryData(AUTH_ME_QUERY_KEY, nextUser);
}

async function refreshAuthenticatedUser(): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: AUTH_ME_QUERY_KEY,
    refetchType: "active",
  });
}

async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), AUTH_LOAD_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
  }

  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      signal: timeoutController.signal,
    });

    if (res.status === 401) {
      return null;
    }

    if (!res.ok) {
      const body = (await res.text()) || res.statusText;
      if (import.meta.env.DEV) {
        console.error("[auth.me] request failed", {
          status: res.status,
          body,
        });
      }
      throw createAuthQueryError(res.status, body);
    }

    return (await res.json()) as AuthUser;
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      const timeoutError = new Error("Tempo limite excedido ao carregar a sessao.") as AuthQueryError;
      timeoutError.status = 0;
      timeoutError.responseBody = "AUTH_ME_TIMEOUT";
      timeoutError.errorCode = "AUTH_ME_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getUserSubscriptionTier(user: AuthUser | null | undefined): SubscriptionTier {
  return buildSubscriptionAccess(user?.subscriptionTier).subscriptionTier;
}

export function getUserSubscriptionFeatures(user: AuthUser | null | undefined): SubscriptionFeatures {
  const fallback = buildSubscriptionAccess(user?.subscriptionTier);
  return user?.features ?? fallback.features;
}

export function getUserSubscriptionLimits(user: AuthUser | null | undefined): SubscriptionLimits {
  const fallback = buildSubscriptionAccess(user?.subscriptionTier);
  return user?.limits ?? fallback.limits;
}

export function hasCloudBackupAccess(user: AuthUser | null | undefined): boolean {
  return getUserSubscriptionFeatures(user).cloudBackup === true;
}

export function hasSmartImportAccess(user: AuthUser | null | undefined): boolean {
  return getUserSubscriptionFeatures(user).smartImport === true;
}

export function useAuth() {
  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery<AuthUser | null>({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    retry: (failureCount, queryError) => {
      const status = getAuthErrorStatus(queryError);
      return failureCount < 1 && status !== null && status >= 500;
    },
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { identifier?: string; username?: string; password: string }) => {
      const identifier = String(data.identifier ?? data.username ?? "").trim();
      const res = await apiRequest("POST", "/api/auth/login", {
        identifier,
        username: identifier,
        password: data.password,
      });
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

  async function clearSessionSafely(): Promise<void> {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Melhor esforço: o objetivo aqui e limpar o estado local quando a sessao esta inconsistente.
    } finally {
      resetSessionCache(null);
      await queryClient.invalidateQueries({
        queryKey: AUTH_ME_QUERY_KEY,
        refetchType: "none",
      });
    }
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    authError: error as AuthQueryError | null,
    authErrorStatus: getAuthErrorStatus(error),
    retryAuth: refetch,
    clearSessionSafely,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
  };
}
