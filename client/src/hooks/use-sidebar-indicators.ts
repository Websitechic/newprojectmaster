
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";

interface SidebarIndicators {
  directMessages: boolean;
  leaveApplications: boolean;
  sendComplaint: boolean;
  myQueries: boolean;
  extensionRequests: boolean;
  clientSentimentTracker: boolean;
  clientComplaints: boolean;
  staffComplaints: boolean;
  clientManagement: boolean;
  registerDissatisfaction: boolean;
  clientSentiment: boolean;
  technicalSupport: boolean;
  reportAppIssue: boolean;
  appIssueManagement: boolean;
  leaveManagement: boolean;
  technicalManagement: boolean;
  assignedReviews: boolean;
}

export function useSidebarIndicators(): SidebarIndicators {
  const { user } = useUser();

  // Check for unread direct messages
  const { data: unreadDirectMessages = 0 } = useQuery({
    queryKey: ["/api/direct-messages/unread-count"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/direct-messages/unread-count");
        if (!response.ok) return 0;
        const data = await response.json();
        return data.count || 0;
      } catch (error) {
        console.error("Error fetching unread direct messages:", error);
        return 0;
      }
    },
    refetchInterval: 5000,
  });

  // Leave Application: Visible when there are updates (approval/rejection) that haven't been viewed
  const { data: leaveApplicationUpdates = false } = useQuery({
    queryKey: ["/api/leave-applications/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/leave-applications/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking leave application updates:", error);
        return false;
      }
    },
    enabled: user?.role === "staff" || user?.role === "intern" || user?.role === "project_manager",
    refetchInterval: 10000,
  });

  // Send Your Complaint: Visible when complaints have been reviewed and status updated, not yet viewed
  const { data: staffComplaintUpdates = false } = useQuery({
    queryKey: ["/api/staff-complaints/my-complaints/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/staff-complaints/my-complaints/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking staff complaint updates:", error);
        return false;
      }
    },
    enabled: user?.role === "staff" || user?.role === "intern",
    refetchInterval: 10000,
  });

  // Technical Support: Visible when request assigned or status updated, cleared when page clicked
  const { data: technicalSupportUpdates = false } = useQuery({
    queryKey: ["/api/technical-support/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/technical-support/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking technical support updates:", error);
        return false;
      }
    },
    enabled: user?.role === "staff" || user?.role === "intern",
    refetchInterval: 10000,
  });

  // Extension Requests: Visible when requests approved/declined, cleared when page clicked
  const { data: extensionRequestUpdates = false } = useQuery({
    queryKey: ["/api/deadline-extension-requests/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/deadline-extension-requests/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking extension request updates:", error);
        return false;
      }
    },
    enabled: user?.role === "staff" || user?.role === "intern",
    refetchInterval: 10000,
  });

  // Report App Issue/Error: Visible when status updated, cleared when page clicked
  const { data: reportAppIssueUpdates = false } = useQuery({
    queryKey: ["/api/issue-reports/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/issue-reports/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking app issue updates:", error);
        return false;
      }
    },
    refetchInterval: 10000,
  });

  // App Issue/Error Management: Visible when unresolved issues exist
  const { data: appIssueManagement = false } = useQuery({
    queryKey: ["/api/issue-reports/has-unresolved"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/issue-reports/has-unresolved");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUnresolved || false;
      } catch (error) {
        console.error("Error checking unresolved issues:", error);
        return false;
      }
    },
    enabled: user?.role === "operations_manager" || user?.specialization === "operations_manager" || user?.specialization === "replit_development",
    refetchInterval: 10000,
  });

  // Leave Management: Visible when new leave applications haven't been updated (approved/rejected)
  const { data: leaveManagementUpdates = false } = useQuery({
    queryKey: ["/api/leave-applications/has-pending"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/leave-applications/has-pending");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasPending || false;
      } catch (error) {
        console.error("Error checking pending leave applications:", error);
        return false;
      }
    },
    enabled: user?.role === "project_manager" || user?.role === "operations_manager" || user?.specialization === "operations_manager" || user?.role === "team_lead",
    refetchInterval: 10000,
  });

  // Technical Management: Visible when new requests haven't been assigned
  const { data: technicalManagementUpdates = false } = useQuery({
    queryKey: ["/api/technical-support/has-unassigned"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/technical-support/has-unassigned");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUnassigned || false;
      } catch (error) {
        console.error("Error checking unassigned technical requests:", error);
        return false;
      }
    },
    enabled: user?.role === "project_manager" || user?.role === "operations_manager" || user?.specialization === "operations_manager" || user?.role === "team_lead" || user?.role === "customer_support_officer" || user?.specialization === "technical_support",
    refetchInterval: 10000,
  });

  // Assigned Reviews: Visible when reviews haven't been marked as reviewed
  const { data: assignedReviewsUpdates = false } = useQuery({
    queryKey: ["/api/review-links/has-unreviewed"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/review-links/has-unreviewed");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUnreviewed || false;
      } catch (error) {
        console.error("Error checking unreviewed links:", error);
        return false;
      }
    },
    enabled: user?.role === "team_lead",
    refetchInterval: 10000,
  });

  // Check for staff query updates
  const { data: staffQueryUpdates = false } = useQuery({
    queryKey: ["/api/staff-queries/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/staff-queries/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking staff query updates:", error);
        return false;
      }
    },
    refetchInterval: 10000,
  });

  // Check for new client sentiments (for operations managers)
  const { data: newClientSentiments = false } = useQuery({
    queryKey: ["/api/client-sentiment/has-new"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/client-sentiment/has-new");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasNew || false;
      } catch (error) {
        console.error("Error checking new client sentiments:", error);
        return false;
      }
    },
    enabled: user?.role === "operations_manager" || user?.specialization === "operations_manager",
    refetchInterval: 15000,
  });

  // Check for new client complaints (for operations managers)
  const { data: newClientComplaints = false } = useQuery({
    queryKey: ["/api/complaints/has-new"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/complaints/has-new");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasNew || false;
      } catch (error) {
        console.error("Error checking new client complaints:", error);
        return false;
      }
    },
    enabled: user?.role === "operations_manager" || user?.specialization === "operations_manager" || user?.role === "team_lead",
    refetchInterval: 15000,
  });

  // Check for new staff complaints (for operations managers)
  const { data: newStaffComplaints = false } = useQuery({
    queryKey: ["/api/staff-complaints/has-new"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/staff-complaints/has-new");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasNew || false;
      } catch (error) {
        console.error("Error checking new staff complaints:", error);
        return false;
      }
    },
    enabled: user?.role === "operations_manager" || user?.specialization === "operations_manager" || user?.role === "team_lead",
    refetchInterval: 15000,
  });

  // Check for new clients (for customer support officers)
  const { data: newClients = false } = useQuery({
    queryKey: ["/api/clients/has-new"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/clients/has-new");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasNew || false;
      } catch (error) {
        console.error("Error checking new clients:", error);
        return false;
      }
    },
    enabled: user?.role === "customer_support_officer",
    refetchInterval: 15000,
  });

  // Check for client complaint updates (for clients who sent complaints)
  const { data: clientComplaintUpdates = false } = useQuery({
    queryKey: ["/api/complaints/my-complaints/has-updates"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/complaints/my-complaints/has-updates");
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasUpdates || false;
      } catch (error) {
        console.error("Error checking client complaint updates:", error);
        return false;
      }
    },
    enabled: user?.role === "client",
    refetchInterval: 10000,
  });

  // Check if client needs to submit weekly sentiment
  const { data: needsWeeklySentiment = false } = useQuery({
    queryKey: ["/api/client-sentiment/needs-weekly-submission"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/client-sentiment/needs-weekly-submission");
        if (!response.ok) return false;
        const data = await response.json();
        return data.needsSubmission || false;
      } catch (error) {
        console.error("Error checking weekly sentiment submission:", error);
        return false;
      }
    },
    enabled: user?.role === "client",
    refetchInterval: 15000,
  });

  return {
    directMessages: unreadDirectMessages > 0,
    leaveApplications: leaveApplicationUpdates,
    sendComplaint: staffComplaintUpdates,
    myQueries: staffQueryUpdates,
    extensionRequests: extensionRequestUpdates,
    clientSentimentTracker: newClientSentiments,
    clientComplaints: newClientComplaints,
    staffComplaints: newStaffComplaints,
    clientManagement: newClients,
    registerDissatisfaction: clientComplaintUpdates,
    clientSentiment: needsWeeklySentiment,
    technicalSupport: technicalSupportUpdates,
    reportAppIssue: reportAppIssueUpdates,
    appIssueManagement: appIssueManagement,
    leaveManagement: leaveManagementUpdates,
    technicalManagement: technicalManagementUpdates,
    assignedReviews: assignedReviewsUpdates,
  };
}
