import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Clock, CheckSquare, MessageSquare, AlertTriangle, X } from "lucide-react";
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

  // SSE connection is centralized in GlobalNotificationListener (App.tsx)
  // Listen for notification events dispatched from there instead
  useEffect(() => {
    if (!user?.id) return;

    const handleNotificationEvent = () => {
      // Refresh notifications when a new one arrives
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    // Listen for custom events dispatched by GlobalNotificationListener
    window.addEventListener('notification-received', handleNotificationEvent);

    return () => {
      window.removeEventListener('notification-received', handleNotificationEvent);
    };
  }, [user?.id, queryClient]);

  // Auto-refresh notifications every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }, 30000);

    return () => clearInterval(interval);
  }, [queryClient]);

  // Set up WebSocket real-time updates for notifications
  useEffect(() => {
    const handleNotification = (event: CustomEvent) => {
      console.log("Notification received via WebSocket, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    window.addEventListener('websocket:notification', handleNotification as EventListener);

    return () => {
      window.removeEventListener('websocket:notification', handleNotification as EventListener);
    };
  }, [queryClient]);

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
      if (notification.referenceType === "project" && notification.referenceId) {
        // Navigate to project details for project-related notifications
        if (notification.type === "mention") {
          // Navigate to team chat for mentions
          setLocation(`/dashboard/projects/${notification.referenceId}/team-chat`);
        } else {
          // Navigate to project details for other project notifications
          setLocation(`/dashboard/projects/${notification.referenceId}`);
        }
      } else if (notification.referenceType === "task" && notification.referenceId) {
        // For task notifications, fetch the task to get its project ID
        try {
          const response = await fetch(`/api/tasks/${notification.referenceId}`);
          if (response.ok) {
            const task = await response.json();
            if (task.projectId) {
              // Navigate to the project details page where this task was created
              setLocation(`/dashboard/projects/${task.projectId}`);
            } else {
              // Fallback to tasks page if no project ID
              setLocation(`/dashboard/tasks`);
            }
          } else {
            // Fallback to tasks page if fetch fails
            setLocation(`/dashboard/tasks`);
          }
        } catch (fetchError) {
          console.error("Error fetching task details:", fetchError);
          // Fallback to tasks page
          setLocation(`/dashboard/tasks`);
        }
      }
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
    } catch (error) {
      console.error("Failed to delete notification:", error);
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
      <DropdownMenuContent align="end" className="w-80 p-0">
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
                    {(notification.type === "break_reminder" || notification.type === "break_ended") && (
                      <Clock className="h-4 w-4 text-orange-500" />
                    )}
                    {notification.type === "break_overtime" && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    {notification.type === "task_assignment" && (
                      <CheckSquare className="h-4 w-4 text-blue-500" />
                    )}
                    {notification.type === "message" && (
                      <MessageSquare className="h-4 w-4 text-green-500" />
                    )}
                    {(notification.type === "deadline_reminder" || notification.type === "task_overdue") && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    {notification.type === "task_completed" && (
                      <CheckSquare className="h-4 w-4 text-green-500" />
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