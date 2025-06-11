import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export function useUnreadMessageCounts() {
  const { user } = useAuth();

  return useQuery<Record<number, number>>({
    queryKey: ["/api/projects/unread-counts"],
    queryFn: async () => {
      const response = await fetch("/api/projects/unread-counts");
      if (!response.ok) {
        throw new Error("Failed to fetch unread counts");
      }
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useProjectUnreadCount(projectId: number) {
  const { data: unreadCounts = {} } = useUnreadMessageCounts();
  return unreadCounts[projectId] || 0;
}