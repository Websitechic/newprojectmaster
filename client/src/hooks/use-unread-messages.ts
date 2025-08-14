import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { useState, useEffect, useCallback } from 'react';

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

export function useUnreadMessages() {
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [directMessagesCount, setDirectMessagesCount] = useState(0);
  const { user } = useAuth();

  // Fetch project unread counts
  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/projects/unread-counts');
      if (response.ok) {
        const counts = await response.json();
        setUnreadCounts(counts);
      } else {
        console.warn('Failed to fetch unread counts:', response.status, response.statusText);
        setUnreadCounts({});
      }
    } catch (error) {
      console.error('Failed to fetch unread counts:', error);
      setUnreadCounts({});
    }
  }, [user]);

  // Fetch direct messages unread count
  const fetchDirectMessagesCount = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/direct-messages/unread-count');
      if (response.ok) {
        const data = await response.json();
        setDirectMessagesCount(data.count || 0);
      } else {
        console.warn('Failed to fetch direct messages count:', response.status, response.statusText);
        setDirectMessagesCount(0);
      }
    } catch (error) {
      console.error('Failed to fetch direct messages count:', error);
      setDirectMessagesCount(0);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCounts({});
      setDirectMessagesCount(0);
      return;
    }

    // Initial fetch
    fetchUnreadCounts().catch(console.error);
    fetchDirectMessagesCount().catch(console.error);

    // Set up polling
    const interval = setInterval(() => {
      fetchUnreadCounts().catch(console.error);
      fetchDirectMessagesCount().catch(console.error);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchUnreadCounts, fetchDirectMessagesCount, user]);

  return {
    unreadCounts,
    directMessagesCount,
    refetch: () => {
      fetchUnreadCounts().catch(console.error);
      fetchDirectMessagesCount().catch(console.error);
    }
  };
}