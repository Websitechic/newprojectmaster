import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/dashboard/projects";
import ProjectDetails from "@/pages/dashboard/project-details";
import ProjectTasks from "@/pages/dashboard/project-tasks";
import Tasks from "@/pages/dashboard/tasks";
import StaffReport from "@/pages/dashboard/staff-report";
import StaffProjectTasks from "@/pages/dashboard/staff-project-tasks";
import ProjectResources from "@/pages/dashboard/project-resources";
import StaffProjectDetails from "./pages/dashboard/staff-project-details";
import TeamChat from "./pages/dashboard/team-chat";
import ClientChat from "./pages/dashboard/client-chat";
import LeaveApplication from "@/pages/dashboard/leave-application";
import LeaveManagement from "@/pages/dashboard/leave-management";
import DirectMessages from "@/pages/dashboard/direct-messages";
import Bookings from "@/pages/dashboard/bookings";
import Productivity from "@/pages/dashboard/productivity";
import TechnicalSupport from "@/pages/technical-support";
import TechnicalManagementFixed from "@/pages/technical-management-fixed";
import DeadlineExtensionRequests from "@/pages/deadline-extension-requests";
import ClientManagement from "@/pages/dashboard/client-management";
import ExtensionRequestsPage from "@/pages/extension-requests";
import GuideVideos from "@/pages/dashboard/guide-videos";
import RegisterDissatisfaction from "@/pages/dashboard/register-dissatisfaction";
import SupportPolicy from "@/pages/dashboard/support-policy";
import EmergencySupport from "@/pages/dashboard/emergency-support";
import ReachUsPage from "@/pages/dashboard/reach-us";
import RateUs from "@/pages/dashboard/rate-us";
import ClientDashboard from "@/pages/dashboard/client-dashboard";
import ComplaintsManagement from "@/pages/dashboard/complaints-management";
import ClientAccounts from "@/pages/dashboard/client-accounts";
import ClientSentiment from "@/pages/dashboard/client-sentiment";
import ClientSentimentTracker from "@/pages/dashboard/client-sentiment-tracker";

import Memos from "@/pages/dashboard/memos";
import SendComplaint from "@/pages/send-complaint";
import StaffComplaints from "@/pages/dashboard/staff-complaints";
import StaffQueries from "@/pages/dashboard/staff-queries";
import Notes from "@/pages/dashboard/notes";
import SOPPage from "@/pages/dashboard/sop";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import CommunicationTrackerPage from "@/pages/dashboard/communication-tracker";
import KPIReportPage from "@/pages/dashboard/kpi-report";
import ReportIssues from "@/pages/report-issues";
import ReportManagement from "@/pages/dashboard/report-management";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useBrowserNotification } from "@/hooks/use-browser-notification";

function PrivateRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <Component {...rest} />;
}

