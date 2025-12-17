import { Bell, MessageSquare, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/hooks/use-user";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { ScrollArea } from "@/components/ui/scroll-area";

interface UnreadMessage {
  type: "team_chat" | "direct_message" | "general_channel";
  id: number;
  name: string;
  unreadCount: number;
  projectId?: number;
  userId?: number;
}

export function Header() {
  const { user, logout } = useUser();
  const [_, setLocation] = useLocation();
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessage[]>([]);
  const { playNotificationSound, isUnlocked, isInitialized } = useNotificationSound();
  const [showUnlockButton, setShowUnlockButton] = useState(false);

  // Only show unlock button when user is logged in
  // The button will show current unlock state (enabled/not enabled)
  useEffect(() => {
    if (user) {
      setShowUnlockButton(true);
    } else {
      setShowUnlockButton(false);
    }
  }, [user]);

  // Fetch team chat unread counts
  const { data: teamChatUnreads = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/projects/unread-counts"],
    queryFn: async () => {
      const response = await fetch("/api/projects/unread-counts", {
        credentials: 'include'
      });
      if (!response.ok) return {};
      return await response.json();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Fetch direct messages unread count
  const { data: directMessagesData } = useQuery({
    queryKey: ["/api/direct-messages/conversations"],
    queryFn: async () => {
      const response = await fetch("/api/direct-messages/conversations");
      if (!response.ok) return [];
      return await response.json();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Fetch general channel unread count
  const { data: generalChannelUnread = 0 } = useQuery({
    queryKey: ["/api/general-channel/unread-count"],
    queryFn: async () => {
      const response = await fetch("/api/general-channel/unread-count");
      if (!response.ok) return 0;
      const data = await response.json();
      return data.count || 0;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Fetch project details for team chats
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects");
      if (!response.ok) return [];
      return await response.json();
    },
    enabled: !!user,
  });

  // Fetch notifications to check for mentions
  const { data: notifications = [] } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const response = await fetch("/api/notifications");
      if (!response.ok) return [];
      return await response.json();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Get mention counts from the hook
  const { mentionCounts } = useUnreadMessages();

  // Combine unread messages
  useEffect(() => {
    const combined: UnreadMessage[] = [];

    // Add general channel if there are unread messages
    if (generalChannelUnread > 0) {
      combined.push({
        type: "general_channel" as any,
        id: 0,
        name: "General Channel",
        unreadCount: generalChannelUnread,
      });
    }

    // Create a map to track projects with messages/mentions
    const projectMap = new Map<number, { name: string; count: number; hasMention: boolean }>();

    // Add team chats with unread messages
    Object.entries(teamChatUnreads).forEach(([projectId, count]) => {
      if (count > 0) {
        const project = projects.find((p: any) => p.id === parseInt(projectId));
        if (project) {
          projectMap.set(parseInt(projectId), {
            name: project.name,
            count: count,
            hasMention: false,
          });
        }
      }
    });

    // Add/update with mention counts
    Object.entries(mentionCounts).forEach(([projectId, count]) => {
      if (count > 0) {
        const project = projects.find((p: any) => p.id === parseInt(projectId));
        if (project) {
          const existing = projectMap.get(parseInt(projectId));
          if (existing) {
            // Update existing entry with mention flag
            existing.hasMention = true;
            existing.count += count;
          } else {
            // Add new entry for mention only
            projectMap.set(parseInt(projectId), {
              name: project.name,
              count: count,
              hasMention: true,
            });
          }
        }
      }
    });

    // Convert map to combined array
    projectMap.forEach((data, projectId) => {
      combined.push({
        type: "team_chat",
        id: projectId,
        name: data.hasMention ? `${data.name} (mentioned)` : data.name,
        unreadCount: data.count,
        projectId: projectId,
      });
    });

    // Add direct messages with unread messages
    if (directMessagesData) {
      directMessagesData.forEach((conv: any) => {
        if (conv.unreadCount > 0) {
          combined.push({
            type: "direct_message",
            id: conv.user.id,
            name: conv.user.name,
            unreadCount: conv.unreadCount,
            userId: conv.user.id,
          });
        }
      });
    }

    setUnreadMessages(combined);
  }, [teamChatUnreads, mentionCounts, directMessagesData, projects, generalChannelUnread]);

  const handleLogout = async () => {
    try {
      // Clear audio unlock state completely
      sessionStorage.removeItem('audioUnlocked');
      setShowUnlockButton(false);

      await logout();
      window.location.href = "/auth";
    } catch (error) {
      console.error("Logout failed:", error);
      // Still clear audio unlock state on error
      sessionStorage.removeItem('audioUnlocked');
      setShowUnlockButton(false);
      window.location.href = "/auth";
    }
  };

  const handleMessageClick = (message: UnreadMessage) => {
    if (message.type === "team_chat" && message.projectId) {
      setLocation(`/dashboard/projects/${message.projectId}/team-chat`);
    } else if (message.type === "direct_message") {
      setLocation("/dashboard/direct-messages");
    } else if (message.type === "general_channel") {
      setLocation("/dashboard/general-channel");
    }
  };

  const totalUnread = unreadMessages.reduce((sum, msg) => sum + msg.unreadCount, 0);

  return (
    <header className="h-16 sm:h-18 bg-background border-b border-border px-3 sm:px-4 lg:px-6 flex items-center justify-between w-full max-w-full overflow-hidden">
      {/* Left Section - Audio Unlock Status (hidden on mobile) */}
      <div className="hidden md:flex flex-1 max-w-md items-center min-w-0">
        {showUnlockButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!isUnlocked) {
                window.dispatchEvent(new Event('init-audio'));
              }
            }}
            className={`text-xs truncate ${isUnlocked ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground animate-pulse'}`}
          >
            {isUnlocked ? '✓ Sound Enabled' : '🔊 Click to Enable Sound'}
          </Button>
        )}
      </div>

      {/* Mobile spacer to push items to right */}
      <div className="flex-1 md:hidden ml-12 sm:ml-14 min-w-0"></div>

      {/* Right Section - Theme Toggle, Unread Messages, Notifications and Profile */}
      <div className="flex items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
        {/* Theme Toggle */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        {/* Unread Messages Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative p-2">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
              {totalUnread > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-0.5 -right-0.5 h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center p-0 text-xs"
                >
                  {totalUnread > 9 ? "9+" : totalUnread}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 sm:w-72 p-0 mr-2">
            <div className="px-3 py-2 text-xs sm:text-sm font-semibold border-b">
              Unread Messages
            </div>
            {unreadMessages.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs sm:text-sm text-muted-foreground">
                No unread messages
              </div>
            ) : (
              <ScrollArea className="h-72 sm:h-96">
                <div className="p-1">
                  {unreadMessages.map((message) => (
                    <DropdownMenuItem
                      key={`${message.type}-${message.id}`}
                      onClick={() => handleMessageClick(message)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="font-medium text-xs sm:text-sm truncate">{message.name}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {message.type === "team_chat" ? "Team Chat" : message.type === "direct_message" ? "Direct Message" : "General Channel"}
                          </span>
                        </div>
                        <Badge variant="destructive" className="ml-2 flex-shrink-0 text-xs">
                          {message.unreadCount}
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              </ScrollArea>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <NotificationsDropdown />



        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-7 w-7 sm:h-8 sm:w-8 rounded-full p-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs sm:text-sm font-medium">
                  {user?.name?.charAt(0) || 'U'}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 sm:w-56 mr-2" align="end" forceMount>
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-xs sm:text-sm font-medium leading-none truncate">{user?.name}</p>
              <p className="text-xs leading-none text-muted-foreground capitalize truncate">
                {user?.role === 'client' ?
                  `${user?.clientType?.replace('_', ' ') || 'Client'}` :
                  user?.role?.replace('_', ' ')
                }
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs sm:text-sm">
              <User className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive text-xs sm:text-sm"
              onClick={handleLogout}
            >
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}