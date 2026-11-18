import type { QueryClient } from "@tanstack/react-query";

/** Discard account data and pending responses before replacing the session. */
export async function replaceSessionCache<T>(client: QueryClient, nextUser: T | null): Promise<void> {
  const accountQueries = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "/api/auth/me" };
  await client.cancelQueries(accountQueries);
  client.removeQueries(accountQueries);
  client.setQueryData(["/api/auth/me"], nextUser);
}
