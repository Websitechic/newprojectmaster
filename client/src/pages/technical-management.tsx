import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, AlertCircle, CheckCircle, Wrench, User, Calendar, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

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

  // Check if user is project manager (read-only mode)
  const isProjectManager = user?.role === "project_manager";
  const isTechnicalSupport = user?.specialization === "technical_support";

  const { data: requests = [], isLoading } = useQuery<TechnicalSupportRequest[]>({
    queryKey: ["/api/technical-support/requests"],
    queryFn: async () => {
      const res = await fetch("/api/technical-support/requests");
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
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

  const form = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: "in_progress",
      resolution: "",
    },
  });

  const onSubmit = (data: UpdateFormData) => {
    if (!selectedRequest) return;
    updateRequestMutation.mutate({ requestId: selectedRequest.id, data });
  };

  const handleUpdateRequest = (request: TechnicalSupportRequest) => {
    setSelectedRequest(request);
    form.reset({
      status: request.status,
      resolution: request.resolution || "",
    });
    setIsUpdateDialogOpen(true);
  };

  // Product owners can view all requests (read-only)
  if (!user || (user.role !== "project_manager" && user.specialization !== "technical_support" && user.role !== "product_owner")) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
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

  const pendingRequests = requests.filter(r => r.status === 'pending' || !r.assignedToId);
  const myRequests = requests.filter(r => r.assignedToId === user?.id);
  const allRequests = requests; // Product owners see all requests

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Technical Management</h1>
          {isProjectManager && (
            <p className="text-gray-600 mt-1">View technical support requests (Read-only)</p>
          )}
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">
            {pendingRequests.length} Pending
          </Badge>
          {!isProjectManager && (
            <Badge variant="outline">
              {myRequests.length} Assigned to Me
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="h-16 w-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Support Requests</h2>
          <p className="text-gray-600">No technical support requests have been submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* All Requests Section - For Product Owners */}
          {user?.role === "product_owner" && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                All Technical Support Requests ({requests.length})
              </h2>
              <div className="border rounded-lg bg-white">
                <div className="grid grid-cols-12 gap-4 p-4 border-b bg-gray-50 font-medium text-sm">
                  <div className="col-span-3">Title</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Priority</div>
                  <div className="col-span-2">Requester</div>
                  <div className="col-span-2">Assigned To</div>
                  <div className="col-span-1">Date</div>
                </div>
                {requests.map((request, index) => (
                  <div key={request.id} className={`grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 transition-colors ${index !== requests.length - 1 ? 'border-b' : ''}`}>
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(request.status)}
                        <div>
                          <div className="font-medium">{request.title}</div>
                          <div className="text-sm text-gray-600 truncate">{request.description}</div>
                          {request.task && (
                            <div className="flex items-center gap-1 mt-1">
                              <Calendar className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-blue-600">{request.task.title}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Badge className={statusColors[request.status]}>
                        {request.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge className={priorityColors[request.priority]}>
                        {request.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{request.requester.name}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      {request.assignedTo ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-700">{request.assignedTo.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Unassigned</span>
                      )}
                    </div>
                    <div className="col-span-1">
                      <div className="text-sm text-gray-500">
                        {formatDate(request.createdAt)}
                      </div>
                    </div>
                    {request.resolution && (
                      <div className="col-span-12 mt-2 bg-green-50 p-3 rounded-lg">
                        <span className="text-sm font-medium text-green-800">Resolution: </span>
                        <span className="text-sm text-green-700">{request.resolution}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Requests Section - For Technical Support Staff */}
          {user?.role !== "product_owner" && pendingRequests.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Requests ({pendingRequests.length})
              </h2>
              <div className="border rounded-lg bg-white">
                <div className="grid grid-cols-12 gap-4 p-4 border-b bg-gray-50 font-medium text-sm">
                  <div className="col-span-3">Title</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Priority</div>
                  <div className="col-span-2">Requester</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-1">Actions</div>
                </div>
                {pendingRequests.map((request, index) => (
                  <div key={request.id} className={`grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 transition-colors ${index !== pendingRequests.length - 1 ? 'border-b' : ''}`}>
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(request.status)}
                        <div>
                          <div className="font-medium">{request.title}</div>
                          <div className="text-sm text-gray-600 truncate">{request.description}</div>
                          {request.task && (
                            <div className="flex items-center gap-1 mt-1">
                              <Calendar className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-blue-600">{request.task.title}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Badge className={statusColors[request.status]}>
                        {request.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge className={priorityColors[request.priority]}>
                        {request.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{request.requester.name}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500">
                        {formatDate(request.createdAt)}
                      </div>
                    </div>
                    <div className="col-span-1">
                      {!isProjectManager && (
                        <div className="flex gap-1">
                          {!request.assignedToId ? (
                            <Button
                              size="sm"
                              onClick={() => assignRequestMutation.mutate(request.id)}
                              disabled={assignRequestMutation.isPending}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Assign
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled
                              className="bg-gray-300 text-black cursor-not-allowed"
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Assigned
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateRequest(request)}
                          >
                            Update
                          </Button>
                        </div>
                      )}
                      {isProjectManager && request.assignedToId && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Assigned to:</span> {request.assignedTo?.name || 'Unknown'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Assigned Requests Section - Only for Technical Support Staff */}
          {user?.role !== "product_owner" && !isProjectManager && myRequests.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                My Assigned Requests ({myRequests.length})
              </h2>
              <div className="border rounded-lg bg-white">
                <div className="grid grid-cols-12 gap-4 p-4 border-b bg-gray-50 font-medium text-sm">
                  <div className="col-span-3">Title</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Priority</div>
                  <div className="col-span-2">Requester</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-1">Actions</div>
                </div>
                {myRequests.map((request, index) => (
                  <div key={request.id} className={`grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 transition-colors ${index !== myRequests.length - 1 ? 'border-b' : ''}`}>
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(request.status)}
                        <div>
                          <div className="font-medium">{request.title}</div>
                          <div className="text-sm text-gray-600 truncate">{request.description}</div>
                          {request.task && (
                            <div className="flex items-center gap-1 mt-1">
                              <Calendar className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-blue-600">{request.task.title}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Badge className={statusColors[request.status]}>
                        {request.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge className={priorityColors[request.priority]}>
                        {request.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{request.requester.name}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500">
                        {formatDate(request.createdAt)}
                      </div>
                    </div>
                    <div className="col-span-1">
                      {!isProjectManager && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateRequest(request)}
                        >
                          Update
                        </Button>
                      )}
                    </div>
                    {request.resolution && (
                      <div className="col-span-12 mt-2 bg-green-50 p-3 rounded-lg">
                        <span className="text-sm font-medium text-green-800">Resolution: </span>
                        <span className="text-sm text-green-700">{request.resolution}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Request Status</DialogTitle>
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
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="resolution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resolution (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe how the issue was resolved..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsUpdateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateRequestMutation.isPending}>
                  {updateRequestMutation.isPending ? "Updating..." : "Update Request"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}