
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useState } from "react";
import { Send, ExternalLink, CheckCircle, Clock, Eye, AlertCircle } from "lucide-react";

interface ReviewRequest {
  id: number;
  title: string;
  description?: string;
  reviewLink: string;
  projectManagerId: number;
  projectManagerName?: string;
  teamLeadId: number;
  teamLeadName?: string;
  status: "pending" | "in_review" | "closed";
  completedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ReviewRequests() {
  const [location] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ReviewRequest | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewComments, setReviewComments] = useState("");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    reviewLink: "",
    teamLeadId: "",
  });

  const isProjectManager = user?.role === "project_manager";
  const isTeamLead = user?.role === "team_lead";

  // Fetch review requests
  const { data: requests = [], isLoading } = useQuery<ReviewRequest[]>({
    queryKey: ["/api/review-requests"],
    enabled: isProjectManager || isTeamLead,
  });

  // Fetch team leads (for project managers)
  const { data: teamLeads } = useQuery({
    queryKey: ["/api/users"],
    enabled: isProjectManager,
  });

  const filteredTeamLeads = teamLeads?.filter((u: any) => u.role === "team_lead");

  // Create request mutation (Project Manager)
  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create review request");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-requests"] });
      setFormData({
        title: "",
        description: "",
        reviewLink: "",
        teamLeadId: "",
      });
      toast({
        title: "Success",
        description: "Review request sent successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update request mutation (Team Lead)
  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status, reviewNotes }: any) => {
      const response = await fetch(`/api/review-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, reviewNotes }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update review request");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-requests"] });
      setIsReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewStatus("");
      setReviewComments("");
      toast({
        title: "Success",
        description: "Review status updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.reviewLink.trim() || !formData.teamLeadId) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createRequestMutation.mutateAsync({
        title: formData.title.trim(),
        description: formData.description.trim(),
        reviewLink: formData.reviewLink.trim(),
        teamLeadId: formData.teamLeadId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReviewDialog = (request: ReviewRequest) => {
    setSelectedRequest(request);
    setReviewStatus(request.status);
    setReviewComments(request.reviewNotes || "");
    setIsReviewDialogOpen(true);
  };

  const handleUpdateStatus = () => {
    if (!selectedRequest) return;
    
    updateRequestMutation.mutate({
      id: selectedRequest.id,
      status: reviewStatus,
      reviewNotes: reviewComments,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { 
        color: "bg-yellow-100 text-yellow-800",
        icon: <Clock className="h-3 w-3" />,
        label: "Pending"
      },
      in_review: { 
        color: "bg-blue-100 text-blue-800",
        icon: <Eye className="h-3 w-3" />,
        label: "In Review"
      },
      closed: { 
        color: "bg-gray-100 text-gray-800",
        icon: <CheckCircle className="h-3 w-3" />,
        label: "Closed"
      },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isProjectManager && !isTeamLead) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center p-6">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
                <p className="text-gray-500 text-center">
                  Only project managers and team leads can access this page.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // PROJECT MANAGER VIEW - Send for Review Form
  if (isProjectManager) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full">
            <div className="container mx-auto px-4 py-8 max-w-6xl">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Send for Review
                </h1>
                <p className="text-gray-600">
                  Submit items for team lead review and track their status.
                </p>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                {/* Submit Review Request Form */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5" />
                      Submit Review Request
                    </CardTitle>
                    <CardDescription>
                      Send items to team leads for review and feedback.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert className="mb-6">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Please provide clear details to help the team lead understand what needs to be reviewed.
                      </AlertDescription>
                    </Alert>

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="title">Title *</Label>
                        <Input
                          id="title"
                          type="text"
                          value={formData.title}
                          onChange={(e) => handleInputChange("title", e.target.value)}
                          placeholder="E.g., Website Homepage Design Review"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="teamLeadId">Team Lead *</Label>
                        <Select
                          value={formData.teamLeadId}
                          onValueChange={(value) => handleInputChange("teamLeadId", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select team lead" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredTeamLeads?.map((tl: any) => (
                              <SelectItem key={tl.id} value={tl.id.toString()}>
                                {tl.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reviewLink">Review Link *</Label>
                        <Input
                          id="reviewLink"
                          type="url"
                          value={formData.reviewLink}
                          onChange={(e) => handleInputChange("reviewLink", e.target.value)}
                          placeholder="https://..."
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleInputChange("description", e.target.value)}
                          placeholder="Additional context or instructions..."
                          className="min-h-[100px]"
                        />
                      </div>

                      <Button type="submit" disabled={isSubmitting} className="w-full">
                        {isSubmitting ? "Sending..." : "Send for Review"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Your Review Requests History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Your Review Requests
                    </CardTitle>
                    <CardDescription>
                      Track the status of your submitted review requests.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="text-center py-8">
                        <p className="text-gray-500">Loading...</p>
                      </div>
                    ) : requests.length === 0 ? (
                      <div className="text-center py-8">
                        <Send className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No review requests submitted yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto">
                        {requests.map((request) => (
                          <div key={request.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-sm">{request.title}</h4>
                                <p className="text-xs text-gray-500 mt-1">
                                  Submitted: {formatDate(request.createdAt)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Team Lead: {request.teamLeadName}
                                </p>
                              </div>
                              {getStatusBadge(request.status)}
                            </div>

                            {request.description && (
                              <p className="text-sm text-gray-700 line-clamp-2">
                                {request.description}
                              </p>
                            )}

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">Link:</span>
                              <a
                                href={request.reviewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              >
                                {request.reviewLink}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>

                            {request.reviewNotes && (
                              <div className="bg-blue-50 p-3 rounded-lg">
                                <p className="text-xs font-medium text-blue-900 mb-1">Review Comments:</p>
                                <p className="text-xs text-blue-800">{request.reviewNotes}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TEAM LEAD VIEW - Review Management
  const pendingRequests = requests.filter(r => r.status === "pending");
  const inReviewRequests = requests.filter(r => r.status === "in_review");
  const closedRequests = requests.filter(r => r.status === "closed");

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Eye className="h-6 w-6 text-blue-600" />
                Review Requests
              </h1>
              <p className="text-muted-foreground">
                Review and manage items sent by project managers
              </p>
            </div>

            <Tabs defaultValue="pending" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="pending" className="relative">
                  Pending
                  {pendingRequests.length > 0 && (
                    <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                      {pendingRequests.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="in_review">
                  In Review ({inReviewRequests.length})
                </TabsTrigger>
                <TabsTrigger value="closed">
                  Closed ({closedRequests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-6">
                {pendingRequests.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No pending requests</h3>
                      <p className="text-gray-500 text-center">
                        All review requests have been processed.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {pendingRequests.map((request) => (
                      <ReviewRequestCard
                        key={request.id}
                        request={request}
                        onReview={handleOpenReviewDialog}
                        getStatusBadge={getStatusBadge}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="in_review" className="space-y-6">
                {inReviewRequests.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <Eye className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No requests in review</h3>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {inReviewRequests.map((request) => (
                      <ReviewRequestCard
                        key={request.id}
                        request={request}
                        onReview={handleOpenReviewDialog}
                        getStatusBadge={getStatusBadge}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="closed" className="space-y-6">
                {closedRequests.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No closed requests</h3>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {closedRequests.map((request) => (
                      <ReviewRequestCard
                        key={request.id}
                        request={request}
                        onReview={handleOpenReviewDialog}
                        getStatusBadge={getStatusBadge}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Review Dialog */}
            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Update Review Status</DialogTitle>
                </DialogHeader>
                {selectedRequest && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedRequest.title}</h3>
                        {selectedRequest.description && (
                          <p className="text-sm text-muted-foreground mt-1">{selectedRequest.description}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {getStatusBadge(selectedRequest.status)}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Project Manager:</span>
                          <p>{selectedRequest.projectManagerName}</p>
                        </div>
                        <div>
                          <span className="font-medium">Submitted:</span>
                          <p>{formatDate(selectedRequest.createdAt)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Link:</span>
                        <a
                          href={selectedRequest.reviewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {selectedRequest.reviewLink}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h3 className="font-medium mb-4">Update Status</h3>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="status">Status</Label>
                          <Select value={reviewStatus} onValueChange={setReviewStatus}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_review">In Review</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="comments">Review Comments</Label>
                          <Textarea
                            id="comments"
                            value={reviewComments}
                            onChange={(e) => setReviewComments(e.target.value)}
                            placeholder="Add your review comments..."
                            className="mt-1"
                            rows={4}
                          />
                        </div>
                        <Button 
                          onClick={handleUpdateStatus}
                          disabled={updateRequestMutation.isPending}
                          className="w-full"
                        >
                          {updateRequestMutation.isPending ? "Updating..." : "Update Status"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRequestCard({ 
  request, 
  onReview, 
  getStatusBadge, 
  formatDate 
}: { 
  request: ReviewRequest; 
  onReview: (request: ReviewRequest) => void;
  getStatusBadge: (status: string) => JSX.Element;
  formatDate: (date: string) => string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg">{request.title}</CardTitle>
            <div className="flex items-center gap-2">
              {getStatusBadge(request.status)}
            </div>
            <div className="text-sm text-gray-500">
              <span>From: {request.projectManagerName}</span>
              <span className="ml-4">Submitted: {formatDate(request.createdAt)}</span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onReview(request)}>
            <Eye className="w-4 h-4 mr-1" />
            Review
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {request.description && (
            <p className="text-sm text-gray-600 line-clamp-2">
              {request.description}
            </p>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Link:</span>
            <a
              href={request.reviewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              {request.reviewLink}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {request.reviewNotes && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-1">Review Comments:</p>
              <p className="text-xs text-gray-600">{request.reviewNotes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
