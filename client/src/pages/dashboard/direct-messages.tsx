
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { DirectMessages } from "@/components/chat/direct-messages";

export default function DirectMessagesPage() {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background dashboard-page-container">
      <Sidebar currentPath={location} />
      
      <div className="flex-1 flex flex-col max-w-none">
        <Header />
        <div className="flex-1 overflow-auto p-4 lg:p-6 w-full max-w-none page-content-wrapper">
          <div className="flex flex-col space-y-6 w-full max-w-none main-content-area">
            <div>
              <h1 className="text-2xl font-bold">Direct Messages</h1>
              <p className="text-muted-foreground mt-1">
                Send private messages to other users
              </p>
            </div>

            <DirectMessages />
          </div>
        </div>
      </div>
    </div>
  );
}
