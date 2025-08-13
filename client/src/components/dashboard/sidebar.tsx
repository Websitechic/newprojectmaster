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
  CalendarDays,
  PlayCircle,
  AlertTriangle,
  Star,
  Shield,
  Phone,
  Building2,
  Clock,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useUnreadMessageCounts } from "@/hooks/use-unread-messages";
import { Wrench } from "lucide-react";


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
  const { data: unreadCounts = {} } = useUnreadMessageCounts();

  // Debug: Log user info to console
  console.log("User debug info:", {
    role: user?.role,
    specialization: user?.specialization,
    name: user?.name,
    isOperationsManager: user?.specialization === "operations_manager" || user?.role === "operations_manager"
  });

  // Calculate total unread project messages
  const totalUnreadProjectMessages = Object.values(unreadCounts).reduce((total, count) => total + count, 0);

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
          if (user && !reconnectTimeout) {
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
    },
    {
      icon: <FileText size={20} />,
      label: "Projects",
      href: "/dashboard/projects",
      badge: totalUnreadProjectMessages,
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Direct Messages",
      href: "/dashboard/direct-messages",
      badge: unreadDirectMessages,
    },
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
    },
  ] : [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      icon: <FileText size={20} />,
      label: "Projects",
      href: "/dashboard/projects",
      badge: totalUnreadProjectMessages,
    },
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
    },
  ];

  // Project manager specific menu items - support maintenance clients get technical management access
  const pmMenuItems = (user?.role === "project_manager" || isClientWithSpecialAccess) ? [
    ...(user?.role === "project_manager" ? [
      {
        icon: <Users size={20} />,
        label: "Staff Report",
        href: "/dashboard/staff-report",
      },
      {
        icon: <Building2 size={20} />,
        label: "Client Accounts",
        href: "/dashboard/client-accounts",
      },
      {
        icon: <CalendarDays size={20} />,
        label: "Bookings",
        href: "/dashboard/bookings",
      },
      {
        icon: <Calendar size={20} />,
        label: "Leave Management",
        href: "/dashboard/leave-management",
      },
    ] : []),
    {
      icon: <Wrench size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
    }
  ] : [];

  // Staff specific menu items
  const staffMenuItems = user?.role === "staff" ? [
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
    },
    {
      icon: <CheckSquare size={20} />,
      label: "Productivity Tracking",
      href: "/dashboard/productivity",
    }
  ] : user?.role === "product_owner" ? [
    // Product owners can apply for leave
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
    },
    {
      icon: <Users size={20} />,
      label: "Client Management",
      href: "/dashboard/client-management",
    },
    {
      icon: <Building2 size={20} />,
      label: "Client Accounts",
      href: "/dashboard/client-accounts",
    }
  ] : [];

  // Technical support menu items - conditional based on specialization and role
  const technicalSupportMenuItems = user?.role === "staff" ? [
    // For technical support staff, show Technical Management
    ...(user?.specialization === "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
    }] : []),
    // For non-technical support staff (including null specialization), show Technical Support
    ...(user?.specialization !== "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Support",
      href: "/dashboard/technical-support",
    }] : [])
  ] : user?.role === "product_owner" ? [
    // Product owners get read-only access to Technical Management
    {
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
    }
  ] : [];

  // Extension requests menu items
  const extensionMenuItems = user?.role === "project_manager" ? [{
    icon: <Clock size={20} />,
    label: "Deadline Extension Requests",
    href: "/dashboard/deadline-extension-requests",
  }] : user?.role === "staff" ? [{
    icon: <Clock size={20} />,
    label: "Extension Requests",
    href: "/dashboard/extension-requests",
  }] : [];

  // Operations Manager specific menu items
  const operationsManagerMenuItems = (user?.specialization === "operations_manager" || user?.role === "operations_manager") ? [
    {
      icon: <Users size={20} />,
      label: "Staff Report",
      href: "/dashboard/staff-report",
    },
    {
      icon: <Building2 size={20} />,
      label: "Client Accounts",
      href: "/dashboard/client-accounts",
    },
    {
      icon: <Wrench size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
    },
    {
      icon: <Calendar size={20} />,
      label: "Bookings",
      href: "/dashboard/bookings",
    },
    {
      icon: <AlertTriangle size={20} />,
      label: "Complaints",
      href: "/dashboard/complaints-management",
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
    }] : []),
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
    },
    {
      icon: <AlertTriangle size={20} />,
      label: "Register Your Dissatisfaction",
      href: "/dashboard/register-dissatisfaction",
    },
    // Support Policy only for Support & Maintenance clients
    ...(user?.clientType === "support_maintenance_client" ? [{
      icon: <Shield size={20} />,
      label: "Support Policy",
      href: "/dashboard/support-policy",
    }] : []),
    {
      icon: <Star size={20} />,
      label: "Rate Us",
      href: "/dashboard/rate-us",
    },
    // Emergency During Off Days only for Support & Maintenance clients
    ...(user?.clientType === "support_maintenance_client" ? [{
      icon: <Phone size={20} />,
      label: "Emergency During Off Days",
      href: "/dashboard/emergency-support",
    }] : []),
    // Reach Us only for Project clients
    ...(user?.clientType === "project_client" ? [{
      icon: <MessageSquare size={20} />,
      label: "Reach Us",
      href: "/dashboard/reach-us",
    }] : []),
  ] : [];

  // Combine menu items based on user role
  const menuItems = user?.role === "client" ? [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
    },
    ...clientMenuItems,           // Client specific items
  ] : [
    ...baseMenuItems.slice(0, 2), // Dashboard, Projects
    ...operationsManagerMenuItems, // Operations Manager specific items (should come first)
    ...pmMenuItems,               // Project manager specific items
    ...staffMenuItems,            // Staff specific items
    ...technicalSupportMenuItems, // Technical support menu items
    ...extensionMenuItems,        // Extension requests menu items
    ...baseMenuItems.slice(2)     // Direct Messages, Guide Videos
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
          {menuItems.map((item) => (
            <SidebarItem
              key={item.href}
              {...item}
              active={currentPath === item.href}
              external={item.external}
            />
          ))}
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