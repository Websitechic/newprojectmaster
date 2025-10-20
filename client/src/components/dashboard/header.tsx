import { Bell, MessageSquare, User } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface UnreadMessage {
  type: "team_chat" | "direct_message";
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
  const { playNotificationSound } = useNotificationSound();

  // Initialize audio IMMEDIATELY on mount with multiple interaction listeners
  useEffect(() => {
    // Try to initialize immediately
    console.log('🎵 Header mounted, initializing audio...');
    window.dispatchEvent(new Event('init-audio'));
    
    // Try to play a silent sound to unlock audio (common mobile browser trick)
    const unlockAudio = () => {
      console.log('🔓 Attempting to unlock audio on user interaction');
      window.dispatchEvent(new Event('init-audio'));
      
      // Try playing the notification sound to fully unlock
      try {
        playNotificationSound();
      } catch (e) {
        console.log('Initial sound play failed (expected):', e);
      }
    };

    // Listen to multiple events
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, unlockAudio, { once: true, capture: true, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, unlockAudio, { capture: true });
      });
    };
  }, [playNotificationSound]);

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
  }, [teamChatUnreads, mentionCounts, directMessagesData, projects]);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = "/auth";
    } catch (error) {
      console.error("Logout failed:", error);
      window.location.href = "/auth";
    }
  };

  const handleMessageClick = (message: UnreadMessage) => {
    if (message.type === "team_chat" && message.projectId) {
      setLocation(`/dashboard/projects/${message.projectId}/team-chat`);
    } else if (message.type === "direct_message") {
      setLocation("/dashboard/direct-messages");
    }
  };

  const totalUnread = unreadMessages.reduce((sum, msg) => sum + msg.unreadCount, 0);

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between w-full max-w-none">
      {/* Left Section - Spacer */}
      <div className="flex-1 max-w-none lg:max-w-md ml-12 lg:ml-0">
      </div>

      {/* Right Section - Unread Messages, Notifications and Profile */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Unread Messages Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative">
              <MessageSquare className="w-5 h-5" />
              {totalUnread > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {totalUnread > 9 ? "9+" : totalUnread}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <div className="px-2 py-1.5 text-sm font-semibold">
              Unread Messages
            </div>
            <DropdownMenuSeparator />
            {unreadMessages.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No unread messages
              </div>
            ) : (
              unreadMessages.map((message) => (
                <DropdownMenuItem
                  key={`${message.type}-${message.id}`}
                  onClick={() => handleMessageClick(message)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{message.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {message.type === "team_chat" ? "Team Chat" : "Direct Message"}
                      </span>
                    </div>
                    <Badge variant="destructive" className="ml-2">
                      {message.unreadCount}
                    </Badge>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <NotificationsDropdown />

        {/* Audio Context Initializer - triggers on any click */}
        <div 
          className="hidden" 
          onClick={() => {
            // This ensures audio context is initialized on user interaction
            const event = new CustomEvent('init-audio');
            window.dispatchEvent(event);
          }}
        />

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.charAt(0) || 'U'}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-sm font-medium leading-none">{user?.name}</p>
              <p className="text-xs leading-none text-muted-foreground capitalize">
                {user?.role === 'client' ?
                  `${user?.clientType?.replace('_', ' ') || 'Client'}` :
                  user?.role?.replace('_', ' ')
                }
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive"
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