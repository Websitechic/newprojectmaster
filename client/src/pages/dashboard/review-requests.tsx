
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useState } from "react";
import { Plus, ExternalLink, CheckCircle, Clock, Eye, Trash2, MessageSquare } from "lucide-react";

export default function ReviewRequests() {
  const [location] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewComments, setReviewComments] = useState("");

  const isProjectManager = user?.role === "project_manager";
  const isTeamLead = user?.role === "team_lead";

  // Fetch review requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["/api/review-requests"],
    enabled: isProjectManager || isTeamLead,
  });

  // Fetch team leads (for project managers)
  const { data: teamLeads } = useQuery({
    queryKey: ["/api/users"],
    enabled: isProjectManager,
  });

  const filteredTeamLeads = teamLeads?.filter((u: any) => u.role === "team_lead");

  // Create request mutation
  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create review request");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-requests"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Review request sent successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send review request",
        variant: "destructive",
      });
    },
  });

  // Update request mutation
  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status, reviewNotes }: any) => {
      const response = await fetch(`/api/review-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes }),
      });
      if (!response.ok) throw new Error("Failed to update review request");
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update review status",
        variant: "destructive",
      });
    },
  });

  // Delete request mutation
  const deleteRequestMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/review-requests/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete review request");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-requests"] });
      toast({
        title: "Success",
        description: "Review request deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete review request",
        variant: "destructive",
      });
    },
  });

  const handleCreateRequest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createRequestMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      reviewLink: formData.get("reviewLink"),
      teamLeadId: formData.get("teamLeadId"),
    });
  };

  const handleOpenReviewDialog = (request: any) => {
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
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "in_review":
        return <Badge className="bg-blue-500"><Eye className="h-3 w-3 mr-1" />In Review</Badge>;
      case "resolved":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
      case "closed":
        return <Badge className="bg-slate-500"><CheckCircle className="h-3 w-3 mr-1" />Closed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filterRequestsByStatus = (status: string) => {
    return requests?.filter((req: any) => req.status === status) || [];
  };

  const renderRequestCard = (request: any) => (
    <Card key={request.id}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">{request.title}</CardTitle>
            {request.description && (
              <p className="text-sm text-muted-foreground mt-1">{request.description}</p>
            )}
          </div>
          {getStatusBadge(request.status)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
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
          {isProjectManager && request.teamLeadName && (
            <div className="text-sm">
              <span className="font-medium">Team Lead:</span> {request.teamLeadName}
            </div>
          )}
          {isTeamLead && request.projectManagerName && (
            <div className="text-sm">
              <span className="font-medium">Project Manager:</span> {request.projectManagerName}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Created: {new Date(request.createdAt).toLocaleDateString()}
          </div>
          {request.completedAt && (
            <div className="text-sm text-muted-foreground">
              Completed: {new Date(request.completedAt).toLocaleDateString()}
            </div>
          )}
          {request.reviewNotes && (
            <div className="mt-2 p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Review Notes:</p>
              <p className="text-sm text-muted-foreground">{request.reviewNotes}</p>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            {isTeamLead && (
              <Button
                size="sm"
                onClick={() => handleOpenReviewDialog(request)}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Update Status
              </Button>
            )}
            {isProjectManager && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Review Request?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete this review request.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteRequestMutation.mutate(request.id)}
                      disabled={deleteRequestMutation.isPending}
                    >
                      {deleteRequestMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!isProjectManager && !isTeamLead) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Access denied. Only project managers and team leads can access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Review Requests</h1>
              <p className="text-muted-foreground mt-1">
                {isProjectManager ? "Send review requests to team leads" : "Review items sent by project managers"}
              </p>
            </div>
            {isProjectManager && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Send for Review
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Send for Review</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateRequest} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input id="title" name="title" required placeholder="E.g., Website Homepage Design Review" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" name="description" rows={3} placeholder="Additional context or instructions..." />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reviewLink">Review Link *</Label>
                      <Input id="reviewLink" name="reviewLink" type="url" required placeholder="https://..." />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamLeadId">Team Lead *</Label>
                      <Select name="teamLeadId" required>
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
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createRequestMutation.isPending}>
                        {createRequestMutation.isPending ? "Sending..." : "Send Request"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          ) : (
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pending">
                  Pending ({filterRequestsByStatus("pending").length})
                </TabsTrigger>
                <TabsTrigger value="in_review">
                  In Review ({filterRequestsByStatus("in_review").length})
                </TabsTrigger>
                <TabsTrigger value="resolved">
                  Resolved ({filterRequestsByStatus("resolved").length})
                </TabsTrigger>
                <TabsTrigger value="closed">
                  Closed ({filterRequestsByStatus("closed").length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-4 mt-4">
                {filterRequestsByStatus("pending").length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No pending requests</p>
                  </div>
                ) : (
                  filterRequestsByStatus("pending").map(renderRequestCard)
                )}
              </TabsContent>

              <TabsContent value="in_review" className="space-y-4 mt-4">
                {filterRequestsByStatus("in_review").length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No requests in review</p>
                  </div>
                ) : (
                  filterRequestsByStatus("in_review").map(renderRequestCard)
                )}
              </TabsContent>

              <TabsContent value="resolved" className="space-y-4 mt-4">
                {filterRequestsByStatus("resolved").length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No resolved requests</p>
                  </div>
                ) : (
                  filterRequestsByStatus("resolved").map(renderRequestCard)
                )}
              </TabsContent>

              <TabsContent value="closed" className="space-y-4 mt-4">
                {filterRequestsByStatus("closed").length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No closed requests</p>
                  </div>
                ) : (
                  filterRequestsByStatus("closed").map(renderRequestCard)
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Review Dialog */}
          <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Update Review Status</DialogTitle>
              </DialogHeader>
              {selectedRequest && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">{selectedRequest.title}</h3>
                    {selectedRequest.description && (
                      <p className="text-sm text-muted-foreground">{selectedRequest.description}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={reviewStatus} onValueChange={setReviewStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="comments">Review Comments</Label>
                    <Textarea
                      id="comments"
                      value={reviewComments}
                      onChange={(e) => setReviewComments(e.target.value)}
                      placeholder="Add your review comments..."
                      rows={4}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateStatus} disabled={updateRequestMutation.isPending}>
                      {updateRequestMutation.isPending ? "Updating..." : "Update Status"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
