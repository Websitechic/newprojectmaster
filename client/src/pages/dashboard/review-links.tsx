import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useState } from "react";
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
import { Plus, ExternalLink, Trash2, CheckCircle, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function ReviewLinks() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const isProjectManager = user?.role === "project_manager";
  const isTeamLead = user?.role === "team_lead";
  const isOperationsManager = user?.role === "operations_manager";
  const isCustomerSupportOfficer = user?.role === "customer_support_officer";

  const allowedRolesForNewProjectBriefing = [
    "project_manager",
    "operations_manager",
    "customer_support_officer",
    "team_lead",
  ];
  const canAccessNewProjectBriefing = allowedRolesForNewProjectBriefing.includes(user?.role);

  // Fetch review links
  const { data: reviewLinks = [], isLoading, error } = useQuery({
    queryKey: ["/api/review-links"],
    queryFn: async () => {
      const response = await fetch("/api/review-links");
      if (!response.ok) {
        throw new Error("Failed to fetch review links");
      }
      return response.json();
    },
  });

  // Fetch team leads (for project managers)
  const { data: teamLeads = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const users = await response.json();
      return users.filter((u: any) => u.role === "team_lead");
    },
    enabled: isProjectManager,
  });

  // Create review link mutation
  const createLinkMutation = useMutation({
    mutationFn: async (data: { title: string; linkUrl: string; description: string; assignedTo: string }) => {
      const response = await fetch("/api/review-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create review link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-links"] });
      toast({
        title: "Success",
        description: "Review link sent successfully",
      });
      setIsDialogOpen(false);
      setTitle("");
      setLinkUrl("");
      setDescription("");
      setAssignedTo("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mark as reviewed mutation
  const markReviewedMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const response = await fetch(`/api/review-links/${linkId}/reviewed`, {
        method: "PUT",
      });
      if (!response.ok) {
        throw new Error("Failed to mark as reviewed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-links"] });
      toast({
        title: "Success",
        description: "Link marked as reviewed",
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

  // Delete link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const response = await fetch(`/api/review-links/${linkId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete review link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review-links"] });
      toast({
        title: "Success",
        description: "Review link deleted successfully",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !linkUrl || !assignedTo) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createLinkMutation.mutate({ title, linkUrl, description, assignedTo });
  };

  if (!isProjectManager && !isTeamLead) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Access denied. Only Project Managers and Team Leads can access this page.</p>
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
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isProjectManager ? "Send for Review" : "Assigned Reviews"}
                </h1>
                <p className="text-gray-600 mt-1">
                  {isProjectManager
                    ? "Send links to Team Leads for review"
                    : "Review links sent by Project Managers"}
                </p>
              </div>
              {isProjectManager && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Send Review Link
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Send Review Link</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="title">Title *</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Enter link title"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="linkUrl">Link URL *</Label>
                        <Input
                          id="linkUrl"
                          type="url"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Add any notes or instructions"
                          className="mt-1"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="assignedTo">Assign to Team Lead *</Label>
                        <Select value={assignedTo} onValueChange={setAssignedTo}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select a team lead" />
                          </SelectTrigger>
                          <SelectContent>
                            {teamLeads.map((teamLead: any) => (
                              <SelectItem key={teamLead.id} value={teamLead.id.toString()}>
                                {teamLead.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" className="w-full" disabled={createLinkMutation.isPending}>
                        {createLinkMutation.isPending ? "Sending..." : "Send Link"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Links</p>
                    <p className="text-2xl font-bold">{reviewLinks.length}</p>
                  </div>
                  <ExternalLink className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Pending Review</p>
                    <p className="text-2xl font-bold">
                      {reviewLinks.filter((link: any) => link.status === "pending").length}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Reviewed</p>
                    <p className="text-2xl font-bold">
                      {reviewLinks.filter((link: any) => link.status === "reviewed").length}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Links List */}
          <Card>
            <CardHeader>
              <CardTitle>
                {isProjectManager ? "Sent Links" : "Links to Review"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Content */}
              {error ? (
                <div className="text-center py-8">
                  <p className="text-red-500">Error loading review links: {error.message}</p>
                </div>
              ) : reviewLinks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No review links found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviewLinks.map((link: any) => (
                    <div
                      key={link.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{link.title}</h3>
                            <Badge
                              variant={link.status === "reviewed" ? "default" : "secondary"}
                              className={
                                link.status === "reviewed"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }
                            >
                              {link.status === "reviewed" ? "Reviewed" : "Pending"}
                            </Badge>
                          </div>
                          {link.description && (
                            <p className="text-sm text-gray-600 mb-3">{link.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>
                              {isProjectManager
                                ? `Assigned to: ${link.assigneeName || "Unknown"}`
                                : `Sent by: ${link.senderName || "Unknown"}`}
                            </span>
                            <span>•</span>
                            <span>{new Date(link.createdAt).toLocaleDateString()}</span>
                            {link.reviewedAt && (
                              <>
                                <span>•</span>
                                <span>Reviewed: {new Date(link.reviewedAt).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(link.linkUrl, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open Link
                          </Button>
                          {isTeamLead && link.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => markReviewedMutation.mutate(link.id)}
                              disabled={markReviewedMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Mark Reviewed
                            </Button>
                          )}
                          {isProjectManager && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Review Link?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this review link? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteLinkMutation.mutate(link.id)}
                                    disabled={deleteLinkMutation.isPending}
                                  >
                                    {deleteLinkMutation.isPending ? "Deleting..." : "Delete"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}