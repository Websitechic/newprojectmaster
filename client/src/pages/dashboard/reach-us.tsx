
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { ReachUsChat } from "@/components/chat/reach-us-chat";

export default function ReachUsPage() {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPath={location} />
      
      <div className="flex-1 flex flex-col">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Reach Us</h1>
              <p className="text-muted-foreground mt-1">
                Connect directly with your project team
              </p>
            </div>

            <ReachUsChat />
          </div>
        </div>
      </div>
    </div>
  );
}
