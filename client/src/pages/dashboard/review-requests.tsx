
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
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useState } from "react";
import { Plus, ExternalLink, CheckCircle, Clock, Eye, Trash2 } from "lucide-react";
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

export default function ReviewRequests() {
  const [location] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

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
          ) : requests && requests.length > 0 ? (
            <div className="grid gap-4">
              {requests.map((request: any) => (
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
                          <>
                            {request.status === "pending" && (
                              <Button
                                size="sm"
                                onClick={() => updateRequestMutation.mutate({ 
                                  id: request.id, 
                                  status: "in_review",
                                  reviewNotes: request.reviewNotes 
                                })}
                                disabled={updateRequestMutation.isPending}
                              >
                                Move to In Review
                              </Button>
                            )}
                            {request.status === "in_review" && (
                              <Button
                                size="sm"
                                onClick={() => updateRequestMutation.mutate({ 
                                  id: request.id, 
                                  status: "resolved",
                                  reviewNotes: request.reviewNotes 
                                })}
                                disabled={updateRequestMutation.isPending}
                              >
                                Move to Resolved
                              </Button>
                            )}
                            {request.status === "resolved" && (
                              <Button
                                size="sm"
                                onClick={() => updateRequestMutation.mutate({ 
                                  id: request.id, 
                                  status: "closed",
                                  reviewNotes: request.reviewNotes 
                                })}
                                disabled={updateRequestMutation.isPending}
                              >
                                Move to Closed
                              </Button>
                            )}
                          </>
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
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {isProjectManager ? "No review requests sent yet" : "No review requests assigned to you"}
              </p>
            </div>
          )}

          
        </div>
      </div>
    </div>
  );
}
