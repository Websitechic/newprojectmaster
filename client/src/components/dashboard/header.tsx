import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";
import { useAuth } from "@/hooks/use-auth";

export function Header() {
  const { user } = useAuth();
  const isStaff = user?.role === "staff";
  
  return (
    <header className="h-16 border-b px-6 flex items-center justify-between">
      <div className="flex items-center flex-1 max-w-lg">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search..."
            className="pl-10 w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {isStaff && (
          <div className="text-sm mr-4">
            <span className="font-medium">Role:</span> 
            <span className="ml-2 text-muted-foreground capitalize">{user?.role}</span>
          </div>
        )}
        <NotificationsDropdown />
      </div>
    </header>
  );
}
