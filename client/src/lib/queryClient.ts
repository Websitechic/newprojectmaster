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
      refetchOnWindowFocus: true, // Enable refetch on window focus for better real-time updates
      staleTime: 30000, // Reduce stale time to 30 seconds for more frequent updates
      gcTime: 5 * 60 * 1000, // 5 minutes garbage collection time
      retry: (failureCount, error) => {
        // Retry failed requests up to 3 times, except for auth errors
        if (error.message.includes('401')) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    }
  },
});
