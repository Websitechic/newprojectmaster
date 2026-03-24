import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, MessageSquare, Calendar, User, Mail, Building2, FileText, Image } from "lucide-react";
import { format } from "date-fns";

interface StaffComplaint {
  id: number;
  name: string;
  email: string;
  department: string;
  detailedExplanation: string;
  screenshotUrl?: string;
  status: 'pending' | 'reviewed' | 'resolved';
  reviewComments?: string;
  createdAt: string;
  reviewedAt?: string;
}

export default function StaffComplaints() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedComplaint, setSelectedComplaint] = useState<StaffComplaint | null>(null);
  const [reviewForm, setReviewForm] = useState({
    status: '',
    reviewComments: '',
  });
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

  // Check if user is operations manager or team lead
  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";
  const isTeamLead = user?.role === "team_lead";
  const hasAccess = isOperationsManager || isTeamLead;

  // Fetch staff complaints
  const { data: complaints = [], isLoading } = useQuery<StaffComplaint[]>({
    queryKey: ["/api/staff-complaints"],
    queryFn: async () => {
      const response = await fetch("/api/staff-complaints");
      if (!response.ok) {
        throw new Error("Failed to fetch staff complaints");
      }
      return response.json();
    },
    enabled: hasAccess,
  });

  // Update complaint status mutation
  const updateComplaintMutation = useMutation({
    mutationFn: async ({ id, status, reviewComments }: { id: number; status: string; reviewComments: string }) => {
      const response = await fetch(`/api/staff-complaints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewComments }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update complaint');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-complaints"] });
      setIsReviewDialogOpen(false);
      setReviewForm({ status: '', reviewComments: '' });
      toast({
        title: "Success",
        description: "Complaint status updated successfully",
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

  const handleReviewComplaint = (complaint: StaffComplaint) => {
    setSelectedComplaint(complaint);
    setReviewForm({
      status: complaint.status,
      reviewComments: complaint.reviewComments || '',
    });
    setIsReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedComplaint || !reviewForm.status) return;

    updateComplaintMutation.mutate({
      id: selectedComplaint.id,
      status: reviewForm.status,
      reviewComments: reviewForm.reviewComments,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "destructive" as const, label: "Pending" },
      reviewed: { variant: "default" as const, label: "Reviewed" },
      resolved: { variant: "secondary" as const, label: "Resolved" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDepartmentLabel = (department: string) => {
    const departments: Record<string, string> = {
      automation: "Automation Team",
      copywriting: "Copywriting Team",
      design: "Design Team",
      media_buying: "Media Buying Team",
      development: "Development Team",
      community_manager: "Community Management Team",
      technical_support: "Technical Support Team",
      project_management: "Project Management Team",
      product_ownership: "Product Ownership Team",
      other: "Other",
    };
    return departments[department] || department;
  };

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full max-w-none">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden w-full max-w-none">
          <Header />
          <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 w-full max-w-none">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <MessageSquare className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Access Denied</h3>
                <p className="text-gray-500 text-center">
                  Only operations managers and team leads can access staff complaints.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const pendingComplaints = complaints.filter(c => c.status === 'pending');
  const reviewedComplaints = complaints.filter(c => c.status === 'reviewed');
  const resolvedComplaints = complaints.filter(c => c.status === 'resolved');

  return (
    <div className="flex h-screen w-full max-w-none overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden w-full max-w-none min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 w-full max-w-full min-w-0">
          <div className="mb-4 sm:mb-6 lg:mb-8 w-full max-w-full min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2 break-words">Staff Complaints Management</h1>
            <p className="text-sm sm:text-base text-gray-600 break-words">
              Review and manage complaints submitted by staff members.
            </p>
          </div>

      <Tabs defaultValue="pending" className="space-y-4 sm:space-y-6 w-full max-w-full">
        <TabsList className="grid w-full grid-cols-3 gap-1">
          <TabsTrigger value="pending" className="relative text-xs sm:text-sm px-2 sm:px-4">
            <span className="truncate">Pending</span>
            {pendingComplaints.length > 0 && (
              <Badge variant="destructive" className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5 p-0 text-[10px] sm:text-xs">
                {pendingComplaints.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed" className="text-xs sm:text-sm px-2 sm:px-4">
            <span className="truncate">Reviewed ({reviewedComplaints.length})</span>
          </TabsTrigger>
          <TabsTrigger value="resolved" className="text-xs sm:text-sm px-2 sm:px-4">
            <span className="truncate">Resolved ({resolvedComplaints.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-6">
          {isLoading ? (
            <Card>
              <CardContent className="py-10">
                <p className="text-center text-gray-500">Loading complaints...</p>
              </CardContent>
            </Card>
          ) : pendingComplaints.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <MessageSquare className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No pending complaints</h3>
                <p className="text-gray-500 text-center">
                  All staff complaints have been reviewed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 overflow-x-auto pb-4">
              {pendingComplaints.map((complaint) => (
                <ComplaintCard
                  key={complaint.id}
                  complaint={complaint}
                  onReview={handleReviewComplaint}
                  getDepartmentLabel={getDepartmentLabel}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviewed" className="space-y-6">
          {reviewedComplaints.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <MessageSquare className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No reviewed complaints</h3>
                <p className="text-gray-500 text-center">
                  Complaints that have been reviewed will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 overflow-x-auto pb-4">
              {reviewedComplaints.map((complaint) => (
                <ComplaintCard
                  key={complaint.id}
                  complaint={complaint}
                  onReview={handleReviewComplaint}
                  getDepartmentLabel={getDepartmentLabel}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-6">
          {resolvedComplaints.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <MessageSquare className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No resolved complaints</h3>
                <p className="text-gray-500 text-center">
                  Complaints that have been resolved will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 overflow-x-auto pb-4">
              {resolvedComplaints.map((complaint) => (
                <ComplaintCard
                  key={complaint.id}
                  complaint={complaint}
                  onReview={handleReviewComplaint}
                  getDepartmentLabel={getDepartmentLabel}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Staff Complaint</DialogTitle>
            <DialogDescription>
              Update the status and add review comments for this complaint.
            </DialogDescription>
          </DialogHeader>

          {selectedComplaint && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Complaint Details</h4>
                <div className="space-y-2 text-sm">
                  <p><strong>From:</strong> {selectedComplaint.name} ({selectedComplaint.email})</p>
                  <p><strong>Department:</strong> {getDepartmentLabel(selectedComplaint.department)}</p>
                  <p><strong>Submitted:</strong> {format(new Date(selectedComplaint.createdAt), 'PPP')}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm">{selectedComplaint.detailedExplanation}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label htmlFor="status">Status</Label>
                <Select value={reviewForm.status} onValueChange={(value) => setReviewForm(prev => ({ ...prev, status: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label htmlFor="reviewComments">Review Comments</Label>
                <Textarea
                  id="reviewComments"
                  placeholder="Add your review comments here..."
                  value={reviewForm.reviewComments}
                  onChange={(e) => setReviewForm(prev => ({ ...prev, reviewComments: e.target.value }))}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitReview}
                  disabled={updateComplaintMutation.isPending || !reviewForm.status}
                >
                  {updateComplaintMutation.isPending ? "Updating..." : "Update Status"}
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

function ComplaintCard({ 
  complaint, 
  onReview, 
  getDepartmentLabel, 
  getStatusBadge 
}: { 
  complaint: StaffComplaint; 
  onReview: (complaint: StaffComplaint) => void;
  getDepartmentLabel: (dept: string) => string;
  getStatusBadge: (status: string) => JSX.Element;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow w-full max-w-full min-w-0">
      <CardHeader className="pb-3 p-3 sm:p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 w-full max-w-full min-w-0">
          <div className="space-y-2 flex-1 w-full max-w-full min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base sm:text-lg break-words">Complaint #{complaint.id}</CardTitle>
              {getStatusBadge(complaint.status)}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 w-full max-w-full">
              <div className="flex items-center gap-1 min-w-0">
                <User className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">{complaint.name}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <Mail className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">{complaint.email}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <Building2 className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">{getDepartmentLabel(complaint.department)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button size="sm" variant="outline" onClick={() => onReview(complaint)} className="flex-1 sm:flex-none whitespace-nowrap">
              <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              <span className="text-xs sm:text-sm">Review</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 p-3 sm:p-4 lg:p-6">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 line-clamp-3">
              {complaint.detailedExplanation}
            </p>
          </div>

          {complaint.screenshotUrl && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Image className="w-4 h-4" />
              <span>Screenshot attached</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Submitted: {format(new Date(complaint.createdAt), 'PPp')}
            </div>
            {complaint.reviewedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Reviewed: {format(new Date(complaint.reviewedAt), 'PPp')}
              </div>
            )}
          </div>

          {complaint.reviewComments && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                <FileText className="w-4 h-4" />
                Review Comments
              </div>
              <p className="text-sm text-gray-600">{complaint.reviewComments}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}