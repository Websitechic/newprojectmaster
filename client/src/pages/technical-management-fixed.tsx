import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  User,
  Calendar,
  UserCheck,
  Edit,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const updateSchema = z.object({
  status: z.enum(["pending", "in_progress", "resolved", "closed"]),
  resolution: z.string().optional(),
});

type UpdateFormData = z.infer<typeof updateSchema>;

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
    projectId: number;
  };
  project?: {
    id: number;
    name: string;
  };
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

export default function TechnicalManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<TechnicalSupportRequest | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);

  const { data: requests = [], isLoading } = useQuery<TechnicalSupportRequest[]>({
    queryKey: ["/api/technical-support/requests"],
    queryFn: async () => {
      const res = await fetch("/api/technical-support/requests");
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
  });

  const form = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: "pending",
      resolution: "",
    },
  });

  const assignRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await fetch(`/api/technical-support/requests/${requestId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to assign request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technical-support/requests"] });
      toast({ title: "Success", description: "Request assigned to you successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign request", variant: "destructive" });
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ requestId, data }: { requestId: number; data: UpdateFormData }) => {
      const res = await fetch(`/api/technical-support/requests/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technical-support/requests"] });
      setIsUpdateDialogOpen(false);
      setSelectedRequest(null);
      toast({ title: "Success", description: "Request updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update request", variant: "destructive" });
    },
  });

  const onSubmit = (data: UpdateFormData) => {
    if (selectedRequest) {
      updateRequestMutation.mutate({ requestId: selectedRequest.id, data });
    }
  };

  const handleUpdateRequest = (request: TechnicalSupportRequest) => {
    setSelectedRequest(request);
    form.reset({
      status: request.status,
      resolution: request.resolution || "",
    });
    setIsUpdateDialogOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-5 w-5 text-gray-500" />;
      case "in_progress":
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
      case "resolved":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "closed":
        return <XCircle className="h-5 w-5 text-slate-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <div className="flex-1 overflow-auto container mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Technical Management</h1>
            <p className="text-gray-600 mt-2">
              Manage and respond to technical support requests
            </p>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-gray-600 mb-2">No Requests Found</h2>
              <p className="text-gray-500">There are no technical support requests at the moment.</p>
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Task/Project</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(request.status)}
                            <span className="font-medium">{request.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {request.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[request.status]}>
                          {request.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityColors[request.priority]}>
                          {request.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{request.requester.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-green-700">{request.assignedTo.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {request.task ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            <div className="text-sm">
                              <div className="text-blue-600">{request.task.title}</div>
                              {request.project && (
                                <div className="text-muted-foreground">{request.project.name}</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No task linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(request.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {request.assignedToId ? (
                            <Button
                              size="sm"
                              disabled
                              className="bg-gray-200 text-black cursor-not-allowed"
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              {request.assignedTo?.id === user?.id ? "Assigned to You" : "Already Assigned"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => assignRequestMutation.mutate(request.id)}
                              disabled={assignRequestMutation.isPending}
                            >
                              <UserPlus className="h-4 w-4 mr-1" />
                              {assignRequestMutation.isPending ? "Assigning..." : "Assign to Me"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateRequest(request)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Update
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Request Status</DialogTitle>
                <DialogDescription>
                  Update the status and resolution of the technical support request.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="resolution"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resolution Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter resolution details..."
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsUpdateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateRequestMutation.isPending}>
                      Update Request
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}