
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export function useUnreadMessageCounts() {
  const { user } = useAuth();

  return useQuery<Record<number, number>>({
    queryKey: ["/api/projects/unread-counts"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/projects/unread-counts", {
          credentials: 'include'
        });
        if (!response.ok) {
          if (response.status === 401) {
            return {}; // Return empty object for unauthorized users
          }
          // Don't throw for other errors, just return empty object
          console.warn(`Failed to fetch unread counts: ${response.status}`);
          return {};
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching unread counts:", error);
        return {}; // Return empty object on error
      }
    },
    enabled: !!user && !!user.id,
    refetchInterval: 10000, // Refetch every 10 seconds
    retry: false, // Don't retry failed requests
    retryOnMount: false, // Don't retry on mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    staleTime: 5000, // Consider data stale after 5 seconds
    gcTime: 30000, // Keep in cache for 30 seconds
  });
}

export function useProjectUnreadCount(projectId: number) {
  const { data: unreadCounts = {} } = useUnreadMessageCounts();
  return unreadCounts[projectId] || 0;
}
