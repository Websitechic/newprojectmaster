
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, AlertCircle, CheckCircle, Wrench, User, Calendar, UserCheck, Search, Filter, SortAsc, SortDesc, ChevronDown, ChevronRight, Eye } from "lucide-react";
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
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200", 
  high: "bg-orange-100 text-orange-800 border-orange-200",
  urgent: "bg-red-100 text-red-800 border-red-200"
};

const statusColors = {
  pending: "bg-gray-100 text-gray-800 border-gray-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-slate-100 text-slate-800 border-slate-200"
};

export default function TechnicalManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<TechnicalSupportRequest | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  
  // Filters and search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Check if user is project manager (read-only mode)
  const isProjectManager = user?.role === "project_manager";
  const isTechnicalSupport = user?.specialization === "technical_support";
  const isProductOwner = user?.role === "product_owner";

  const { data: requests = [], isLoading } = useQuery<TechnicalSupportRequest[]>({
    queryKey: ["/api/technical-support/requests"],
    queryFn: async () => {
      const res = await fetch("/api/technical-support/requests");
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
  });

  // Filter and sort requests
  const filteredAndSortedRequests = useMemo(() => {
    let filtered = requests.filter(request => {
      const matchesSearch = request.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           request.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           request.requester.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || request.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || request.priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });

    // Sort requests
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy as keyof TechnicalSupportRequest];
      let bValue: any = b[sortBy as keyof TechnicalSupportRequest];
      
      if (sortBy === "requester") {
        aValue = a.requester.name;
        bValue = b.requester.name;
      } else if (sortBy === "assignedTo") {
        aValue = a.assignedTo?.name || "";
        bValue = b.assignedTo?.name || "";
      }
      
      if (typeof aValue === "string") {
        return sortOrder === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      
      if (aValue instanceof Date || typeof aValue === "string") {
        const dateA = new Date(aValue).getTime();
        const dateB = new Date(bValue).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
      
      return 0;
    });

    return filtered;
  }, [requests, searchTerm, statusFilter, priorityFilter, sortBy, sortOrder]);

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

  const handleViewRequest = (request: TechnicalSupportRequest) => {
    setSelectedRequest(request);
    setIsViewDialogOpen(true);
  };

  const toggleRowExpansion = (requestId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(requestId)) {
      newExpanded.delete(requestId);
    } else {
      newExpanded.add(requestId);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-gray-500" />;
      case "in_progress":
        return <Wrench className="h-4 w-4 text-blue-500" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "closed":
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Product owners, project managers, and technical support can access
  if (!user || (!isProductOwner && !isProjectManager && !isTechnicalSupport)) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === 'pending' || !r.assignedToId).length;
  const myRequestsCount = requests.filter(r => r.assignedToId === user?.id).length;
  const urgentCount = requests.filter(r => r.priority === 'urgent').length;
  const highCount = requests.filter(r => r.priority === 'high').length;

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Technical Management</h1>
          {isProjectManager && (
            <p className="text-gray-600 text-sm">View technical support requests (Read-only)</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            {urgentCount} Urgent
          </Badge>
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            {highCount} High Priority
          </Badge>
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            {pendingCount} Pending
          </Badge>
          {!isProjectManager && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {myRequestsCount} Assigned to Me
            </Badge>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search requests, descriptions, or requesters..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredAndSortedRequests.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="h-16 w-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {requests.length === 0 ? "No Support Requests" : "No Matching Requests"}
          </h2>
          <p className="text-gray-600">
            {requests.length === 0 
              ? "No technical support requests have been submitted yet."
              : "Try adjusting your search or filter criteria."}
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <span>Requests ({filteredAndSortedRequests.length})</span>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Filter className="h-4 w-4" />
                Filtered & Sorted
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="w-8"></th>
                      <th className="text-left p-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100" 
                          onClick={() => handleSort('title')}>
                        <div className="flex items-center gap-1">
                          Title
                          {sortBy === 'title' && (sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />)}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100" 
                          onClick={() => handleSort('status')}>
                        <div className="flex items-center gap-1">
                          Status
                          {sortBy === 'status' && (sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />)}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100" 
                          onClick={() => handleSort('priority')}>
                        <div className="flex items-center gap-1">
                          Priority
                          {sortBy === 'priority' && (sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />)}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100" 
                          onClick={() => handleSort('requester')}>
                        <div className="flex items-center gap-1">
                          Requester
                          {sortBy === 'requester' && (sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />)}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100" 
                          onClick={() => handleSort('assignedTo')}>
                        <div className="flex items-center gap-1">
                          Assigned To
                          {sortBy === 'assignedTo' && (sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />)}
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100" 
                          onClick={() => handleSort('createdAt')}>
                        <div className="flex items-center gap-1">
                          Created
                          {sortBy === 'createdAt' && (sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />)}
                        </div>
                      </th>
                      <th className="text-center p-3 font-medium text-gray-700 w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedRequests.map((request) => (
                      <React.Fragment key={request.id}>
                        <tr className="border-b hover:bg-gray-50 transition-colors">
                          <td className="p-3">
                            <button
                              onClick={() => toggleRowExpansion(request.id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {expandedRows.has(request.id) ? 
                                <ChevronDown className="h-4 w-4" /> : 
                                <ChevronRight className="h-4 w-4" />
                              }
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(request.status)}
                              <span className="font-medium text-gray-900 truncate max-w-[200px]" title={request.title}>
                                {request.title}
                              </span>
                            </div>
                            {request.task && (
                              <div className="text-xs text-blue-600 mt-1">Task: {request.task.title}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge className={statusColors[request.status]}>
                              {request.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge className={priorityColors[request.priority]}>
                              {request.priority}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 text-gray-400" />
                              <span className="text-sm text-gray-700 truncate max-w-[120px]" title={request.requester.name}>
                                {request.requester.name}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {request.assignedTo ? (
                              <div className="flex items-center gap-2">
                                <UserCheck className="h-3 w-3 text-green-500" />
                                <span className="text-sm text-green-700 truncate max-w-[120px]" title={request.assignedTo.name}>
                                  {request.assignedTo.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">Unassigned</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(request.createdAt)}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewRequest(request)}
                                className="h-8 w-8 p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {!isProjectManager && (
                                <>
                                  {!request.assignedToId ? (
                                    <Button
                                      size="sm"
                                      onClick={() => assignRequestMutation.mutate(request.id)}
                                      disabled={assignRequestMutation.isPending}
                                      className="h-8 px-2 text-xs"
                                    >
                                      Assign
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleUpdateRequest(request)}
                                      className="h-8 px-2 text-xs"
                                    >
                                      Update
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has(request.id) && (
                          <tr className="bg-gray-50">
                            <td></td>
                            <td colSpan={7} className="p-4">
                              <div className="space-y-2">
                                <div>
                                  <span className="font-medium text-gray-700">Description:</span>
                                  <p className="text-gray-600 mt-1">{request.description}</p>
                                </div>
                                {request.resolution && (
                                  <div className="bg-green-50 p-3 rounded border-l-4 border-green-400">
                                    <span className="font-medium text-green-800">Resolution:</span>
                                    <p className="text-green-700 mt-1">{request.resolution}</p>
                                  </div>
                                )}
                                <div className="text-xs text-gray-500">
                                  ID: {request.id} | Updated: {formatDate(request.updatedAt)}
                                  {request.resolvedAt && ` | Resolved: ${formatDate(request.resolvedAt)}`}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-2 p-4">
              {filteredAndSortedRequests.map((request) => (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {getStatusIcon(request.status)}
                        <h3 className="font-semibold text-lg truncate">{request.title}</h3>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewRequest(request)}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!isProjectManager && (
                          <>
                            {!request.assignedToId ? (
                              <Button
                                size="sm"
                                onClick={() => assignRequestMutation.mutate(request.id)}
                                disabled={assignRequestMutation.isPending}
                                className="h-8 px-2 text-xs"
                              >
                                Assign
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateRequest(request)}
                                className="h-8 px-2 text-xs"
                              >
                                Update
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mb-3">
                      <Badge className={statusColors[request.status]}>
                        {request.status.replace("_", " ")}
                      </Badge>
                      <Badge className={priorityColors[request.priority]}>
                        {request.priority}
                      </Badge>
                    </div>

                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{request.description}</p>
                    
                    <div className="space-y-2 text-xs text-gray-500">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{request.requester.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(request.createdAt)}</span>
                        </div>
                      </div>
                      
                      {request.assignedTo ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3 text-green-500" />
                          <span className="text-green-700">Assigned to {request.assignedTo.name}</span>
                        </div>
                      ) : (
                        <div className="text-gray-500">Unassigned</div>
                      )}
                      
                      {request.task && (
                        <div className="text-blue-600">Task: {request.task.title}</div>
                      )}
                    </div>

                    {request.resolution && (
                      <div className="mt-3 bg-green-50 p-2 rounded border-l-4 border-green-400">
                        <span className="font-medium text-green-800 text-xs">Resolution:</span>
                        <p className="text-green-700 text-xs mt-1">{request.resolution}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Request Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusIcon(selectedRequest.status)}
                <h3 className="text-lg font-semibold">{selectedRequest.title}</h3>
              </div>
              
              <div className="flex gap-2">
                <Badge className={statusColors[selectedRequest.status]}>
                  {selectedRequest.status.replace("_", " ")}
                </Badge>
                <Badge className={priorityColors[selectedRequest.priority]}>
                  {selectedRequest.priority}
                </Badge>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                <p className="text-gray-700 bg-gray-50 p-3 rounded">{selectedRequest.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Requester:</span>
                  <p className="text-gray-600">{selectedRequest.requester.name}</p>
                  <p className="text-gray-500 text-xs">{selectedRequest.requester.email}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Assigned To:</span>
                  <p className="text-gray-600">
                    {selectedRequest.assignedTo ? selectedRequest.assignedTo.name : "Unassigned"}
                  </p>
                  {selectedRequest.assignedTo && (
                    <p className="text-gray-500 text-xs">{selectedRequest.assignedTo.email}</p>
                  )}
                </div>
              </div>
              
              {selectedRequest.task && (
                <div>
                  <span className="font-medium text-gray-700">Related Task:</span>
                  <p className="text-blue-600">{selectedRequest.task.title}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                <div>
                  <span className="font-medium">Created:</span>
                  <p>{formatDate(selectedRequest.createdAt)}</p>
                </div>
                <div>
                  <span className="font-medium">Updated:</span>
                  <p>{formatDate(selectedRequest.updatedAt)}</p>
                </div>
              </div>
              
              {selectedRequest.resolution && (
                <div>
                  <h4 className="font-medium text-green-800 mb-2">Resolution</h4>
                  <div className="bg-green-50 p-3 rounded border-l-4 border-green-400">
                    <p className="text-green-700">{selectedRequest.resolution}</p>
                    {selectedRequest.resolvedAt && (
                      <p className="text-xs text-green-600 mt-2">
                        Resolved on {formatDate(selectedRequest.resolvedAt)}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="text-xs text-gray-400">
                Request ID: {selectedRequest.id}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Update Request Dialog */}
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
