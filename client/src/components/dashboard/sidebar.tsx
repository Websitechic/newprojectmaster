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
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}

function SidebarItem({ icon, label, href, active }: SidebarItemProps) {
  return (
    <Link href={href}>
      <Button
        variant={active ? "default" : "ghost"}
        className={cn(
          "w-full justify-start gap-3",
          active && "bg-primary text-primary-foreground"
        )}
      >
        {icon}
        <span>{label}</span>
      </Button>
    </Link>
  );
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  const { logout, user } = useUser();
  const [, setLocation] = useLocation();

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
    }
  ] : [];

  // Combine menu items based on user role
  const menuItems = [
    ...baseMenuItems.slice(0, 2), // Dashboard, Projects
    ...pmMenuItems,               // Project manager specific items
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