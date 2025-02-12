import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

export function Header() {
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
        <NotificationsDropdown />
      </div>
    </header>
  );
}