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
import StaffComplaints from "@/pages/dashboard/staff-complaints";
import StaffQueries from "@/pages/dashboard/staff-queries";
import Notes from "@/pages/dashboard/notes";
import SOPPage from "@/pages/dashboard/sop";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import CommunicationTrackerPage from "@/pages/dashboard/communication-tracker";
import KPIReportPage from "@/pages/dashboard/kpi-report";
import SendComplaint from "@/pages/send-complaint";
import ReportIssues from "@/pages/report-issues";
import ReportManagement from "@/pages/dashboard/report-management";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useBrowserNotification } from "@/hooks/use-browser-notification";
import GeneralChannelPage from "@/pages/dashboard/general-channel";
import ReviewLinks from "@/pages/dashboard/review-links";
import ProjectBriefing from "@/pages/dashboard/project-briefing";


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
  const audioUnlockedRef = useRef(false);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      
      console.log('🔓 Unlocking audio on user interaction');
      window.dispatchEvent(new Event('init-audio'));
      audioUnlockedRef.current = true;
      sessionStorage.setItem('audioUnlocked', 'true');
    };

    // Only add listeners if not already unlocked
    if (!audioUnlockedRef.current) {
      const events = ['click', 'touchstart', 'keydown', 'touchend', 'mousedown'];
      events.forEach(event => {
        document.addEventListener(event, unlockAudio, { once: true, capture: true, passive: true });
      });

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, unlockAudio, { capture: true });
        });
      };
    }
  }, [])

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
              console.log('💬 Global direct message received:', {
                messageId: data.data.id,
                senderId: data.data.senderId,
                receiverId: data.data.receiverId,
                currentUserId: user?.id,
                senderName: data.data.senderName
              });

              // Validate user is authenticated
              if (!user || !user.id) {
                console.warn('⚠️ User not authenticated, skipping message processing');
                return;
              }

              // Dispatch custom event FIRST for immediate UI update - this is critical!
              console.log('🚀 Dispatching direct-message-received event');
              window.dispatchEvent(new CustomEvent('direct-message-received', { detail: data.data }));

              // Play sound for any message not sent by current user
              const isIncomingMessage = data.data.senderId !== user.id;

              if (isIncomingMessage) {
                console.log('🔊 TRIGGER: Playing sound for incoming direct message', {
                  senderId: data.data.senderId,
                  receiverId: data.data.receiverId,
                  currentUserId: user.id,
                  audioUnlocked: audioUnlockedRef.current,
                  timestamp: new Date().toISOString()
                });

                // Ensure audio is unlocked before playing
                if (!audioUnlockedRef.current) {
                  console.log('⚠️ Audio not unlocked yet, attempting unlock...');
                  window.dispatchEvent(new Event('init-audio'));
                  // Small delay to allow unlock to process
                  setTimeout(() => {
                    audioUnlockedRef.current = true;
                  }, 50);
                }

                // Play sound immediately - no delays
                playNotificationSound().catch(err => {
                  console.error('❌ Direct message sound playback failed:', err);
                });

                // Show browser notification only if message is TO current user
                if (data.data.receiverId === user.id) {
                  const senderName = data.data.senderName || 'Someone';
                  const messagePreview = data.data.content?.substring(0, 100) || 'New message';
                  showNotification(`${senderName} sent you a message`, {
                    body: messagePreview,
                    tag: 'direct-message',
                    data: { url: '/dashboard/direct-messages' },
                  });
                }
              }

              // Invalidate queries AFTER dispatching event
              queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/unread-count"] });
              queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/conversations"] });
            }
            // Handle project/team message events
            else if (data.type === 'project_message' && data.data) {
              console.log('💬 Global team message received:', {
                messageId: data.data.id,
                senderId: data.data.senderId,
                projectId: data.data.projectId,
                currentUserId: user?.id,
                senderName: data.data.senderName
              });

              // Validate user is authenticated
              if (!user || !user.id) {
                console.warn('⚠️ User not authenticated, skipping sound playback');
                return;
              }

              // Only play sound and show notification if message is from another user
              if (data.data.senderId !== user.id) {
                console.log('🔊 TRIGGER: Playing sound for incoming team message', {
                  senderId: data.data.senderId,
                  project: data.data.projectId,
                  currentUser: user.id,
                  timestamp: new Date().toISOString()
                });

                // Ensure audio is unlocked before playing
                if (!audioUnlockedRef.current) {
                  console.log('⚠️ Audio not unlocked yet, attempting unlock...');
                  window.dispatchEvent(new Event('init-audio'));
                  audioUnlockedRef.current = true;
                }

                // Play sound immediately - no delays
                playNotificationSound().catch(err => {
                  console.error('❌ Team message sound playback failed:', err);
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
                console.log('⏭️ Skipping sound - message is from current user', {
                  senderId: data.data.senderId,
                  currentUserId: user.id
                });
              }

              // Dispatch custom event for team chat components to update UI immediately
              window.dispatchEvent(new CustomEvent('team-message-received', { detail: data.data }));

              // Invalidate queries to refresh data
              queryClient.invalidateQueries({ queryKey: ["/api/projects/unread-counts"] });
              queryClient.invalidateQueries({ queryKey: ["/api/mentions/unread-count"] });
            }
            // Add SSE listener for general channel messages
            else if (data.type === 'general_channel_message') {
              console.log('💬 General channel message received:', data);

              // Don't play sound for own messages
              if (data.data?.senderId !== user?.id) {
                playNotificationSound();

                showNotification(
                  'General Channel',
                  {
                    body: `${data.data?.senderName}: ${data.data?.content?.substring(0, 50)}...`,
                    data: { url: '/dashboard/general-channel' }
                  }
                );
              }

              // Dispatch custom event for general channel
              window.dispatchEvent(new CustomEvent('general-channel-message', { detail: data.data }));

              // Invalidate queries
              queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
              queryClient.invalidateQueries({ queryKey: ["/api/general-channel/unread-count"] });
            } else if (data.type === 'general_channel_message_updated' || data.type === 'general_channel_message_deleted') {
              console.log('🔄 General channel message update:', data);
              queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
            }
            // Existing team mention logic
            else if (data.type === 'team_mention') {
              console.log('📌 Team mention notification received:', data);

              // Play notification sound for mentions
              playNotificationSound();

              // Show browser notification
              showNotification(
                'You were mentioned',
                {
                  body: data.notification?.content || 'Someone mentioned you in a team chat',
                  data: { url: '/dashboard/projects' }
                }
              );

              // Invalidate relevant queries
              queryClient.invalidateQueries({ queryKey: ["/api/mentions/unread-count"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
  }, [user?.id, queryClient, playNotificationSound, showNotification, showNotification]);

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
    <div className="min-h-screen bg-background">
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
            {user?.role === "client" ? <ClientDashboard /> : <Dashboard />}
          </Route>
          <Route path="/dashboard/projects">
            <Projects />
          </Route>
          <Route path="/dashboard/projects/:id">
            <ProjectDetails />
          </Route>
          <Route path="/dashboard/projects/:id/tasks">
            <ProjectTasks />
          </Route>
          <Route path="/dashboard/projects/:id/team-chat">
            <TeamChat />
          </Route>
          <Route path="/dashboard/projects/:id/client-chat">
            <ClientChat />
          </Route>
          <Route path="/dashboard/projects/:id/staff-tasks">
            <StaffProjectTasks />
          </Route>
          {/* Staff-specific route removed - all users now use standard project details page */}
          <Route path="/dashboard/projects/:id/resources">
            <ProjectResources />
          </Route>
          <Route path="/dashboard/staff-report" component={StaffReport} />
          <Route path="/dashboard/tasks">
            <Tasks />
          </Route>
          <Route path="/dashboard/leave-application">
            <LeaveApplication />
          </Route>
          <Route path="/dashboard/leave-management">
            <LeaveManagement />
          </Route>
          <Route path="/dashboard/bookings" component={Bookings} />
          <Route path="/dashboard/productivity">
            <Productivity />
          </Route>
          <Route path="/dashboard/direct-messages" component={DirectMessages} />
          <Route path="/dashboard/general-channel" component={GeneralChannelPage} />
          <Route path="/dashboard/guide-videos" component={GuideVideos} />
          <Route path="/dashboard/technical-support">
            <TechnicalSupport />
          </Route>
          <Route path="/dashboard/technical-management" component={TechnicalManagementFixed} />
          <Route path="/dashboard/extension-requests">
            <ExtensionRequestsPage />
          </Route>
          <Route path="/dashboard/deadline-extension-requests">
            <DeadlineExtensionRequests />
          </Route>
          <Route path="/dashboard/client-management">
            <ClientManagement />
          </Route>
          <Route path="/dashboard/register-dissatisfaction">
            <RegisterDissatisfaction />
          </Route>
          <Route path="/dashboard/support-policy">
            <SupportPolicy />
          </Route>
          <Route path="/dashboard/emergency-support">
            <EmergencySupport />
          </Route>
          <Route path="/dashboard/reach-us">
            <ReachUsPage />
          </Route>
          <Route path="/dashboard/rate-us">
            <RateUs />
          </Route>
          <Route path="/dashboard/complaints-management">
            <ComplaintsManagement />
          </Route>
          <Route path="/dashboard/client-accounts" component={ClientAccounts} />
          <Route path="/dashboard/client-sentiment">
            <ClientSentiment />
          </Route>
          <Route path="/dashboard/client-sentiment-tracker">
            <ClientSentimentTracker />
          </Route>
          <Route path="/dashboard/memos">
            <Memos />
          </Route>
          <Route path="/dashboard/notes">
            <Notes />
          </Route>
          <Route path="/dashboard/staff-queries" component={StaffQueries} />
          <Route path="/dashboard/staff-complaints">
            <StaffComplaints />
          </Route>
          <Route path="/dashboard/client-complaints">
            <ComplaintsManagement />
          </Route>
          <Route path="/dashboard/sop" component={SOPPage} />
          <Route path="/dashboard/review-links" component={ReviewLinks} />
          <Route path="/dashboard/project-briefing" component={ProjectBriefing} />
          <Route path="/dashboard/kpi-report" component={KPIReportPage} />
          <Route path="/dashboard/communication-tracker" component={CommunicationTrackerPage} />
          <Route path="/dashboard/report-management" component={ReportManagement} />
          <PrivateRoute path="/dashboard/send-complaint" component={SendComplaint} />
          <PrivateRoute path="/dashboard/report-issues" component={ReportIssues} />
          <Route component={NotFound} />
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