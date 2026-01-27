import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, CheckCircle, XCircle, User, Calendar, AlertCircle, Eye } from "lucide-react";
import { useLocation } from "wouter";

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

interface DecisionFormData {
  decisionReason: string;
  approvedDeadline: string;
  approvedWorkingHours: string;
}

const defaultDecisionForm: DecisionFormData = {
  decisionReason: "",
  approvedDeadline: "",
  approvedWorkingHours: "",
};

export default function DeadlineExtensionRequestsPage() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<ExtensionRequest | null>(null);
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approved" | "declined">("approved");
  const [decisionForm, setDecisionForm] = useState<DecisionFormData>(defaultDecisionForm);

  const { data: requests = [], isLoading } = useQuery<ExtensionRequest[]>({
    queryKey: ["/api/deadline-extension-requests"],
    queryFn: async () => {
      const res = await fetch("/api/deadline-extension-requests");
      if (!res.ok) throw new Error("Failed to fetch extension requests");
      return res.json();
    },
  });

  const processRequest = useMutation({
    mutationFn: async (data: { requestId: number; status: "approved" | "declined"; decisionReason: string; approvedDeadline?: string; approvedWorkingHours?: string }) => {
      const response = await fetch(`/api/deadline-extension-requests/${data.requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadline-extension-requests"] });
      setIsDecisionDialogOpen(false);
      setSelectedRequest(null);
      setDecisionForm(defaultDecisionForm);
      toast({
        title: "Success",
        description: "Request processed successfully",
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

  const handleDecision = (request: ExtensionRequest, decision: "approved" | "declined") => {
    setSelectedRequest(request);
    setDecisionType(decision);
    setDecisionForm({
      ...defaultDecisionForm,
      approvedDeadline: request.requestedDeadline ? new Date(request.requestedDeadline).toISOString().slice(0, 16) : "",
      approvedWorkingHours: request.taskWorkingHours?.toString() || "",
    });
    setIsDecisionDialogOpen(true);
  };

  const handleSubmitDecision = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRequest || !decisionForm.decisionReason) {
      toast({
        title: "Error",
        description: "Decision reason is required",
        variant: "destructive",
      });
      return;
    }

    const requestData: any = {
      requestId: selectedRequest.id,
      status: decisionType,
      decisionReason: decisionForm.decisionReason,
    };

    if (decisionType === "approved") {
      if (decisionForm.approvedDeadline) {
        // Parse the local datetime-local string (YYYY-MM-DDTHH:mm) and ensure it's treated as local time
        const localDate = new Date(decisionForm.approvedDeadline);
        requestData.approvedDeadline = localDate.toISOString();
      }
      if (decisionForm.approvedWorkingHours) {
        requestData.approvedWorkingHours = decisionForm.approvedWorkingHours;
      }
    }

    processRequest.mutate(requestData);
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

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  // Check if user has proper access (project managers, operations managers, team leads, customer support officers, and replit developers)
  const hasAccess = user?.role === "project_manager" || 
                   user?.role === "operations_manager" || 
                   user?.role === "team_lead" ||
                   user?.role === "customer_support_officer" ||
                   user?.specialization === "operations_manager" ||
                   user?.specialization === "replit_development" ||
                   user?.specialization === "Replit Development";

  if (!hasAccess) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
              <p className="text-gray-600 mt-2">This page is only available to project managers, operations managers, team leads, customer support officers, and Replit developers.</p>
              <p className="text-sm text-gray-500 mt-1">Your role: {user?.role}, Specialization: {user?.specialization}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full max-w-full overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 max-w-full">
        <Header />
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 w-full max-w-full">
          <div className="flex flex-col gap-3 mb-6 w-full max-w-full overflow-hidden">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Deadline Extension Requests</h1>
              <p className="text-gray-600 mt-1 text-xs sm:text-sm md:text-base truncate">Review and manage deadline extension requests from your team</p>
            </div>
            <div className="flex gap-2 w-full">
              <Badge variant="outline" className="flex items-center gap-1 flex-shrink-0">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{pendingRequests.length} Pending</span>
              </Badge>
            </div>
          </div>

          <div className="grid gap-6">
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    Pending Requests
                  </CardTitle>
                  <CardDescription>Requests awaiting your decision</CardDescription>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <div className="w-full overflow-x-auto" style={{ 
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(59, 130, 246, 0.8) rgba(0, 0, 0, 0.1)'
                  }}>
                    <Table className="min-w-[900px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff Member</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead>New Deadline</TableHead>
                          <TableHead>Requested<br />Deadline</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead className="text-right min-w-[200px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequests.map((request) => (
                          <TableRow key={request.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">{request.requesterName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{request.projectName}</TableCell>
                            <TableCell>{request.taskTitle}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {request.taskDeadline 
                                  ? new Date(request.taskDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : "No deadline"
                                }
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {request.requestedDeadline 
                                  ? new Date(request.requestedDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : "Not specified"
                                }
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                            <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 border-green-200 hover:bg-green-50 flex-shrink-0"
                                  onClick={() => handleDecision(request, "approved")}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50 flex-shrink-0"
                                  onClick={() => handleDecision(request, "declined")}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Decline
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Requests */}
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>All Extension Requests</CardTitle>
                <CardDescription>Complete history of deadline extension requests</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {isLoading ? (
                  <div className="text-center py-4">Loading...</div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No extension requests found.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto" style={{ 
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(59, 130, 246, 0.8) rgba(0, 0, 0, 0.1)'
                  }}>
                    <Table className="min-w-[1200px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff Member</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead>New Deadline</TableHead>
                          <TableHead>Requested<br />Deadline</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Decision Reason</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processedRequests.map((request) => (
                          <TableRow key={request.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">{request.requesterName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{request.projectName}</TableCell>
                            <TableCell>{request.taskTitle}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {request.taskDeadline 
                                  ? new Date(request.taskDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : "No deadline"
                                }
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {request.requestedDeadline 
                                  ? new Date(request.requestedDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : "Not specified"
                                }
                              </div>
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
                            <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Extension Request Details</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label className="font-medium">Staff Member</Label>
                                      <p className="mt-1">{request.requesterName}</p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Project</Label>
                                      <p className="mt-1">{request.projectName}</p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Task</Label>
                                      <p className="mt-1">{request.taskTitle}</p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Current Deadline</Label>
                                      <p className="mt-1">
                                        {request.taskDeadline 
                                          ? new Date(request.taskDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                          : "No deadline"}
                                      </p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Requested Deadline</Label>
                                      <p className="mt-1">
                                        {request.requestedDeadline 
                                          ? new Date(request.requestedDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                          : "Not specified"}
                                      </p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Status</Label>
                                      <div className="mt-1">
                                        <Badge className={getStatusColor(request.status)}>
                                          <div className="flex items-center gap-1">
                                            {getStatusIcon(request.status)}
                                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                                          </div>
                                        </Badge>
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Reason for Extension</Label>
                                      <p className="mt-1 text-sm">{request.reason}</p>
                                    </div>
                                    {request.decisionReason && (
                                      <div>
                                        <Label className="font-medium">Decision Reason</Label>
                                        <p className="mt-1 text-sm">{request.decisionReason}</p>
                                      </div>
                                    )}
                                    {request.approvedDeadline && (
                                      <div>
                                        <Label className="font-medium">Approved Deadline</Label>
                                        <p className="mt-1">
                                          {new Date(request.approvedDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>
                                    )}
                                    {request.approvedWorkingHours && (
                                      <div>
                                        <Label className="font-medium">Approved Working Hours</Label>
                                        <p className="mt-1">{request.approvedWorkingHours} hours</p>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
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

          <Dialog open={isDecisionDialogOpen} onOpenChange={setIsDecisionDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {decisionType === "approved" ? "Approve" : "Decline"} Extension Request
                </DialogTitle>
              </DialogHeader>

              {selectedRequest && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-2">Request Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Staff:</span>
                      <span className="ml-2 font-medium">{selectedRequest.requesterName}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Project:</span>
                      <span className="ml-2 font-medium">{selectedRequest.projectName}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Task:</span>
                      <span className="ml-2 font-medium">{selectedRequest.taskTitle}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Current Deadline:</span>
                      <span className="ml-2 font-medium">
                        {selectedRequest.taskDeadline 
                          ? new Date(selectedRequest.taskDeadline).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : "No deadline"
                        }
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-gray-600">Reason:</span>
                    <p className="ml-2 text-sm">{selectedRequest.reason}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitDecision} className="space-y-6">
                {decisionType === "approved" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="approvedDeadline">New Deadline</Label>
                      <Input
                        id="approvedDeadline"
                        type="datetime-local"
                        value={decisionForm.approvedDeadline}
                        onChange={(e) => setDecisionForm({ ...decisionForm, approvedDeadline: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="approvedWorkingHours">Working Hours</Label>
                      <Input
                        id="approvedWorkingHours"
                        type="number"
                        min="1"
                        step="1"
                        value={decisionForm.approvedWorkingHours}
                        onChange={(e) => setDecisionForm({ ...decisionForm, approvedWorkingHours: e.target.value })}
                        placeholder="Enter new working hours"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="decisionReason">Decision Reason *</Label>
                  <Textarea
                    id="decisionReason"
                    value={decisionForm.decisionReason}
                    onChange={(e) => setDecisionForm({ ...decisionForm, decisionReason: e.target.value })}
                    placeholder={`Please explain why you ${decisionType === "approved" ? "approved" : "declined"} this request...`}
                    rows={4}
                    className="resize-none"
                    required
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDecisionDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={processRequest.isPending}
                    className={decisionType === "approved" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                  >
                    {processRequest.isPending ? "Processing..." : (decisionType === "approved" ? "Approve Request" : "Decline Request")}
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