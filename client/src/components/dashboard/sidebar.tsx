import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  FolderOpen,
  Clock,
  Wrench,
  MessageSquareX,
  Home,
  MessageCircle,
  TrendingUp,
  ThumbsUp,
  LifeBuoy,
  StickyNote,
  PlayCircle,
  LogOut,
  CalendarDays,
  AlertTriangle,
  Star,
  Shield,
  Phone,
  Building2,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useUnreadMessageCounts } from "@/hooks/use-unread-messages";
import { useQuery } from "@tanstack/react-query";


interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
  external?: boolean;
}

function SidebarItem({ icon, label, href, active, badge, external }: SidebarItemProps) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative cursor-pointer",
        active
          ? "bg-purple-100 text-purple-700 shadow-sm"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      <div className={cn("w-5 h-5", active ? "text-purple-700" : "text-gray-500")}>
        {icon}
      </div>
      <span className="flex-1">{label}</span>
      {badge && badge > 0 && (
        <div className="w-2 h-2 bg-red-500 rounded-full" />
      )}
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  const { logout, user } = useUser();
  const [, setLocation] = useLocation();
  const [unreadDirectMessages, setUnreadDirectMessages] = useState(0);
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["/api/projects/unread-counts"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch unread memos count for non-operations managers
  const { data: unreadMemos = [] } = useQuery({
    queryKey: ["/api/memos/my-memos"],
    enabled: user?.role !== "operations_manager" && user?.specialization !== "operations_manager",
    refetchInterval: 30000,
  });

  const unreadMemoCount = Array.isArray(unreadMemos) ? unreadMemos.filter((memo: any) => !memo.isRead).length : 0;

  // Calculate total unread project messages
  const totalUnreadProjectMessages = Object.values(unreadCounts || {}).reduce((total: number, count: unknown) => total + (typeof count === 'number' ? count : 0), 0);

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

  // Set up SSE connection for real-time updates (direct messages only)
  useEffect(() => {
    if (!user?.id) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isConnecting = false;

    const connectSSE = () => {
      if (isConnecting || !user?.id) return;

      isConnecting = true;

      try {
        eventSource = new EventSource('/api/notifications/stream', {
          withCredentials: true
        });

        eventSource.onopen = () => {
          console.log('SSE connection opened');
          isConnecting = false;
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'direct_message') {
              // Increment unread direct messages count
              setUnreadDirectMessages(prev => prev + 1);
            }
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          isConnecting = false;

          if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
          }
          eventSource = null;

          // Only reconnect if user is still authenticated and no pending reconnection
          if (user?.id && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              connectSSE();
            }, 5000);
          }
        };
      } catch (error) {
        console.error('Failed to create SSE connection:', error);
        isConnecting = false;
      }
    };

    // Delay connection to ensure authentication is complete
    const connectionDelay = setTimeout(() => {
      connectSSE();
    }, 3000); // Increased delay to avoid conflicts with notifications dropdown

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

  // Base menu items for all users, support maintenance clients get the same as non-clients
  const isClientWithSpecialAccess = user?.role === "client" && user?.clientType === "support_maintenance_client";
  const baseMenuItems = (user?.role !== "client" || isClientWithSpecialAccess) ? [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
      key: "dashboard",
    },
    {
      icon: <FileText size={20} />,
      label: "Projects",
      href: "/dashboard/projects",
      badge: totalUnreadProjectMessages,
      key: "projects",
    },
    {
      icon: <MessageCircle size={20} />,
      label: "Direct Messages",
      href: "/dashboard/direct-messages",
      badge: unreadDirectMessages,
      key: "direct-messages",
    },
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
      key: "guide-videos",
    },
  ] : [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
      key: "dashboard",
    },
    {
      icon: <FileText size={20} />,
      label: "Projects",
      href: "/dashboard/projects",
      badge: totalUnreadProjectMessages,
      key: "projects",
    },
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
      key: "guide-videos",
    },
  ];

  // Project manager specific menu items - support maintenance clients get technical management access
  const pmMenuItems = (user?.role === "project_manager" || isClientWithSpecialAccess) ? [
    ...(user?.role === "project_manager" ? [
      {
        icon: <Users size={20} />,
        label: "Staff Report",
        href: "/dashboard/staff-report",
        key: "staff-report",
      },
      {
        icon: <Building2 size={20} />,
        label: "Client Accounts",
        href: "/dashboard/client-accounts",
        key: "client-accounts",
      },
      {
        icon: <CalendarDays size={20} />,
        label: "Bookings",
        href: "/dashboard/bookings",
        key: "bookings",
      },
      {
        icon: <Calendar size={20} />,
        label: "Leave Management",
        href: "/dashboard/leave-management",
        key: "leave-management",
      },
    ] : []),
    {
      icon: <Wrench size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      key: "technical-management",
    }
  ] : [];

  // Staff specific menu items
  const staffMenuItems = user?.role === "staff" ? [
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
      key: "leave-application",
    },
    {
      icon: <CheckSquare size={20} />,
      label: "Productivity Tracking",
      href: "/dashboard/productivity",
      key: "productivity",
    },
    {
      icon: <MessageSquareX size={20} />,
      label: "Send Your Complaint",
      href: "/send-complaint",
      key: "send-complaint",
    },
    {
      icon: <FileText size={20} />,
      label: "My Queries",
      href: "/dashboard/staff-queries",
      key: "staff-queries",
    }
  ] : user?.role === "product_owner" ? [
    // Product owners can apply for leave
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
      key: "leave-application",
    },
    {
      icon: <Users size={20} />,
      label: "Client Management",
      href: "/dashboard/client-management",
      key: "client-management",
    },
    {
      icon: <Building2 size={20} />,
      label: "Client Accounts",
      href: "/dashboard/client-accounts",
      key: "client-accounts",
    },
    {
      icon: <FileText size={20} />,
      label: "My Queries",
      href: "/dashboard/staff-queries",
      key: "product-owner-queries",
    }
  ] : [];

  // Technical support menu items - conditional based on specialization and role
  const technicalSupportMenuItems = user?.role === "staff" ? [
    // For technical support staff, show Technical Management
    ...(user?.specialization === "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      key: "technical-management",
    }] : []),
    // For non-technical support staff (including null specialization), show Technical Support
    ...(user?.specialization !== "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Support",
      href: "/dashboard/technical-support",
      key: "technical-support",
    }] : [])
  ] : user?.role === "product_owner" ? [
    // Product owners get read-only access to Technical Management
    {
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      key: "technical-management",
    }
  ] : [];

  // Extension requests menu items
  const extensionMenuItems = user?.role === "project_manager" ? [{
    icon: <Clock size={20} />,
    label: "Deadline Extension Requests",
    href: "/dashboard/deadline-extension-requests",
    key: "deadline-extension-requests",
  }] : user?.role === "staff" ? [{
    icon: <Clock size={20} />,
    label: "Extension Requests",
    href: "/dashboard/extension-requests",
    key: "extension-requests",
  }] : [];

  // Operations Manager specific menu items
  const operationsManagerMenuItems = user?.specialization === "operations_manager" || user?.role === "operations_manager" ? [
    {
      icon: <FileText size={20} />,
      label: "Memos",
      href: "/dashboard/memos",
      key: "operations-memos",
    },
    {
      icon: <StickyNote size={20} />,
      label: "Notes",
      href: "/dashboard/notes",
      key: "operations-notes",
    },
    {
      icon: <Users size={20} />,
      label: "Staff Report",
      href: "/dashboard/staff-report",
      key: "operations-staff-report",
    },
    {
      icon: <BarChart3 size={20} />,
      label: "KPI Report",
      href: "/dashboard/kpi-report",
      key: "operations-kpi-report",
    },
    {
      icon: <FileText size={20} />,
      label: "Staff Queries",
      href: "/dashboard/staff-queries",
      key: "operations-staff-queries",
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Complaints",
      href: "/dashboard/complaints-management",
      key: "operations-complaints-management",
    },
    {
      icon: <Calendar size={20} />,
      label: "Leave Management",
      href: "/dashboard/leave-management",
      key: "operations-leave-management",
    },
    {
      icon: <Users size={20} />,
      label: "Client Accounts",
      href: "/dashboard/client-accounts",
      key: "operations-client-accounts",
    },
    {
      icon: <TrendingUp size={20} />,
      label: "Client Sentiment Tracker",
      href: "/dashboard/client-sentiment-tracker",
      key: "operations-client-sentiment-tracker",
    },
    {
      icon: <MessageCircle size={20} />,
      label: "Communication Tracker",
      href: "/dashboard/communication-tracker",
      key: "operations-communication-tracker",
    },
  ] : [];

  // Client specific menu items based on client type
  const clientMenuItems = user?.role === "client" ? [
    // Projects tab only for Support & Maintenance clients
    ...(user?.clientType === "support_maintenance_client" ? [{
      icon: <FileText size={20} />,
      label: "Projects",
      href: "/dashboard/projects",
      badge: totalUnreadProjectMessages,
      key: "client-projects",
    }] : []),
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
      key: "client-guide-videos",
    },
    {
      icon: <ThumbsUp size={20} />,
      label: "Client Sentiment",
      href: "/dashboard/client-sentiment",
      key: "client-sentiment",
    },
    {
      icon: <AlertTriangle size={20} />,
      label: "Register Your Dissatisfaction",
      href: "/dashboard/register-dissatisfaction",
      key: "client-register-dissatisfaction",
    },
    // Support Policy only for Support & Maintenance clients
    ...(user?.clientType === "support_maintenance_client" ? [{
      icon: <Shield size={20} />,
      label: "Support Policy",
      href: "/dashboard/support-policy",
      key: "client-support-policy",
    }] : []),
    {
      icon: <Star size={20} />,
      label: "Rate Us",
      href: "/dashboard/rate-us",
      key: "client-rate-us",
    },
    // Emergency During Off Days only for Support & Maintenance clients
    ...(user?.clientType === "support_maintenance_client" ? [{
      icon: <Phone size={20} />,
      label: "Emergency During Off Days",
      href: "/dashboard/emergency-support",
      key: "client-emergency-support",
    }] : []),
    // Reach Us only for Project clients
    ...(user?.clientType === "project_client" ? [{
      icon: <MessageSquare size={20} />,
      label: "Reach Us",
      href: "/dashboard/reach-us",
      key: "client-reach-us",
    }] : []),
  ] : [];

  // Combine menu items based on user role
  const menuItems = user?.role === "client" ? [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
      key: "dashboard",
    },
    ...clientMenuItems,           // Client specific items
  ] : [
    ...baseMenuItems.slice(0, 2), // Dashboard, Projects
    ...pmMenuItems,               // Project manager specific items
    ...staffMenuItems,            // Staff specific items
    ...technicalSupportMenuItems, // Technical support menu items
    ...extensionMenuItems,        // Extension requests menu items
    ...operationsManagerMenuItems,
    // Only show memos for non-operations managers (operations managers already have it in their specific menu)
    ...(user?.role !== "operations_manager" && user?.specialization !== "operations_manager" ? [{
      icon: <FileText size={20} />,
      label: "Memos",
      href: "/dashboard/memos",
      badge: unreadMemoCount > 0 ? unreadMemoCount : undefined,
      key: "memos",
    }] : []),
    ...baseMenuItems.slice(2)     // Direct Messages, Settings
  ];

  return (
    <div className="h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo Section */}
      <div className="px-6 py-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Websitechic</h1>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Digital Agency</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const { key, ...itemProps } = item;
            return <SidebarItem key={key} {...itemProps} />;
          })}
        </div>


      </nav>

      {/* User Profile */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">
                {user?.role === 'client' ?
                  `${user?.clientType?.replace('_', ' ') || 'Client'} • ${user?.productService?.replace('_', ' ') || 'Service not specified'}` :
                  user?.role?.replace('_', ' ')
                }
              </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start mt-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          onClick={async () => {
            try {
              await logout();
              window.location.href = '/auth';
            } catch (error) {
              console.error("Logout failed:", error);
              window.location.href = '/auth';
            }
          }}
        >
          <LogOut size={16} className="mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}