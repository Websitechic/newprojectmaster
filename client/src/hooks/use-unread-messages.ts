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
          throw new Error(`Failed to fetch unread counts: ${response.status}`);
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
  });
}

export function useProjectUnreadCount(projectId: number) {
  const { data: unreadCounts = {} } = useUnreadMessageCounts();
  return unreadCounts[projectId] || 0;
}