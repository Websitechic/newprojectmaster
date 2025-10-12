import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status >= 500) {
            throw new Error(`${res.status}: ${res.statusText}`);
          }

          throw new Error(`${res.status}: ${await res.text()}`);
        }

        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Prevent automatic refetch on mount
      refetchOnReconnect: false, // Prevent refetch on reconnect
      staleTime: Infinity, // Never automatically mark as stale - rely on mutations and explicit invalidations
      retry: false,
    },
    mutations: {
      retry: false,
    }
  },
});
