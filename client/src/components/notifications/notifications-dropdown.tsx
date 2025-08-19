import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Clock, CheckSquare, MessageSquare, AlertTriangle } from "lucide-react"; // Imported necessary icons
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns"; // Assuming formatDistanceToNow is needed and imported from date-fns

interface Notification {
  id: number;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
  referenceId?: number;
  referenceType?: string;
}

export function NotificationsDropdown() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();
  const [isConnecting, setIsConnecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/notifications", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            return []; // Return empty array for unauthorized users
          }
          throw new Error(`Failed to fetch notifications: ${res.status}`);
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching notifications:", error);
        return []; // Return empty array on error
      }
    },
    enabled: !!user,
    refetchInterval: 30000,
    retry: false,
    retryOnMount: false,
    staleTime: 10000,
    gcTime: 60000,
  });

  // Set up SSE connection for real-time notifications
  useEffect(() => {
    if (!user?.id) return;

    const connectSSE = () => {
      if (isConnecting) return;

      setIsConnecting(true);
      console.log("Setting up SSE connection for notifications...");

      try {
        const eventSource = new EventSource(`/api/notifications/stream?userId=${user.id}`, {
          withCredentials: true,
        });

        eventSource.onopen = () => {
          console.log("SSE connection opened for notifications");
          setIsConnecting(false);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const notification = JSON.parse(event.data);
            queryClient.setQueryData(["/api/notifications"], (oldData: Notification[] = []) => {
              return [notification, ...oldData];
            });
          } catch (error) {
            console.error("Error parsing notification:", error);
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE error:", error);
          setIsConnecting(false);
          // The original code had eventSource.close() here, which is correct.
          // However, to prevent potential race conditions or double closing,
          // it's safer to ensure it's not already null or closed.
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }


          // Only reconnect if we still have a user and no existing connection
          if (user?.id && !eventSourceRef.current && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              connectSSE();
            }, 5000);
          }
        };

        eventSourceRef.current = eventSource;
      } catch (error) {
        console.error("Failed to create SSE connection:", error);
        setIsConnecting(false);
      }
    };

    // Only connect once per user session
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnecting(false);
    };
  }, [user?.id]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notification: Notification) => {
    try {
      // Mark notification as read
      await markAsRead(notification.id);

      // Handle navigation based on notification type and reference
      if (notification.type === "mention" && notification.referenceType === "project" && notification.referenceId) {
        // Navigate to team chat for the mentioned project
        setLocation(`/dashboard/projects/${notification.referenceId}/team-chat`);
      }
      // Add more navigation cases here for other notification types as needed
    } catch (error) {
      console.error("Error handling notification click:", error);
    }
  };

  const markAsRead = async (notificationId: number) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to mark notification as read: ${response.status}`);
      }

      queryClient.setQueryData(["/api/notifications"], (old: Notification[] = []) =>
        old.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell size={20} />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {notifications.length === 0 ? (
          <DropdownMenuItem key="no-notifications" disabled>
            <span className="text-sm text-muted-foreground">No notifications</span>
          </DropdownMenuItem>
        ) : (
          notifications.slice(0, 5).map((notification, index) => (
            <DropdownMenuItem
              key={`notification-${notification.id}-${index}`}
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50"
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex-shrink-0">
                {notification.type === "break_reminder" && (
                  <Clock className="h-4 w-4 text-orange-500" />
                )}
                {notification.type === "task_assignment" && (
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                )}
                {notification.type === "message" && (
                  <MessageSquare className="h-4 w-4 text-green-500" />
                )}
                {notification.type === "deadline" && (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex flex-col space-y-1">
                <p className="text-sm">{notification.content}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}