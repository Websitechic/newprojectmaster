import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
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
    queryFn: () => fetch("/api/notifications", { credentials: "include" }).then(res => res.json()),
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Set up SSE connection for real-time notifications
  useEffect(() => {
    if (!user || isConnecting) return;

    const connectSSE = () => {
      if (isConnecting) return;

      console.log("Setting up SSE connection for notifications...");
      setIsConnecting(true);

      try {
        const eventSource = new EventSource("/api/notifications/stream", {
          withCredentials: true
        });
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          console.log("SSE connection opened for notifications");
          setIsConnecting(false);
          // Clear any pending reconnection attempts
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("SSE message received:", data);

            if (data.type === "notification") {
              queryClient.setQueryData(["/api/notifications"], (old: Notification[] = []) => {
                return [data.data, ...old];
              });
            }
          } catch (error) {
            console.error("Failed to parse SSE message:", error);
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE connection error:", error);
          setIsConnecting(false);

          if (eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
          }
          eventSourceRef.current = null;

          // Attempt to reconnect after a delay if user is still authenticated
          if (user && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              connectSSE();
            }, 5000);
          }
        };
      } catch (error) {
        console.error("Failed to create SSE connection:", error);
        setIsConnecting(false);
      }
    };

    // Delay initial connection to ensure authentication is complete
    const connectionTimeout = setTimeout(() => {
      connectSSE();
    }, 2000);

    return () => {
      clearTimeout(connectionTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
        eventSourceRef.current.close();
      }
      eventSourceRef.current = null;
      setIsConnecting(false);
    };
  }, [user, queryClient]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notification: Notification) => {
    // Mark notification as read
    await markAsRead(notification.id);
    
    // Handle navigation based on notification type and reference
    if (notification.type === "mention" && notification.referenceType === "project" && notification.referenceId) {
      // Navigate to team chat for the mentioned project
      setLocation(`/dashboard/projects/${notification.referenceId}/team-chat`);
    }
    // Add more navigation cases here for other notification types as needed
  };

  const markAsRead = async (notificationId: number) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
        credentials: "include",
      });

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
          <DropdownMenuItem disabled>
            No notifications
          </DropdownMenuItem>
        ) : (
          notifications.slice(0, 5).map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={`cursor-pointer ${!notification.read ? 'bg-muted' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex flex-col space-y-1">
                <p className="text-sm">{notification.content}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString()}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}