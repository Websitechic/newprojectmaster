import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
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
import { Suspense, lazy } from "react";
import CommunicationTrackerPage from "@/pages/dashboard/communication-tracker";
import KPIReportPage from "@/pages/dashboard/kpi-report";
import ReportIssues from "@/pages/report-issues";
import ReportManagement from "@/pages/dashboard/report-management";

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
            <div className="lg:flex min-h-screen">
              {user?.role === "client" ? <ClientDashboard /> : <Dashboard />}
            </div>
          </Route>
          <Route path="/dashboard/projects">
            <div className="lg:flex min-h-screen">
              <Projects />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id">
            <div className="lg:flex min-h-screen">
              <ProjectDetails />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/tasks">
            <div className="lg:flex min-h-screen">
              <ProjectTasks />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/team-chat">
            <div className="lg:flex min-h-screen">
              <TeamChat />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/client-chat">
            <div className="lg:flex min-h-screen">
              <ClientChat />
            </div>
          </Route>
          <Route path="/dashboard/projects/:id/staff-tasks">
            <div className="lg:flex min-h-screen">
              <StaffProjectTasks />
            </div>
          </Route>
          {/* Staff-specific route removed - all users now use standard project details page */}
          <Route path="/dashboard/projects/:id/resources">
            <div className="lg:flex min-h-screen">
              <ProjectResources />
            </div>
          </Route>
          <Route path="/dashboard/staff-report">
            <PrivateRoute component={StaffReport} />
          </Route>
          <Route path="/dashboard/tasks">
            <div className="lg:flex min-h-screen">
              <Tasks />
            </div>
          </Route>
          <Route path="/dashboard/leave-application">
            <div className="lg:flex min-h-screen">
              <LeaveApplication />
            </div>
          </Route>
          <Route path="/dashboard/leave-management">
            <div className="lg:flex min-h-screen">
              <LeaveManagement />
            </div>
          </Route>
          <Route path="/dashboard/bookings">
            <PrivateRoute component={Bookings} />
          </Route>
          <Route path="/dashboard/productivity">
            <div className="lg:flex min-h-screen">
              <Productivity />
            </div>
          </Route>
          <Route path="/dashboard/direct-messages">
            <div className="lg:flex min-h-screen">
              <DirectMessages />
            </div>
          </Route>
          <Route path="/dashboard/technical-support">
            <div className="lg:flex min-h-screen">
              <TechnicalSupport />
            </div>
          </Route>
          <Route path="/dashboard/technical-management">
            <PrivateRoute component={TechnicalManagementFixed} />
          </Route>
          <Route path="/dashboard/extension-requests">
            <div className="lg:flex min-h-screen">
              <ExtensionRequestsPage />
            </div>
          </Route>
          <Route path="/dashboard/deadline-extension-requests">
            <div className="lg:flex min-h-screen">
              <DeadlineExtensionRequests />
            </div>
          </Route>
          <Route path="/dashboard/client-management">
            <div className="lg:flex min-h-screen">
              <ClientManagement />
            </div>
          </Route>
          <Route path="/dashboard/guide-videos">
            <div className="lg:flex min-h-screen">
              <GuideVideos />
            </div>
          </Route>
          <Route path="/dashboard/register-dissatisfaction">
            <div className="lg:flex min-h-screen">
              <RegisterDissatisfaction />
            </div>
          </Route>
          <Route path="/dashboard/support-policy">
            <div className="lg:flex min-h-screen">
              <SupportPolicy />
            </div>
          </Route>
          <Route path="/dashboard/emergency-support">
            <div className="lg:flex min-h-screen">
              <EmergencySupport />
            </div>
          </Route>
          <Route path="/dashboard/reach-us">
            <div className="lg:flex min-h-screen">
              <ReachUsPage />
            </div>
          </Route>
          <Route path="/dashboard/rate-us">
            <div className="lg:flex min-h-screen">
              <RateUs />
            </div>
          </Route>
          <Route path="/dashboard/complaints-management">
            <div className="lg:flex min-h-screen">
              <ComplaintsManagement />
            </div>
          </Route>
          <Route path="/dashboard/client-accounts">
            <PrivateRoute component={ClientAccounts} />
          </Route>
          <Route path="/dashboard/client-sentiment">
            <div className="lg:flex min-h-screen">
              <ClientSentiment />
            </div>
          </Route>
          <Route path="/dashboard/client-sentiment-tracker">
            <div className="lg:flex min-h-screen">
              <ClientSentimentTracker />
            </div>
          </Route>
          <Route path="/dashboard/memos">
            <div className="lg:flex min-h-screen">
              <Memos />
            </div>
          </Route>
          <Route path="/dashboard/notes">
            <div className="lg:flex min-h-screen">
              <Notes />
            </div>
          </Route>
          <Route path="/dashboard/staff-queries">
            <PrivateRoute component={StaffQueries} />
          </Route>
          <Route path="/dashboard/staff-complaints">
            <div className="lg:flex min-h-screen">
              <StaffComplaints />
            </div>
          </Route>
          <Route path="/dashboard/client-complaints">
            <div className="lg:flex min-h-screen">
              <ComplaintsManagement />
            </div>
          </Route>
          <Route path="/dashboard/sop">
            <div className="lg:flex min-h-screen">
              <SOPPage />
            </div>
          </Route>
          <Route path="/dashboard/communication-tracker">
            <div className="lg:flex min-h-screen">
              <CommunicationTrackerPage />
            </div>
          </Route>
          <Route path="/dashboard/kpi-report">
            <div className="lg:flex min-h-screen">
              <KPIReportPage />
            </div>
          </Route>
          <Route path="/dashboard/technical-support">
            <div className="lg:flex min-h-screen">
              <TechnicalSupport />
            </div>
          </Route>
          <Route path="/dashboard/technical-management">
            <div className="lg:flex min-h-screen">
              <TechnicalManagementFixed />
            </div>
          </Route>
          <Route path="/dashboard/deadline-extension-requests">
            <div className="lg:flex min-h-screen">
              <DeadlineExtensionRequests />
            </div>
          </Route>
          <Route path="/dashboard/send-complaint">
            <div className="lg:flex min-h-screen">
              <SendComplaint />
            </div>
          </Route>
          <Route path="/dashboard/report-issues">
            <div className="lg:flex min-h-screen">
              <ReportIssues />
            </div>
          </Route>
          <Route path="/dashboard/report-management">
            <div className="lg:flex min-h-screen">
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
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;