
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Calendar,
  MessageCircle,
  Settings,
  Bell,
  BookOpen,
  FileText,
  BarChart3,
  Clock,
  Wrench,
  MessageSquareX,
  Home,
  TrendingUp,
  ThumbsUp,
  LifeBuoy,
  StickyNote,
  PlayCircle,
  LogOut,
  CheckSquare,
  CalendarDays,
  AlertTriangle,
  Star,
  Shield,
  Phone,
  Building2,
  MessageSquare,
  Menu,
  X,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useUnreadMessageCounts } from "@/hooks/use-unread-messages";
import { useQuery } from "@tanstack/react-query";
import { useSidebarIndicators } from "@/hooks/use-sidebar-indicators";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
  external?: boolean;
  onClick?: () => void;
  hasUpdate?: boolean;
}

function SidebarItem({ icon, label, href, active, badge, external, onClick, hasUpdate }: SidebarItemProps) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative cursor-pointer",
        active
          ? "bg-purple-100 text-purple-700 shadow-sm"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      )}
      onClick={onClick}
    >
      <div className={cn("w-5 h-5 flex-shrink-0", active ? "text-purple-700" : "text-gray-500")}>
        {icon}
      </div>
      <span className="flex-1 truncate">{label}</span>
      {(badge && badge > 0) || hasUpdate ? (
        <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
      ) : null}
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const indicators = useSidebarIndicators();
  
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["/api/projects/unread-counts"],
    refetchInterval: 30000,
  });

  const { data: unreadMemos = [] } = useQuery({
    queryKey: ["/api/memos/my-memos"],
    enabled: user?.role !== "operations_manager" && user?.specialization !== "operations_manager",
    refetchInterval: 30000,
  });

  const unreadMemoCount = Array.isArray(unreadMemos) ? unreadMemos.filter((memo: any) => !memo.isRead).length : 0;
  const totalUnreadProjectMessages = Object.values(unreadCounts || {}).reduce((total: number, count: unknown) => total + (typeof count === 'number' ? count : 0), 0);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [currentPath]);

  // Close mobile menu on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isMobileMenuOpen && !target.closest('.mobile-sidebar') && !target.closest('.mobile-menu-button')) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('click', handleOutsideClick);
      return () => document.removeEventListener('click', handleOutsideClick);
    }
  }, [isMobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  // Fetch unread count
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

  // SSE connection for real-time updates
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

    const connectionDelay = setTimeout(() => {
      connectSSE();
    }, 3000);

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

  // Menu items configuration (same as before)
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
      hasUpdate: indicators.directMessages,
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

  const pmMenuItems = user?.role === "project_manager" || isClientWithSpecialAccess ? [
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

  const staffMenuItems = user?.role === "staff" ? [
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
      hasUpdate: indicators.leaveApplications,
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
      hasUpdate: indicators.sendComplaint,
      key: "send-complaint",
    },
    {
      icon: <FileText size={20} />,
      label: "My Queries",
      href: "/dashboard/staff-queries",
      hasUpdate: indicators.myQueries,
      key: "staff-queries",
    }
  ] : user?.role === "product_owner" ? [
    {
      icon: <Calendar size={20} />,
      label: "Leave Application",
      href: "/dashboard/leave-application",
      hasUpdate: indicators.leaveApplications,
      key: "leave-application",
    },
    {
      icon: <Users size={20} />,
      label: "Client Management",
      href: "/dashboard/client-management",
      hasUpdate: indicators.clientManagement,
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
      hasUpdate: indicators.myQueries,
      key: "product-owner-queries",
    }
  ] : [];

  const technicalSupportMenuItems = user?.role === "staff" ? [
    ...(user?.specialization === "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      key: "technical-management",
    }] : []),
    ...(user?.specialization !== "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Support",
      href: "/dashboard/technical-support",
      key: "technical-support",
    }] : [])
  ] : user?.role === "product_owner" ? [
    {
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      key: "technical-management",
    }
  ] : [];

  const extensionMenuItems = user?.role === "project_manager" ? [{
    icon: <Clock size={20} />,
    label: "Deadline Extension Requests",
    href: "/dashboard/deadline-extension-requests",
    hasUpdate: indicators.extensionRequests,
    key: "deadline-extension-requests",
  }] : user?.role === "staff" ? [{
    icon: <Clock size={20} />,
    label: "Extension Requests",
    href: "/dashboard/extension-requests",
    hasUpdate: indicators.extensionRequests,
    key: "extension-requests",
  }] : [];

  const operationsManagerMenuItems = user?.specialization === "operations_manager" || user?.role === "operations_manager" ? [
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
      icon: <Building2 size={20} />,
      label: "Client Accounts",
      href: "/dashboard/client-accounts",
      key: "operations-client-accounts",
    },
    {
      icon: <FileText size={20} />,
      label: "Memos",
      href: "/dashboard/memos",
      key: "operations-memos",
    },
    {
      icon: <Wrench size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      key: "operations-technical-management",
    },
    {
      icon: <CalendarDays size={20} />,
      label: "Bookings",
      href: "/dashboard/bookings",
      key: "operations-bookings",
    },
    {
      icon: <Calendar size={20} />,
      label: "Leave Management",
      href: "/dashboard/leave-management",
      key: "operations-leave-management",
    },
    {
      icon: <Clock size={20} />,
      label: "Deadline Extension Requests",
      href: "/dashboard/deadline-extension-requests",
      key: "operations-deadline-extension-requests",
    },
    {
      icon: <TrendingUp size={20} />,
      label: "Client Sentiment Tracker",
      href: "/dashboard/client-sentiment-tracker",
      hasUpdate: indicators.clientSentimentTracker,
      key: "operations-client-sentiment-tracker",
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Staff Queries",
      href: "/dashboard/staff-queries",
      hasUpdate: indicators.myQueries,
      key: "operations-staff-queries",
    },
    {
      icon: <Phone size={20} />,
      label: "Communication Tracker",
      href: "/dashboard/communication-tracker",
      key: "operations-communication-tracker",
    },
    {
      icon: <MessageSquareX size={20} />,
      label: "Client Complaints",
      href: "/dashboard/client-complaints",
      hasUpdate: indicators.clientComplaints,
      key: "operations-client-complaints",
    },
    {
      icon: <AlertTriangle size={20} />,
      label: "Staff Complaints",
      href: "/dashboard/staff-complaints",
      hasUpdate: indicators.staffComplaints,
      key: "operations-staff-complaints",
    },
    {
      icon: <StickyNote size={20} />,
      label: "Notes",
      href: "/dashboard/notes",
      key: "operations-notes",
    },
    {
      icon: <BookOpen size={20} />,
      label: "SOP",
      href: "/dashboard/sop",
      key: "operations-sop",
    },
  ] : [];

  const clientMenuItems = user?.role === "client" ? [
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
      hasUpdate: indicators.clientSentiment,
      key: "client-sentiment",
    },
    {
      icon: <AlertTriangle size={20} />,
      label: "Register Your Dissatisfaction",
      href: "/dashboard/register-dissatisfaction",
      hasUpdate: indicators.registerDissatisfaction,
      key: "client-register-dissatisfaction",
    },
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
    ...(user?.clientType === "support_maintenance_client" ? [{
      icon: <Phone size={20} />,
      label: "Emergency During Off Days",
      href: "/dashboard/emergency-support",
      key: "client-emergency-support",
    }] : []),
    ...(user?.clientType === "project_client" ? [{
      icon: <MessageSquare size={20} />,
      label: "Reach Us",
      href: "/dashboard/reach-us",
      key: "client-reach-us",
    }] : []),
  ] : [];

  const menuItems = user?.role === "client" ? [
    {
      icon: <LayoutDashboard size={20} />,
      label: "Dashboard",
      href: "/dashboard",
      key: "dashboard",
    },
    ...clientMenuItems,
  ] : [
    ...baseMenuItems.slice(0, 2),
    ...pmMenuItems,
    ...staffMenuItems,
    ...technicalSupportMenuItems,
    ...extensionMenuItems,
    ...operationsManagerMenuItems,
    ...(user?.role !== "operations_manager" && user?.specialization !== "operations_manager" ? [{
      icon: <FileText size={20} />,
      label: "Memos",
      href: "/dashboard/memos",
      badge: unreadMemoCount > 0 ? unreadMemoCount : undefined,
      key: "memos",
    }] : []),
    ...baseMenuItems.slice(2)
  ];

  const handleMenuItemClick = () => {
    setIsMobileMenuOpen(false);
  };

  const SidebarContent = () => (
    <>
      {/* Logo Section */}
      <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">Websitechic</h1>
            <p className="text-xs text-gray-500 uppercase tracking-wide truncate">Digital Agency</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 sm:px-4 py-4 sm:py-6 overflow-y-auto">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const { key, ...itemProps } = item;
            return (
              <SidebarItem 
                key={key} 
                {...itemProps} 
                onClick={handleMenuItemClick}
                active={currentPath === item.href || (item.href !== "/dashboard" && currentPath.startsWith(item.href))}
              />
            );
          })}
        </div>
      </nav>

      {/* User Profile */}
      <div className="px-2 sm:px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-medium">
              {user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize truncate">
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
          <LogOut size={16} className="mr-3 flex-shrink-0" />
          <span className="truncate">Logout</span>
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="sm"
        className="mobile-menu-button fixed top-3 left-3 z-50 lg:hidden bg-white shadow-lg hover:bg-gray-50 touch-manipulation rounded-full p-2"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </Button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity duration-300 touch-manipulation"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex h-screen w-64 xl:w-72 bg-white border-r border-gray-200 flex-col">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <div className={cn(
        "mobile-sidebar fixed inset-y-0 left-0 z-50 w-72 sm:w-80 max-w-[85vw] bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:hidden shadow-xl",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <SidebarContent />
          </div>
        </div>
      </div>
    </>
  );
}
