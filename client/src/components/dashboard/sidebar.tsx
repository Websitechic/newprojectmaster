import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  Calendar,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
}

function SidebarItem({ icon, label, href, active, badge }: SidebarItemProps) {
  return (
    <Link href={href}>
      <Button
        variant={active ? "default" : "ghost"}
        className={cn(
          "w-full justify-start gap-3 relative",
          active && "bg-primary text-primary-foreground"
        )}
      >
        {icon}
        <span>{label}</span>
        {badge && badge > 0 && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
          </div>
        )}
      </Button>
    </Link>
  );
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  const { logout, user } = useUser();
  const [, setLocation] = useLocation();
  const [unreadDirectMessages, setUnreadDirectMessages] = useState(0);

  // Fetch initial unread count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch("/api/direct-messages/unread-count");
        if (response.ok) {
          const data = await response.json();
          setUnreadDirectMessages(data.count || 0);
        }
      } catch (error) {
        console.error("Error fetching unread count:", error);
      }
    };

    fetchUnreadCount();
  }, []);

  // Listen for real-time message updates
  useEffect(() => {
    if (!user) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isConnecting = false;

    const connectSSE = () => {
      if (isConnecting || !user) return;

      isConnecting = true;

      try {
        eventSource = new EventSource('/api/notifications/stream', {
          withCredentials: true
        });

        eventSource.onopen = () => {
          console.log("SSE connection opened");
          isConnecting = false;
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("SSE message received:", data);

            if (data.type === 'direct_message') {
              setUnreadDirectMessages(prev => prev + 1);
            }
          } catch (error) {
            console.error('Failed to parse SSE data:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE connection error:", error);
          isConnecting = false;

          if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
          }
          eventSource = null;

          // Only reconnect if user is still authenticated and no pending reconnection
          if (user && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              connectSSE();
            }, 5000);
          }
        };
      } catch (error) {
        console.error("Failed to create SSE connection:", error);
        isConnecting = false;
      }
    };

    // Delay connection to ensure authentication is complete
    const connectionDelay = setTimeout(() => {
      connectSSE();
    }, 1500);

    return () => {
      clearTimeout(connectionDelay);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close();
      }
      eventSource = null;
      isConnecting = false;
    };
  }, [user]);

  // Reset unread count when visiting direct messages page
  useEffect(() => {
    if (currentPath === "/dashboard/direct-messages") {
      setUnreadDirectMessages(0);
    }
  }, [currentPath]);

  // Base menu items for all users
  const baseMenuItems = [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      icon: <FileText size={20} />,
      label: "Projects",
      href: "/dashboard/projects",
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Messages",
      href: "/dashboard/messages",
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Direct Messages",
      href: "/dashboard/direct-messages",
      badge: unreadDirectMessages,
    },
    {
      icon: <Settings size={20} />,
      label: "Settings",
      href: "/dashboard/settings",
    },
  ];

  // Project manager specific menu items
  const pmMenuItems = user?.role === "project_manager" ? [
    {
      icon: <Users size={20} />,
      label: "Staff Report",
      href: "/dashboard/staff-report",
    },
    {
      icon: <Calendar size={20} />,
      label: "Leave Management",
      href: "/dashboard/leave-management",
    }
  ] : [];

  // Staff specific menu items
  const staffMenuItems = user?.role === "staff" ? [
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
    }
  ] : [];

  // Combine menu items based on user role
  const menuItems = [
    ...baseMenuItems.slice(0, 2), // Dashboard, Projects
    ...pmMenuItems,               // Project manager specific items
    ...staffMenuItems,            // Staff specific items
    ...baseMenuItems.slice(2)     // Messages, Settings
  ];

  return (
    <div className="h-screen w-64 bg-sidebar border-r px-3 py-6 flex flex-col">
      <div className="mb-6 px-3">
        <h1 className="text-xl font-bold">ProjectHub</h1>
      </div>

      <nav className="space-y-1 flex-1">
        {menuItems.map((item) => (
          <SidebarItem
            key={item.href}
            {...item}
            active={currentPath === item.href}
          />
        ))}
      </nav>

      <div className="border-t pt-4">
        <div className="px-3 mb-2">
          <p className="text-sm text-muted-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={async () => {
            try {
              await logout();
              // Use direct window location for more reliable redirection
              window.location.href = '/auth';
            } catch (error) {
              console.error("Logout failed:", error);
              // Still try to redirect even if logout API call fails
              window.location.href = '/auth';
            }
          }}
        >
          <LogOut size={20} className="mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}