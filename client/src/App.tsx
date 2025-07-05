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
import TechnicalManagement from "@/pages/technical-management-fixed";
import ExtensionRequestsPage from "./pages/extension-requests";
import DeadlineExtensionRequestsPage from "./pages/deadline-extension-requests";

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
      <Route path="/dashboard" component={() => <PrivateRoute component={Dashboard} />} />
      <Route path="/dashboard/projects" component={() => <PrivateRoute component={Projects} />} />
      <Route path="/dashboard/projects/:id" component={() => <PrivateRoute component={ProjectDetails} />} />
      <Route path="/dashboard/projects/:id/tasks" component={() => <PrivateRoute component={ProjectTasks} />} />
      <Route path="/dashboard/projects/:id/team-chat" component={TeamChat} />
      <Route path="/dashboard/projects/:id/client-chat" component={ClientChat} />
      <Route path="/dashboard/projects/:id/staff-tasks" component={StaffProjectTasks} />
      <Route path="/dashboard/projects/:id/staff" component={StaffProjectDetails} />
      <Route path="/dashboard/projects/:id/resources" component={ProjectResources} />
      <Route path="/dashboard/staff-report" component={() => <PrivateRoute component={StaffReport} />} />
      <Route path="/dashboard/tasks" component={() => <PrivateRoute component={Tasks} />} />
      <Route path="/dashboard/leave-application" component={() => <PrivateRoute component={LeaveApplication} />} />
      <Route path="/dashboard/leave-management" component={() => <PrivateRoute component={LeaveManagement} />} />
      <Route path="/dashboard/bookings" component={() => <PrivateRoute component={Bookings} />} />
      <Route path="/dashboard/productivity" component={() => <PrivateRoute component={Productivity} />} />
      <Route path="/dashboard/direct-messages" component={() => <PrivateRoute component={DirectMessages} />} />
      <Route path="/dashboard/technical-support" component={() => <PrivateRoute component={TechnicalSupport} />} />
      <Route path="/dashboard/technical-management" component={() => <PrivateRoute component={TechnicalManagement} />} />
      <Route path="/dashboard/extension-requests" component={() => <PrivateRoute component={ExtensionRequestsPage} />} />
      <Route path="/dashboard/deadline-extension-requests" component={() => <PrivateRoute component={DeadlineExtensionRequestsPage} />} />
      <Route component={NotFound} />
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