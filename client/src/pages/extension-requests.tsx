
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import type { Task, Project } from "@db/schema";

interface ExtensionRequest {
  id: number;
  taskId: number;
  requesterId: number;
  projectManagerId: number;
  reason: string;
  requestedDeadline?: string;
  status: "pending" | "approved" | "declined";
  decisionReason?: string;
  decidedBy?: number;
  decidedAt?: string;
  approvedDeadline?: string;
  approvedWorkingHours?: number;
  createdAt: string;
  updatedAt: string;
  requesterName: string;
  requesterEmail: string;
  taskTitle: string;
  taskDeadline?: string;
  taskWorkingHours?: number;
  projectName: string;
  projectId: number;
}

interface FormData {
  projectId: string;
  taskId: string;
  reason: string;
  requestedDeadline: string;
}

const defaultForm: FormData = {
  projectId: "",
  taskId: "",
  reason: "",
  requestedDeadline: "",
};

export default function ExtensionRequestsPage() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(defaultForm);

  const { data: requests = [], isLoading } = useQuery<ExtensionRequest[]>({
    queryKey: ["/api/deadline-extension-requests"],
    queryFn: async () => {
      const res = await fetch("/api/deadline-extension-requests");
      if (!res.ok) throw new Error("Failed to fetch extension requests");
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  // Filter tasks based on selected project and assigned to current user
  const filteredTasks = tasks.filter(task => {
    const isAssignedToUser = task.assigneeId === user?.id;
    const matchesProject = formData.projectId ? task.projectId === parseInt(formData.projectId) : true;
    return isAssignedToUser && matchesProject;
  });

  const createRequest = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch("/api/deadline-extension-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          taskId: parseInt(data.taskId),
          reason: data.reason,
          requestedDeadline: data.requestedDeadline || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create extension request');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadline-extension-requests"] });
      setIsDialogOpen(false);
      setFormData(defaultForm);
      toast({
        title: "Success",
        description: "Extension request submitted successfully",
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
    if (!formData.taskId || !formData.reason) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createRequest.mutate(formData);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'declined': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'declined': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (user?.role === "project_manager") {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
              <p className="text-gray-600 mt-2">This page is only available to staff members and interns.</p>
            </div>
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
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Extension Requests</h1>
              <p className="text-gray-600 mt-1">Request deadline extensions for your tasks</p>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Extension Requests</CardTitle>
                <CardDescription>View the status of your deadline extension requests</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-4">Loading...</div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No extension requests found. Create your first request above.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead>Current Deadline</TableHead>
                          <TableHead>Requested Deadline</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Decision Reason</TableHead>
                          <TableHead>Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requests.map((request) => (
                          <TableRow key={request.id}>
                            <TableCell className="font-medium">{request.projectName}</TableCell>
                            <TableCell>{request.taskTitle}</TableCell>
                            <TableCell>
                              {request.taskDeadline 
                                ? new Date(request.taskDeadline).toLocaleDateString()
                                : "No deadline"
                              }
                            </TableCell>
                            <TableCell>
                              {request.requestedDeadline 
                                ? new Date(request.requestedDeadline).toLocaleDateString()
                                : "Not specified"
                              }
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(request.status)}>
                                <div className="flex items-center gap-1">
                                  {getStatusIcon(request.status)}
                                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                                </div>
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {request.decisionReason || "Pending review"}
                            </TableCell>
                            <TableCell>
                              {new Date(request.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Request Deadline Extension</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="project">Project *</Label>
                    <Select
                      value={formData.projectId}
                      onValueChange={(value) => setFormData({ ...formData, projectId: value, taskId: "" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="task">Task *</Label>
                    <Select
                      value={formData.taskId}
                      onValueChange={(value) => setFormData({ ...formData, taskId: value })}
                      disabled={!formData.projectId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select task" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredTasks.map((task) => (
                          <SelectItem key={task.id} value={task.id.toString()}>
                            {task.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requestedDeadline">Requested New Deadline (Optional)</Label>
                  <Input
                    id="requestedDeadline"
                    type="datetime-local"
                    value={formData.requestedDeadline}
                    onChange={(e) => setFormData({ ...formData, requestedDeadline: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Extension *</Label>
                  <Textarea
                    id="reason"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Please explain why you need a deadline extension..."
                    rows={4}
                    className="resize-none"
                    required
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRequest.isPending}>
                    {createRequest.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
