import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  CheckCircle,
  XCircle,
  Clock,
  User,
  FileText,
  Eye,
  AlertCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";

interface LeaveApplicationWithUser {
  id: number;
  leaveType: "day_off" | "leave_of_absence";
  reason: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  proofImageUrl?: string;
  status: "pending" | "approved" | "rejected";
  appliedAt: string;
  reviewedAt?: string;
  reviewComments?: string;
  userName: string;
  userEmail: string;
}

const leaveTypeLabels = {
  day_off: "Day Off",
  leave_of_absence: "Leave of Absence",
};

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

const statusIcons = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
};

const leaveTypeColors = {
  day_off: "bg-blue-100 text-blue-800 border-blue-300",
  leave_of_absence: "bg-purple-100 text-purple-800 border-purple-300",
};

export default function LeaveManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedApplication, setSelectedApplication] = useState<LeaveApplicationWithUser | null>(null);
  const [reviewComments, setReviewComments] = useState("");
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected" | null>(null);

  // Check if user is project manager, operations manager, or team lead
  if (!user || (user.role !== "project_manager" && user.role !== "operations_manager" && user.role !== "team_lead" && user.specialization !== "operations_manager")) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/leave-management" />
        <div className="flex-1 flex flex-col">
          <Header />
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive">Only project managers, operations managers, and team leads can access leave management</p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch all leave applications
  const { data: leaveApplications, isLoading } = useQuery<LeaveApplicationWithUser[]>({
    queryKey: ["/api/leave-applications/all"],
    queryFn: async () => {
      const response = await fetch("/api/leave-applications/all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch leave applications");
      return response.json();
    },
  });

  // Review leave application
  const reviewApplication = useMutation({
    mutationFn: async ({ applicationId, status, comments }: { 
      applicationId: number; 
      status: "approved" | "rejected"; 
      comments: string; 
    }) => {
      const response = await fetch(`/api/leave-applications/${applicationId}/review`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status,
          reviewComments: comments,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Leave application ${reviewAction}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-applications/all"] });
      setIsReviewDialogOpen(false);
      setSelectedApplication(null);
      setReviewComments("");
      setReviewAction(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReview = (application: LeaveApplicationWithUser, action: "approved" | "rejected") => {
    setSelectedApplication(application);
    setReviewAction(action);
    setIsReviewDialogOpen(true);
  };

  const confirmReview = () => {
    if (selectedApplication && reviewAction) {
      // Only require comments for rejections
      if (reviewAction === "rejected" && !reviewComments.trim()) {
        toast({
          title: "Error",
          description: "Please provide a reason for rejection",
          variant: "destructive",
        });
        return;
      }
      
      reviewApplication.mutate({
        applicationId: selectedApplication.id,
        status: reviewAction,
        comments: reviewComments.trim() || undefined,
      });
    }
  };

  // Filter applications
  const pendingApplications = leaveApplications?.filter(app => app.status === "pending") || [];
  const reviewedApplications = leaveApplications?.filter(app => app.status !== "pending") || [];

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath="/dashboard/leave-management" />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full">
          <div className="space-y-4 lg:space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Leave Management</h1>
              <p className="text-muted-foreground mt-1">
                Review and manage staff leave applications
              </p>
            </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <CardTitle className="text-lg">Pending Review</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-600">{pendingApplications.length}</p>
              <p className="text-sm text-muted-foreground">Applications awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Approved</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">
                {reviewedApplications.filter(app => app.status === "approved").length}
              </p>
              <p className="text-sm text-muted-foreground">Approved applications</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Rejected</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">
                {reviewedApplications.filter(app => app.status === "rejected").length}
              </p>
              <p className="text-sm text-muted-foreground">Rejected applications</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Applications */}
        {pendingApplications.length > 0 && (
          <Card className="border-yellow-200">
            <CardHeader className="bg-yellow-50">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                Pending Applications
              </CardTitle>
              <CardDescription>
                Applications requiring your review
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApplications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{application.userName}</div>
                            <div className="text-sm text-muted-foreground">{application.userEmail}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={leaveTypeColors[application.leaveType]}>
                          {leaveTypeLabels[application.leaveType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(application.startDate, "MMM d")} - {formatDate(application.endDate, "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{application.totalDays}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(application.appliedAt, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm truncate" title={application.reason}>
                          {application.reason}
                        </p>
                        {application.proofImageUrl && (
                          <div className="flex items-center gap-1 mt-1">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Proof attached</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedApplication(application);
                              setIsDetailDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleReview(application, "approved")}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleReview(application, "rejected")}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* All Applications */}
        <Card>
          <CardHeader>
            <CardTitle>All Applications</CardTitle>
            <CardDescription>
              Complete history of leave applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Loading applications...</p>
              </div>
            ) : !leaveApplications || leaveApplications.length === 0 ? (
              <div className="text-center py-8">
                <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No leave applications found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveApplications.map((application) => {
                    const StatusIcon = statusIcons[application.status];
                    return (
                      <TableRow key={application.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{application.userName}</div>
                              <div className="text-sm text-muted-foreground">{application.userEmail}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={leaveTypeColors[application.leaveType]}>
                            {leaveTypeLabels[application.leaveType]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {formatDate(application.startDate, "MMM d")} - {formatDate(application.endDate, "MMM d, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{application.totalDays}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[application.status]}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(application.appliedAt, "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm truncate" title={application.reason}>
                            {application.reason}
                          </p>
                          {application.reviewComments && (
                            <p className="text-xs text-muted-foreground mt-1" title={application.reviewComments}>
                              Review: {application.reviewComments}
                            </p>
                          )}
                          {application.proofImageUrl && (
                            <div className="flex items-center gap-1 mt-1">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Proof attached</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedApplication(application);
                              setIsDetailDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Leave Application Details</DialogTitle>
              <DialogDescription>
                {selectedApplication && (
                  <>
                    Leave application submitted by {selectedApplication.userName}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {selectedApplication && (
              <div className="space-y-6">
                {/* Applicant Information */}
                <div className="bg-gray-50 p-4 rounded-md">
                  <h4 className="font-medium mb-3">Applicant Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Name:</span> {selectedApplication.userName}
                    </div>
                    <div>
                      <span className="font-medium">Email:</span> {selectedApplication.userEmail}
                    </div>
                    <div>
                      <span className="font-medium">Applied On:</span> {formatDate(selectedApplication.appliedAt, "MMM d, yyyy 'at' h:mm a")}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>
                      <Badge variant="outline" className={`ml-2 ${statusColors[selectedApplication.status]}`}>
                        {selectedApplication.status.charAt(0).toUpperCase() + selectedApplication.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Leave Details */}
                <div className="bg-blue-50 p-4 rounded-md">
                  <h4 className="font-medium mb-3">Leave Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Type:</span>
                      <Badge variant="outline" className={`ml-2 ${selectedApplication.leaveType === 'day_off' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-purple-100 text-purple-800 border-purple-300'}`}>
                        {leaveTypeLabels[selectedApplication.leaveType]}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">Duration:</span> {selectedApplication.totalDays} day{selectedApplication.totalDays !== 1 ? 's' : ''}
                    </div>
                    <div>
                      <span className="font-medium">Start Date:</span> {formatDate(selectedApplication.startDate, "MMM d, yyyy")}
                    </div>
                    <div>
                      <span className="font-medium">End Date:</span> {formatDate(selectedApplication.endDate, "MMM d, yyyy")}
                    </div>
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <h4 className="font-medium mb-2">Reason for Leave</h4>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm">{selectedApplication.reason}</p>
                  </div>
                </div>

                {/* Proof Image */}
                {selectedApplication.proofImageUrl && (
                  <div>
                    <h4 className="font-medium mb-2">Supporting Document</h4>
                    <div className="border rounded-md p-2">
                      <img
                        src={selectedApplication.proofImageUrl}
                        alt="Leave proof document"
                        className="max-w-full h-auto max-h-64 sm:max-h-96 object-contain rounded"
                      />
                    </div>
                  </div>
                )}

                {/* Review Information */}
                {selectedApplication.status !== "pending" && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium mb-3">Review Information</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Reviewed On:</span> {selectedApplication.reviewedAt ? formatDate(selectedApplication.reviewedAt, "MMM d, yyyy 'at' h:mm a") : 'N/A'}
                      </div>
                      {selectedApplication.reviewComments && (
                        <div>
                          <span className="font-medium">Review Comments:</span>
                          <p className="mt-1 bg-white p-2 rounded border">{selectedApplication.reviewComments}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selectedApplication.status === "pending" && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      className="text-green-600 hover:text-green-700 w-full sm:w-auto"
                      onClick={() => {
                        setIsDetailDialogOpen(false);
                        handleReview(selectedApplication, "approved");
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-600 hover:text-red-700 w-full sm:w-auto"
                      onClick={() => {
                        setIsDetailDialogOpen(false);
                        handleReview(selectedApplication, "rejected");
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)} className="w-full sm:w-auto">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review Dialog */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {reviewAction === "approved" ? "Approve" : "Reject"} Leave Application
              </DialogTitle>
              <DialogDescription>
                {selectedApplication && (
                  <>
                    {reviewAction === "approved" ? "Approve" : "Reject"} {selectedApplication.userName}'s{" "}
                    {leaveTypeLabels[selectedApplication.leaveType].toLowerCase()} request for{" "}
                    {selectedApplication.totalDays} day{selectedApplication.totalDays !== 1 ? 's' : ''}.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {selectedApplication && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-md">
                  <h4 className="font-medium mb-2">Application Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Period:</span>{" "}
                      {formatDate(selectedApplication.startDate, "MMM d")} - {formatDate(selectedApplication.endDate, "MMM d, yyyy")}
                    </div>
                    <div>
                      <span className="font-medium">Days:</span> {selectedApplication.totalDays}
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="font-medium">Reason:</span>
                    <p className="text-sm mt-1">{selectedApplication.reason}</p>
                  </div>
                  {selectedApplication.proofImageUrl && (
                    <div className="mt-2">
                      <span className="font-medium">Proof:</span>
                      <img
                        src={selectedApplication.proofImageUrl}
                        alt="Leave proof"
                        className="mt-1 max-w-xs h-32 object-cover rounded border"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="review-comments">
                    Comments {reviewAction === "rejected" ? "(Required)" : "(Optional)"}
                  </Label>
                  <Textarea
                    id="review-comments"
                    placeholder={
                      reviewAction === "approved"
                        ? "Add any comments about the approval..."
                        : "Please provide a reason for rejection..."
                    }
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    required={reviewAction === "rejected"}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmReview}
                disabled={reviewApplication.isPending || (reviewAction === "rejected" && !reviewComments.trim())}
                className={reviewAction === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
                variant={reviewAction === "rejected" ? "destructive" : "default"}
              >
                {reviewApplication.isPending
                  ? "Processing..."
                  : reviewAction === "approved"
                  ? "Approve"
                  : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}