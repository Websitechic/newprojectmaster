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
import { useAuth } from "@/hooks/use-auth";
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
  const { logoutMutation, user } = useAuth();

  const menuItems = [
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
      icon: <CheckSquare size={20} />,
      label: "Tasks",
      href: "/dashboard/tasks",
    },
    {
      icon: <Users size={20} />,
      label: "Team",
      href: "/dashboard/team",
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
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut size={20} className="mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}