// Global notification listener component
function GlobalNotificationListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { playNotificationSound } = useNotificationSound();
  const { showNotification } = useBrowserNotification();

  useEffect(() => {
    if (!user?.id) return;

    const connectSSE = () => {
      if (isConnecting) return;

      setIsConnecting(true);
      console.log("🌐 Setting up global SSE connection for real-time notifications...");

      try {
        const eventSource = new EventSource(`/api/notifications/stream`, {
          withCredentials: true,
        });

        eventSource.onopen = () => {
          console.log("✅ Global SSE connection opened");
          setIsConnecting(false);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('🌐 Global SSE message received:', data);

            // Handle notification events
            if (data.type === 'notification' && data.notification) {
              console.log('🔔 Global notification received:', data.notification);
              
              // Invalidate notifications query to update UI
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              
              // Check if should play sound
              const isDirectMessage = 
                data.notification.type === 'message' && 
                data.notification.referenceType === 'direct_message';
              
              const isTaskAssignment = 
                data.notification.type === 'task_assigned' ||
                data.notification.type === 'task_assignment';
              
              if (isDirectMessage || isTaskAssignment) {
                console.log('🔊 Playing notification sound globally for notification');
                playNotificationSound().catch(err => {
                  console.error('Sound playback error:', err);
                });
              }
            }
            // Handle direct message events
            else if (data.type === 'direct_message' && data.data) {
              console.log('💬 Global direct message received:', data.data);
              
              // Play sound for any message not sent by current user
              const isIncomingMessage = data.data.senderId !== user?.id;
              
              if (isIncomingMessage) {
                console.log('🔊 Playing sound for incoming direct message from user:', data.data.senderId);
                
                // Play sound immediately
                playNotificationSound().catch(err => {
                  console.error('Sound playback error:', err);
                });
                
                // Show browser notification only if message is TO current user
                if (data.data.receiverId === user?.id) {
                  const senderName = data.data.senderName || 'Someone';
                  const messagePreview = data.data.content?.substring(0, 100) || 'New message';
                  showNotification(`${senderName} sent you a message`, {
                    body: messagePreview,
                    tag: 'direct-message',
                    data: { url: '/dashboard/direct-messages' },
                  });
                }
              } else {
                console.log('⏭️ Skipping sound - message is from current user');
              }
              
              // Dispatch custom event for direct message components to update UI immediately
              window.dispatchEvent(new CustomEvent('direct-message-received', { detail: data.data }));
              
              // Invalidate queries to refresh data
              queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/unread-count"] });
              queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/conversations"] });
            }
            // Handle project/team message events
            else if (data.type === 'project_message' && data.data) {
              console.log('💬 Global team message received:', data.data);
              
              // Only play sound and show notification if message is from another user
              if (data.data.senderId !== user?.id) {
                console.log('🔊 Playing sound for incoming team message from user:', data.data.senderId);
                
                // Play sound immediately
                playNotificationSound().catch(err => {
                  console.error('Sound playback error:', err);
                });
                
                // Show browser notification
                const senderName = data.data.senderName || 'Team member';
                const messagePreview = data.data.content?.substring(0, 100) || 'New message';
                const projectName = data.data.projectName || 'Team Chat';
                showNotification(`${senderName} in ${projectName}`, {
                  body: messagePreview,
                  tag: `team-chat-${data.data.projectId}`,
                  data: { url: `/dashboard/projects/${data.data.projectId}/team-chat` },
                });
              } else {
                console.log('⏭️ Skipping sound - message is from current user');
              }
              
              // Dispatch custom event for team chat components to update UI immediately
              window.dispatchEvent(new CustomEvent('team-message-received', { detail: data.data }));
              
              // Invalidate queries to refresh data
              queryClient.invalidateQueries({ queryKey: ["/api/projects/unread-counts"] });
              queryClient.invalidateQueries({ queryKey: ["/api/mentions/unread-count"] });
            }
          } catch (error) {
            console.error("Error parsing global SSE message:", error);
          }
        };

        eventSource.onerror = (error) => {
          console.error("Global SSE error:", error);
          setIsConnecting(false);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }

          // Reconnect after 5 seconds
          if (user?.id && !eventSourceRef.current && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              connectSSE();
            }, 5000);
          }
        };

        eventSourceRef.current = eventSource;
      } catch (error) {
        console.error("Failed to create global SSE connection:", error);
        setIsConnecting(false);
      }
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnecting(false);
    };
  }, [user?.id, queryClient, playNotificationSound, showNotification]);

  return null; // This component doesn't render anything
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {user && <GlobalNotificationListener />}
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      }>
        <Switch>
          <Route path="/auth">
            {user ? <Redirect to="/dashboard" /> : <AuthPage />}
          </Route>
          <Route path="/">
            {!user ? <Redirect to="/auth" /> : <Redirect to="/dashboard" />}
          </Route>
          <Route path="/dashboard">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              {user?.role === "client" ? <ClientDashboard /> : <Dashboard />}
            </div>
          </Route>
          <Route path="/dashboard/projects">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <Projects />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ProjectDetails />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/tasks">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ProjectTasks />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/team-chat">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <TeamChat />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/client-chat">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ClientChat />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/staff-tasks">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <StaffProjectTasks />
            </div>
          </Route>
          {/* Staff-specific route removed - all users now use standard project details page */}
          <Route path="/dashboard/projects/:id/resources">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ProjectResources />
            </div>
          </Route>
          <Route path="/dashboard/staff-report" component={StaffReport} />
          <Route path="/dashboard/tasks">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <Tasks />
            </div>
          </Route>
          <Route path="/dashboard/leave-application">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <LeaveApplication />
            </div>
          </Route>
          <Route path="/dashboard/leave-management">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <LeaveManagement />
            </div>
          </Route>
          <Route path="/dashboard/bookings" component={Bookings} />
          <Route path="/dashboard/productivity">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <Productivity />
            </div>
          </Route>
          <Route path="/dashboard/direct-messages">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <DirectMessages />
            </div>
          </Route>
          <Route path="/dashboard/technical-support">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <TechnicalSupport />
            </div>
          </Route>
          <Route path="/dashboard/technical-management" component={TechnicalManagementFixed} />
          <Route path="/dashboard/extension-requests">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ExtensionRequestsPage />
            </div>
          </Route>
          <Route path="/dashboard/deadline-extension-requests">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <DeadlineExtensionRequests />
            </div>
          </Route>
          <Route path="/dashboard/client-management">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ClientManagement />
            </div>
          </Route>
          <Route path="/dashboard/guide-videos">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <GuideVideos />
            </div>
          </Route>
          <Route path="/dashboard/register-dissatisfaction">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <RegisterDissatisfaction />
            </div>
          </Route>
          <Route path="/dashboard/support-policy">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <SupportPolicy />
            </div>
          </Route>
          <Route path="/dashboard/emergency-support">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <EmergencySupport />
            </div>
          </Route>
          <Route path="/dashboard/reach-us">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ReachUsPage />
            </div>
          </Route>
          <Route path="/dashboard/rate-us">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <RateUs />
            </div>
          </Route>
          <Route path="/dashboard/complaints-management">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ComplaintsManagement />
            </div>
          </Route>
          <Route path="/dashboard/client-accounts" component={ClientAccounts} />
          <Route path="/dashboard/client-sentiment">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ClientSentiment />
            </div>
          </Route>
          <Route path="/dashboard/client-sentiment-tracker">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ClientSentimentTracker />
            </div>
          </Route>
          <Route path="/dashboard/memos">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <Memos />
            </div>
          </Route>
          <Route path="/dashboard/notes">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <Notes />
            </div>
          </Route>
          <Route path="/dashboard/staff-queries" component={StaffQueries} />
          <Route path="/dashboard/staff-complaints">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <StaffComplaints />
            </div>
          </Route>
          <Route path="/dashboard/client-complaints">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ComplaintsManagement />
            </div>
          </Route>
          <Route path="/dashboard/sop">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <SOPPage />
            </div>
          </Route>
          <Route path="/dashboard/communication-tracker">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <CommunicationTrackerPage />
            </div>
          </Route>
          <Route path="/dashboard/kpi-report">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <KPIReportPage />
            </div>
          </Route>
          <Route path="/dashboard/technical-support">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <TechnicalSupport />
            </div>
          </Route>
          <Route path="/dashboard/technical-management">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <TechnicalManagementFixed />
            </div>
          </Route>
          <Route path="/dashboard/deadline-extension-requests">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <DeadlineExtensionRequests />
            </div>
          </Route>
          <Route path="/dashboard/send-complaint">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <SendComplaint />
            </div>
          </Route>
          <Route path="/dashboard/report-issues">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ReportIssues />
            </div>
          </Route>
          <Route path="/dashboard/report-management">
            <div className="lg:flex min-h-screen lg:ml-64 xl:ml-72">
              <ReportManagement />
            </div>
          </Route>
          <Route path="*" component={NotFound} />
        </Switch>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="app-theme">
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;