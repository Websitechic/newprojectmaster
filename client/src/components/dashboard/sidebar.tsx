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
  Bug,
  ExternalLink,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useUnreadMessageCounts } from "@/hooks/use-unread-messages";
import { useQuery } from "@tanstack/react-query";
import { useSidebarIndicators } from "@/hooks/use-sidebar-indicators";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";


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
          ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 shadow-sm"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
      )}
      onClick={onClick}
    >
      <div className={cn("w-5 h-5 flex-shrink-0", active ? "text-purple-700 dark:text-purple-300" : "text-gray-500 dark:text-gray-400")}>
        {icon}
      </div>
      <span className="flex-1 truncate">{label}</span>
      {((badge && badge > 0) || hasUpdate) ? (
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

export function AppSidebar({ currentPath }: { currentPath: string }) {
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

  // Listen for direct message events from GlobalNotificationListener (App.tsx)
  // instead of creating our own SSE connection
  useEffect(() => {
    if (!user || !user.id) return;

    const handleDirectMessage = (event: CustomEvent) => {
      const data = event.detail;
      // Only increment if message is TO current user
      if (data.receiverId === user.id) {
        setUnreadDirectMessages(prev => prev + 1);
      }
    };

    window.addEventListener('direct-message-received', handleDirectMessage as EventListener);

    return () => {
      window.removeEventListener('direct-message-received', handleDirectMessage as EventListener);
    };
  }, [user]);

  // Reset unread count when visiting direct messages page
  useEffect(() => {
    if (currentPath === "/dashboard/direct-messages") {
      setUnreadDirectMessages(0);
    }
  }, [currentPath]);

  // Menu items configuration
  const isClientWithSpecialAccess = user?.role === "client" && user?.clientType === "support_maintenance_client";
  const [generalChannelUnread, setGeneralChannelUnread] = useState(0);

  useEffect(() => {
    const fetchGeneralChannelUnread = async () => {
      try {
        const response = await fetch("/api/general-channel/unread-count");
        if (response.ok) {
          const data = await response.json();
          setGeneralChannelUnread(data.count || 0);
        }
      } catch (error) {
        console.error("Error fetching general channel unread count:", error);
      }
    };

    fetchGeneralChannelUnread();
  }, []);

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
      icon: <MessageSquare size={20} />,
      label: "General Channel",
      href: "/dashboard/general-channel",
      badge: generalChannelUnread,
      key: "general-channel",
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
      icon: <MessageSquare size={20} />,
      label: "General Channel",
      href: "/dashboard/general-channel",
      badge: generalChannelUnread,
      key: "general-channel",
    },
    {
      icon: <PlayCircle size={20} />,
      label: "Guide Videos",
      href: "/dashboard/guide-videos",
      key: "guide-videos",
    },
  ];

  const pmMenuItems = (user?.role === "project_manager" && user?.role !== "team_lead") || isClientWithSpecialAccess ? [
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
      label: "Leave Application",
      href: "/dashboard/leave-application",
      hasUpdate: indicators.leaveApplications,
      key: "leave-application",
    },
    {
      icon: <Calendar size={20} />,
      label: "Leave Management",
      href: "/dashboard/leave-management",
      hasUpdate: indicators.leaveManagement,
      key: "leave-management",
    },
    {
      icon: <Wrench size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      hasUpdate: indicators.technicalManagement,
      key: "technical-management",
    }
  ] : [];

  const staffMenuItems = (user?.role === "staff" || user?.role === "intern") ? [
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
      href: "/dashboard/send-complaint",
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
  ] : user?.role === "customer_support_officer" ? [
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
      key: "customer-support-officer-queries",
    }
  ] : [];

  const technicalSupportMenuItems = user?.role === "staff" || user?.role === "intern" ? [
    ...(user?.specialization === "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      hasUpdate: indicators.technicalManagement,
      key: "technical-management",
    }] : []),
    ...(user?.specialization !== "technical_support" ? [{
      icon: <Settings size={20} />,
      label: "Technical Support",
      href: "/dashboard/technical-support",
      hasUpdate: indicators.technicalSupport,
      key: "technical-support",
    }] : [])
  ] : user?.role === "customer_support_officer" ? [
    {
      icon: <Settings size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      hasUpdate: indicators.technicalManagement,
      key: "technical-management",
    }
  ] : [];

  const extensionMenuItems = (user?.role === "project_manager" && user?.role !== "team_lead") ? [{
    icon: <Clock size={20} />,
    label: "Deadline Extension Requests",
    href: "/dashboard/deadline-extension-requests",
    hasUpdate: indicators.extensionRequests,
    key: "deadline-extension-requests",
  }] : user?.role === "staff" || user?.role === "intern" ? [{
    icon: <Clock size={20} />,
    label: "Extension Requests",
    href: "/dashboard/extension-requests",
    hasUpdate: indicators.extensionRequests,
    key: "extension-requests",
  }] : [];

  // Operations Manager menu items (full access)
  const operationsManagerMenuItems = (user?.specialization === "operations_manager" || user?.role === "operations_manager") && user?.role !== "team_lead" ? [
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
      hasUpdate: indicators.technicalManagement,
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
      hasUpdate: indicators.leaveManagement,
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

  // Team Lead menu items (limited access - no Client Sentiment Tracker, Communication Tracker, Notes, SOP, Report Management)
  const teamLeadMenuItems = user?.role === "team_lead" ? [
    {
      icon: <Users size={20} />,
      label: "Staff Report",
      href: "/dashboard/staff-report",
      key: "team-lead-staff-report",
    },
    {
      icon: <BarChart3 size={20} />,
      label: "KPI Report",
      href: "/dashboard/kpi-report",
      key: "team-lead-kpi-report",
    },
    {
      icon: <Building2 size={20} />,
      label: "Client Accounts",
      href: "/dashboard/client-accounts",
      key: "team-lead-client-accounts",
    },
    {
      icon: <FileText size={20} />,
      label: "Memos",
      href: "/dashboard/memos",
      key: "team-lead-memos",
    },
    {
      icon: <Wrench size={20} />,
      label: "Technical Management",
      href: "/dashboard/technical-management",
      hasUpdate: indicators.technicalManagement,
      key: "team-lead-technical-management",
    },
    {
      icon: <CalendarDays size={20} />,
      label: "Bookings",
      href: "/dashboard/bookings",
      key: "team-lead-bookings",
    },
    {
      icon: <Calendar size={20} />,
      label: "Leave Management",
      href: "/dashboard/leave-management",
      hasUpdate: indicators.leaveManagement,
      key: "team-lead-leave-management",
    },
    {
      icon: <Clock size={20} />,
      label: "Deadline Extension Requests",
      href: "/dashboard/deadline-extension-requests",
      key: "team-lead-deadline-extension-requests",
    },
    {
      icon: <MessageSquare size={20} />,
      label: "Staff Queries",
      href: "/dashboard/staff-queries",
      hasUpdate: indicators.myQueries,
      key: "team-lead-staff-queries",
    },
    {
      icon: <MessageSquareX size={20} />,
      label: "Client Complaints",
      href: "/dashboard/client-complaints",
      hasUpdate: indicators.clientComplaints,
      key: "team-lead-client-complaints",
    },
    {
      icon: <AlertTriangle size={20} />,
      label: "Staff Complaints",
      href: "/dashboard/staff-complaints",
      hasUpdate: indicators.staffComplaints,
      key: "team-lead-staff-complaints",
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

  const reviewLinksMenuItem = (user?.role === "project_manager" || user?.role === "team_lead") ? [{
    icon: <ExternalLink size={20} />,
    label: user?.role === "team_lead" ? "Assigned Reviews" : "Send for Review",
    href: "/dashboard/review-links",
    hasUpdate: user?.role === "team_lead" ? indicators.assignedReviews : undefined,
    key: "review-links",
  }] : [];

  const projectBriefingMenuItem = (user?.role === "project_manager" || user?.role === "operations_manager" || user?.role === "team_lead" || user?.role === "customer_support_officer" || user?.specialization === "operations_manager") ? [{
    icon: <FileText size={20} />,
    label: "New Project Briefing",
    href: "/dashboard/project-briefing",
    key: "project-briefing",
  }] : [];

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
    ...teamLeadMenuItems,
    ...reviewLinksMenuItem,
    ...projectBriefingMenuItem,
    ...(user?.role !== "operations_manager" && user?.specialization !== "operations_manager" && user?.role !== "team_lead" ? [{
      icon: <FileText size={20} />,
      label: "Memos",
      href: "/dashboard/memos",
      badge: unreadMemoCount > 0 ? unreadMemoCount : undefined,
      key: "memos",
    }] : []),
    ...baseMenuItems.slice(2)
  ];

  const handleMenuItemClick = async (href: string) => {
    setIsMobileMenuOpen(false);

    // Clear indicators when visiting specific pages
    try {
      if (href === "/dashboard/staff-queries") {
        await fetch("/api/staff-queries/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/leave-application") {
        await fetch("/api/leave-applications/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/send-complaint") {
        await fetch("/api/staff-complaints/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/extension-requests") {
        await fetch("/api/deadline-extension-requests/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/technical-support") {
        await fetch("/api/technical-support/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/report-issues") {
        await fetch("/api/issue-reports/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/client-sentiment-tracker") {
        await fetch("/api/client-sentiment/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/client-complaints") {
        await fetch("/api/complaints/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/staff-complaints") {
        await fetch("/api/staff-complaints/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/client-management") {
        await fetch("/api/clients/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/register-dissatisfaction") {
        await fetch("/api/complaints/my-complaints/mark-viewed", { method: "POST" });
      } else if (href === "/dashboard/client-sentiment") {
        await fetch("/api/client-sentiment/mark-viewed", { method: "POST" });
      }
    } catch (error) {
      console.error("Error clearing indicator:", error);
    }
  };

  const SidebarContent = () => (
    <>
      {/* Logo Section */}
      <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">Websitechic</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">Digital Agency</p>
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
                onClick={() => handleMenuItemClick(item.href)}
                active={currentPath === item.href || (item.href !== "/dashboard" && currentPath.startsWith(item.href))}
              />
            );
          })}

          {/* Report Issues - Available to all users */}
          <SidebarItem
            icon={<Bug size={20} />}
            label="Report app issue/Error"
            href="/dashboard/report-issues"
            onClick={() => handleMenuItemClick("/dashboard/report-issues")}
            active={currentPath === "/dashboard/report-issues"}
            hasUpdate={indicators.reportAppIssue}
          />

          {/* Report Management - Only for operations managers and Replit Development staff */}
          {((user?.role === "operations_manager" || user?.specialization === "operations_manager") && user?.role !== "team_lead" || user?.specialization === "replit_development") && (
            <SidebarItem
              icon={<Bug size={20} />}
              label="App Issue/Error management"
              href="/dashboard/report-management"
              onClick={() => handleMenuItemClick("/dashboard/report-management")}
              active={currentPath === "/dashboard/report-management"}
              hasUpdate={indicators.appIssueManagement}
            />
          )}
        </div>
      </nav>

      {/* User Profile */}
      <div className="px-2 sm:px-4 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-accent">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground text-sm font-medium">
              {user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground capitalize truncate">
              {user?.role === 'client' ?
                `${user?.clientType?.replace('_', ' ') || 'Client'} • ${user?.productService?.replace('_', ' ') || 'Service not specified'}` :
                user?.role === 'project_manager' && user?.projectManagerType ?
                `${user?.role?.replace('_', ' ')} • ${user?.projectManagerType}` :
                user?.role?.replace('_', ' ')
              }
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start mt-2 text-muted-foreground hover:text-foreground hover:bg-accent"
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
        className="mobile-menu-button fixed top-3 left-3 z-50 lg:hidden bg-background shadow-lg hover:bg-accent touch-manipulation rounded-full p-2"
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
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-border bg-background h-screen fixed top-0 left-0 z-30 overflow-hidden">
        <div className="flex flex-col h-full overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-background">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}

// Export as Sidebar for backward compatibility
export { AppSidebar as Sidebar };