import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Clock, AlertCircle, CheckCircle, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const requestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  taskId: z.number().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

type RequestFormData = z.infer<typeof requestSchema>;

interface TechnicalSupportRequest {
  id: number;
  title: string;
  description: string;
  taskId?: number;
  requesterId: number;
  assignedToId?: number;
  status: "pending" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  requester: {
    id: number;
    name: string;
    email: string;
  };
  assignedTo?: {
    id: number;
    name: string;
    email: string;
  };
  task?: {
    id: number;
    title: string;
  };
}

interface Task {
  id: number;
  title: string;
  description: string;
  projectId: number;
  assigneeId: number;
  status: string;
}

interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
}

const priorityColors = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800"
};

const statusColors = {
  pending: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-slate-100 text-slate-800"
};

export default function TechnicalSupportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: requests = [], isLoading, error } = useQuery<TechnicalSupportRequest[]>({
    queryKey: ["/api/technical-support/requests"],
    queryFn: async () => {
      const res = await fetch("/api/technical-support/requests");
      if (!res.ok) throw new Error("Failed to fetch requests");
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

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  // Create a map of project IDs to project names
  const projectMap = projects.reduce((acc, project) => {
    acc[project.id] = project.name;
    return acc;
  }, {} as Record<number, string>);

  // Filter tasks assigned to current user
  const userTasks = tasks.filter(task => task.assigneeId === user?.id);

  const createRequestMutation = useMutation({
    mutationFn: async (data: RequestFormData) => {
      const res = await fetch("/api/technical-support/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technical-support/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({ title: "Success", description: "Technical support request created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create request",
        variant: "destructive"
      });
    },
  });

  const deleteRequest = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await fetch(`/api/technical-support/requests/${requestId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technical-support/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Success", description: "Request deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete request", variant: "destructive" });
    },
  });

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
    },
  });

  const onSubmit = (data: RequestFormData) => {
    createRequestMutation.mutate(data);
  };

  if (user?.specialization === 'technical_support') {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <AlertCircle className="h-16 w-16 mx-auto text-orange-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
          <p className="text-gray-600">
            Technical support staff should use the Technical Management page to handle requests.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error("Error in technical support page:", error);
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <AlertCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Error Loading Page</h2>
          <p className="text-gray-600 mb-4">
            Failed to load technical support requests. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8">Loading requests...</div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "in_progress":
        return <Wrench className="h-4 w-4" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Technical Support</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Technical Support Request</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Brief description of the issue" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Detailed description of the technical issue" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taskId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Task</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value === "" ? undefined : parseInt(value))} value={field.value?.toString() ?? ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a task (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {userTasks.map((task) => (
                            <SelectItem key={task.id} value={task.id.toString()}>
                              {task.title} ({projectMap[task.projectId] || `Project ${task.projectId}`})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRequestMutation.isPending}>
                    {createRequestMutation.isPending ? "Creating..." : "Create Request"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="h-16 w-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Support Requests</h2>
          <p className="text-gray-600 mb-4">You haven't created any technical support requests yet.</p>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Request
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(request.status)}
                      {request.title}
                    </CardTitle>
                    <div className="flex gap-2 mt-2">
                      <Badge className={statusColors[request.status]}>
                        {request.status.replace("_", " ")}
                      </Badge>
                      <Badge className={priorityColors[request.priority]}>
                        {request.priority}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    Created {formatDate(request.createdAt)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-3">{request.description}</p>
                {request.task && (
                  <div className="mb-3">
                    <span className="text-sm font-medium">Related Task: </span>
                    <span className="text-sm text-blue-600">{request.task.title}</span>
                  </div>
                )}
                {request.assignedTo && (
                  <div className="mb-3">
                    <span className="text-sm font-medium">Assigned to: </span>
                    <span className="text-sm">{request.assignedTo.name}</span>
                  </div>
                )}
                {request.resolution && (
                  <div className="bg-green-50 p-3 rounded-lg">
                    <span className="text-sm font-medium text-green-800">Resolution: </span>
                    <span className="text-sm text-green-700">{request.resolution}</span>
                  </div>
                )}
                {!request.assignedToId && (
                  <div className="mt-3 pt-3 border-t">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteRequest.mutate(request.id)}
                      disabled={deleteRequest.isPending}
                    >
                      {deleteRequest.isPending ? "Deleting..." : "Delete Request"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}