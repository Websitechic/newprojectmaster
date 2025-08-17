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
import { Suspense } from "react";
import CommunicationTrackerPage from "@/pages/dashboard/communication-tracker";
import KPIReportPage from "@/pages/dashboard/kpi-report";

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
      <Route path="/dashboard/projects" component={Projects} />
      <Route path="/dashboard/projects/:id" component={ProjectDetails} />
      <Route path="/dashboard/projects/:id/tasks" component={ProjectTasks} />
      <Route path="/dashboard/projects/:id/team-chat" component={TeamChat} />
      <Route path="/dashboard/projects/:id/client-chat" component={ClientChat} />
      <Route path="/dashboard/projects/:id/staff-tasks" component={StaffProjectTasks} />
      <Route path="/dashboard/projects/:id/staff" component={StaffProjectDetails} />
      <Route path="/dashboard/projects/:id/resources" component={ProjectResources} />
      <Route path="/dashboard/staff-report" component={StaffReport} />
      <Route path="/dashboard/tasks" component={Tasks} />
      <Route path="/dashboard/leave-application" component={LeaveApplication} />
      <Route path="/dashboard/leave-management" component={LeaveManagement} />
      <Route path="/dashboard/bookings" component={Bookings} />
      <Route path="/dashboard/productivity" component={Productivity} />
      <Route path="/dashboard/direct-messages" component={DirectMessages} />
      <Route path="/dashboard/technical-support" component={TechnicalSupport} />
      <Route path="/dashboard/technical-management" component={TechnicalManagementFixed} />
      <Route path="/dashboard/extension-requests" component={ExtensionRequestsPage} />
      <Route path="/dashboard/deadline-extension-requests" component={DeadlineExtensionRequests} />
      <Route path="/dashboard/client-management" component={ClientManagement} />
      <Route path="/dashboard/guide-videos" component={GuideVideos} />
      <Route path="/dashboard/register-dissatisfaction" component={RegisterDissatisfaction} />
      <Route path="/dashboard/support-policy" component={SupportPolicy} />
      <Route path="/dashboard/emergency-support" component={EmergencySupport} />
      <Route path="/dashboard/reach-us" component={ReachUsPage} />
      <Route path="/dashboard/rate-us" component={RateUs} />
      <Route path="/dashboard/complaints-management" component={ComplaintsManagement} />
      <Route path="/dashboard/client-accounts" component={ClientAccounts} />
      <Route path="/dashboard/client-sentiment" component={ClientSentiment} />
      <Route path="/dashboard/client-sentiment-tracker" component={ClientSentimentTracker} />
      <Route path="/dashboard/memos" component={Memos} />
      <Route path="/dashboard/notes" component={Notes} />
      <Route path="/dashboard/staff-complaints" component={StaffComplaints} />
      <Route path="/dashboard/staff-queries" component={StaffQueries} />
      <Route path="/dashboard/communication-tracker" component={CommunicationTrackerPage} />
      <Route path="/dashboard/kpi-report" component={KPIReportPage} />
      <Route path="/technical-management" component={TechnicalManagementFixed} />
    </Switch>
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