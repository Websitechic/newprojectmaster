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
      refetchInterval: false, // Disabled by default, enabled per-query where needed
      refetchOnWindowFocus: true, // Refetch when user returns to tab for fresh data
      refetchOnMount: true, // Refetch on mount for fresh data
      refetchOnReconnect: true, // Refetch on reconnect
      staleTime: 30000, // Mark data as stale after 30 seconds
      retry: false,
    },
    mutations: {
      retry: false,
    }
  },
});
