import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Notification } from "@db/schema";

const RETRY_INTERVAL = 5000; // 5 seconds

export function NotificationsDropdown() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to mark notification as read");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setupEventSource = useCallback(() => {
    if (!user) return null;

    const eventSource = new EventSource("/api/notifications/stream", {
      withCredentials: true
    });

    eventSource.onopen = () => {
      console.log("SSE connection opened");
      setIsConnected(true);
      setRetryCount(0); // Reset retry count on successful connection
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE message received:', data);

        if (data.type === "notification") {
          // Add new notification to the cache
          queryClient.setQueryData<Notification[]>(["/api/notifications"], (old = []) => {
            return [data.data, ...old];
          });

          // Show toast notification
          toast({
            title: "New Notification",
            description: data.data.content,
          });
        }
      } catch (error) {
        console.error("Error processing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      setIsConnected(false);
      eventSource.close();

      // Implement exponential backoff for retries
      const maxRetries = 5;
      if (retryCount < maxRetries) {
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          setupEventSource();
        }, timeout);
      }
    };

    return eventSource;
  }, [user, queryClient, toast, retryCount]);

  useEffect(() => {
    const eventSource = setupEventSource();
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [setupEventSource]);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={`flex flex-col items-start p-4 ${
                !notification.read ? "bg-accent/50" : ""
              }`}
              onClick={() => {
                if (!notification.read) {
                  markAsReadMutation.mutate(notification.id);
                }
              }}
            >
              <div className="text-sm">{notification.content}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(notification.createdAt!).toLocaleString()}
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}