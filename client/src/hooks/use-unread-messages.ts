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
  const [mentionCounts, setMentionCounts] = useState<Record<number, number>>({});
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

  // Fetch mention counts
  const fetchMentionCounts = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/mentions/unread-count');
      if (response.ok) {
        const counts = await response.json();
        setMentionCounts(counts);
      } else {
        console.warn('Failed to fetch mention counts:', response.status, response.statusText);
        setMentionCounts({});
      }
    } catch (error) {
      console.error('Failed to fetch mention counts:', error);
      setMentionCounts({});
    }
  }, [user]);

  // Fetch direct messages unread count
  const fetchDirectMessagesCount = useCallback(async () => {
    if (!user || !user.id) {
      setDirectMessagesCount(0);
      return;
    }

    try {
      const response = await fetch('/api/direct-messages/unread-count', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        setDirectMessagesCount(0);
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setDirectMessagesCount(0);
        return;
      }

      const data = await response.json();
      setDirectMessagesCount(data.count || 0);
    } catch (error) {
      // Silent fail to avoid console spam
      setDirectMessagesCount(0);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCounts({});
      setDirectMessagesCount(0);
      setMentionCounts({});
      return;
    }

    // Initial fetch
    fetchUnreadCounts().catch(console.error);
    fetchDirectMessagesCount().catch(console.error);
    fetchMentionCounts().catch(console.error);

    // Set up polling
    const interval = setInterval(() => {
      fetchUnreadCounts().catch(console.error);
      fetchDirectMessagesCount().catch(console.error);
      fetchMentionCounts().catch(console.error);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchUnreadCounts, fetchDirectMessagesCount, fetchMentionCounts, user]);

  return {
    unreadCounts,
    directMessagesCount,
    mentionCounts,
    refetch: () => {
      fetchUnreadCounts().catch(console.error);
      fetchDirectMessagesCount().catch(console.error);
      fetchMentionCounts().catch(console.error);
    }
  };
}