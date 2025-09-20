import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Clock, CheckSquare, MessageSquare, AlertTriangle, X } from "lucide-react"; // Imported necessary icons
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatDistanceToNow, format, isValid, parseISO } from "date-fns";

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

  // Local state to manage notifications, for SSE updates before query refetch
  const [sseNotifications, setSseNotifications] = useState<Notification[]>([]);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      try {
        console.log("Fetching notifications for user:", user?.id);
        const res = await fetch("/api/notifications", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            console.log("Unauthorized to fetch notifications");
            return []; // Return empty array for unauthorized users
          }
          console.error(`Failed to fetch notifications: ${res.status}`);
          throw new Error(`Failed to fetch notifications: ${res.status}`);
        }
        const data = await res.json();
        console.log("Notifications fetched:", data);
        // Initialize SSE notifications with fetched data
        setSseNotifications(data);
        return data;
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
        const eventSource = new EventSource(`/api/notifications/stream`, {
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
            const data = JSON.parse(event.data);

            // Only process actual notification data, ignore system messages like heartbeat or connected
            if (data.type === 'notification' && data.notification) {
              console.log('New notification received:', data.notification);
              // Update SSE local state to prepend new notification
              setSseNotifications(prev => [data.notification, ...prev]);
              // Update query cache with the new notification
              queryClient.setQueryData(["/api/notifications"], (oldData: Notification[] = []) => {
                // Ensure the new notification is not already in the cache before prepending
                if (!oldData.some(n => n.id === data.notification.id)) {
                  return [data.notification, ...oldData];
                }
                return oldData;
              });
            }
          } catch (error) {
            console.error("Error parsing SSE message:", error);
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
  }, [user?.id, queryClient]); // Added queryClient to dependency array

  // Combine fetched notifications with SSE notifications and sort by createdAt descending
  const combinedNotifications = [...sseNotifications, ...notifications].sort((a, b) => {
    const dateA = a.createdAt ? parseISO(a.createdAt) : null;
    const dateB = b.createdAt ? parseISO(b.createdAt) : null;

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1; // a is considered newer if b has no date
    if (!dateB) return -1; // b is considered newer if a has no date

    return dateB.getTime() - dateA.getTime();
  });

  // Remove duplicates, prioritizing SSE notifications if they have the same ID
  const uniqueNotifications = Array.from(new Map(combinedNotifications.map(item => [item.id, item])).values());


  const unreadCount = uniqueNotifications.filter(n => !n.read).length;

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
      // Also update SSE local state
      setSseNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const deleteNotification = async (notificationId: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the notification click
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete notification: ${response.status}`);
      }

      // Remove from query cache
      queryClient.setQueryData(["/api/notifications"], (old: Notification[] = []) =>
        old.filter(n => n.id !== notificationId)
      );
      // Also update SSE local state
      setSseNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  // Calculate total notifications for the badge
  const totalNotifications = uniqueNotifications.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-gray-100 touch-manipulation"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {totalNotifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
              {totalNotifications > 99 ? '99+' : totalNotifications}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-72 sm:w-80 max-h-80 sm:max-h-96 overflow-y-auto"
        side="bottom"
        sideOffset={5}
      >
        {uniqueNotifications.length === 0 ? (
          <div className="p-3">
            <span className="text-sm text-muted-foreground">No notifications</span>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="p-1">
              {uniqueNotifications.map((notification, index) => (
                <DropdownMenuItem
                  key={`notification-${notification.id}-${index}`}
                  className="group flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 relative"
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
                    {/* Default icon if type is unknown or for general notifications */}
                    {(!notification.type || ["mention", "system"].includes(notification.type)) && (
                       <Bell className="h-4 w-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex flex-col space-y-1 flex-1 min-w-0">
                    <p className="text-sm pr-6">{notification.content}</p>
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        if (!notification.createdAt) {
                          console.log('Notification missing createdAt:', notification);
                          return 'Just now';
                        }

                        try {
                          // Handle both ISO strings and Date objects
                          const date = typeof notification.createdAt === 'string'
                            ? parseISO(notification.createdAt)
                            : new Date(notification.createdAt);

                          if (!isValid(date)) {
                            console.log('Invalid date for notification:', notification.id, notification.createdAt);
                            return 'Just now';
                          }

                          return formatDistanceToNow(date, { addSuffix: true });
                        } catch (error) {
                          console.error('Date parsing error for notification:', notification.id, notification.createdAt, error);
                          return 'Just now';
                        }
                      })()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-60 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                    onClick={(e) => deleteNotification(notification.id, e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}