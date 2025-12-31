
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { DirectMessages } from "@/components/chat/direct-messages";

export default function DirectMessagesPage() {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 w-full">
          <div className="flex flex-col h-full w-full">
            <div className="flex-1 min-h-0">
              <DirectMessages />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
