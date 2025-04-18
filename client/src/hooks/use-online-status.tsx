import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

type OnlineStatus = 'online' | 'offline' | 'idle';

interface UserStatus {
  id: number;
  name: string;
  status: OnlineStatus;
  lastActive: string | null;
  role: string;
  workStatus: string;
}

export function useOnlineStatus(userId?: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUserId = userId || user?.id;
  const isSelf = userId === undefined || userId === user?.id;
  
  // Check if userId is valid before proceeding
  if (!currentUserId) {
    return {
      status: 'offline' as OnlineStatus,
      lastActive: null,
      isLoading: false,
      error: null,
      updateStatus: () => {},
      startHeartbeat: () => {},
      stopHeartbeat: () => {},
    };
  }
  
  // Query to get the user status
  const {
    data: statusData,
    isLoading,
    error,
    refetch
  } = useQuery<UserStatus, Error>({
    queryKey: [`/api/users/${currentUserId}/status`],
    refetchInterval: isSelf ? false : 30000, // Update other users' status every 30 seconds
    retry: false,
  });
  
  // Heartbeat state
  const [heartbeatInterval, setHeartbeatInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Send heartbeat to server
  const sendHeartbeat = useCallback(async () => {
    if (!isSelf) return; // Only send heartbeat for current user
    
    try {
      await fetch('/api/user/heartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Error sending heartbeat:', error);
    }
  }, [isSelf]);
  
  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: OnlineStatus) => {
      const response = await fetch('/api/users/status', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update status');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${currentUserId}/status`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to update status: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  // Function to update status
  const updateStatus = useCallback((newStatus: OnlineStatus) => {
    if (!isSelf) return; // Only update status for current user
    updateStatusMutation.mutate(newStatus);
  }, [isSelf, updateStatusMutation]);
  
  // Start sending heartbeats
  const startHeartbeat = useCallback(() => {
    if (!isSelf || heartbeatInterval) return; // Only for current user and if not already running
    
    // Send heartbeat immediately
    sendHeartbeat();
    
    // Set up heartbeat interval (every 2 minutes)
    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000);
    setHeartbeatInterval(interval);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSelf, heartbeatInterval, sendHeartbeat]);
  
  // Stop sending heartbeats
  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      setHeartbeatInterval(null);
    }
  }, [heartbeatInterval]);
  
  // Start heartbeat when component mounts if this is the current user
  useEffect(() => {
    if (isSelf) {
      startHeartbeat();
    }
    
    // Clean up on unmount
    return () => {
      stopHeartbeat();
    };
  }, [isSelf, startHeartbeat, stopHeartbeat]);
  
  // Handle visibility change (page becomes visible/hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // User is looking at the page - mark as online and resume heartbeat
        updateStatus('online');
        startHeartbeat();
      } else {
        // User switched to a different tab - mark as idle and stop heartbeat
        updateStatus('idle');
        stopHeartbeat();
      }
    };
    
    // Add visibility change listener if this is the current user
    if (isSelf) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    return () => {
      if (isSelf) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isSelf, updateStatus, startHeartbeat, stopHeartbeat]);
  
  // Refresh status when user becomes active after being idle
  useEffect(() => {
    const handleUserActivity = () => {
      if (isSelf && statusData?.status === 'idle') {
        updateStatus('online');
        refetch();
      }
    };
    
    if (isSelf) {
      window.addEventListener('mousemove', handleUserActivity);
      window.addEventListener('keydown', handleUserActivity);
      window.addEventListener('click', handleUserActivity);
    }
    
    return () => {
      if (isSelf) {
        window.removeEventListener('mousemove', handleUserActivity);
        window.removeEventListener('keydown', handleUserActivity);
        window.removeEventListener('click', handleUserActivity);
      }
    };
  }, [isSelf, statusData?.status, updateStatus, refetch]);
  
  return {
    status: statusData?.status || 'offline',
    lastActive: statusData?.lastActive || null,
    isLoading,
    error,
    updateStatus,
    startHeartbeat,
    stopHeartbeat,
  };
}