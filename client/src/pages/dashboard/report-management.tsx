import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Bug, Lightbulb, AlertCircle, CheckCircle, Clock, Eye, Search, Filter } from "lucide-react";

interface IssueReport {
  id: number;
  title: string;
  description: string;
  suggestions?: string;
  reporterName: string;
  reporterEmail: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: "bug" | "feature_request" | "improvement" | "other";
  status: "pending" | "reviewing" | "resolved" | "closed";
  submitterId?: number;
  submitterName?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  reviewComments?: string;
  screenshotUrl?: string; // Added screenshotUrl field
  createdAt: string;
  updatedAt: string;
}

export default function ReportManagement() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<IssueReport | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>("");
  const [reviewComments, setReviewComments] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Check if user has access
  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";
  const isReplitDevelopment = user?.specialization === "replit_development" || user?.specialization === "Replit Development";
  const hasAccess = isOperationsManager || isReplitDevelopment;

  // Fetch issue reports
  const { data: reports = [], isLoading } = useQuery<IssueReport[]>({
    queryKey: ["/api/issue-reports"],
    queryFn: async () => {
      const response = await fetch("/api/issue-reports", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reports");
      return response.json();
    },
    enabled: hasAccess,
  });

  // Update report mutation
  const updateReport = useMutation({
    mutationFn: async ({ id, status, reviewComments }: { id: number; status: string; reviewComments: string }) => {
      const response = await fetch(`/api/issue-reports/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ status, reviewComments }),
      });
      if (!response.ok) throw new Error("Failed to update report");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Issue report updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/issue-reports"] });
      setSelectedReport(null);
      setReviewStatus("");
      setReviewComments("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReviewSubmit = () => {
    if (!selectedReport || !reviewStatus) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive",
      });
      return;
    }

    updateReport.mutate({
      id: selectedReport.id,
      status: reviewStatus,
      reviewComments,
    });
  };

  // Filter reports
  const filteredReports = reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.reporterName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || report.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || report.category === categoryFilter;
    const matchesPriority = priorityFilter === "all" || report.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "reviewing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "resolved":
        return "bg-green-100 text-green-800 border-green-200";
      case "closed":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "bug":
        return <Bug className="h-4 w-4 text-red-500" />;
      case "feature_request":
        return <Lightbulb className="h-4 w-4 text-blue-500" />;
      case "improvement":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
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

  if (!hasAccess) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Bug className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
                <p className="text-gray-500 text-center">
                  Only operations managers and staff with Replit Development specialization can access report management.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Your role: {user?.role}, Specialization: {user?.specialization}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const pendingReports = filteredReports.filter(r => r.status === "pending");
  const reviewingReports = filteredReports.filter(r => r.status === "reviewing");
  const resolvedReports = filteredReports.filter(r => r.status === "resolved");
  const closedReports = filteredReports.filter(r => r.status === "closed");

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <div className="text-center">Loading reports...</div>
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
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Bug className="h-6 w-6 text-orange-600" />
                  App Issue/Error management
                </h1>
                <p className="text-muted-foreground">
                  Review and manage user-submitted issue reports
                </p>
              </div>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search reports..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="reviewing">Reviewing</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("all");
                      setCategoryFilter("all");
                      setPriorityFilter("all");
                    }}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="pending" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pending" className="relative">
                  Pending
                  {pendingReports.length > 0 && (
                    <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                      {pendingReports.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="reviewing">
                  Reviewing ({reviewingReports.length})
                </TabsTrigger>
                <TabsTrigger value="resolved">
                  Resolved ({resolvedReports.length})
                </TabsTrigger>
                <TabsTrigger value="closed">
                  Closed ({closedReports.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-6">
                {pendingReports.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No pending reports</h3>
                      <p className="text-gray-500 text-center">
                        All issue reports have been reviewed.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {pendingReports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onReview={(report) => {
                          setSelectedReport(report);
                          setReviewStatus(report.status);
                          setReviewComments(report.reviewComments || "");
                        }}
                        getCategoryIcon={getCategoryIcon}
                        getStatusColor={getStatusColor}
                        getPriorityColor={getPriorityColor}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reviewing" className="space-y-6">
                {reviewingReports.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <Eye className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No reports under review</h3>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {reviewingReports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onReview={(report) => {
                          setSelectedReport(report);
                          setReviewStatus(report.status);
                          setReviewComments(report.reviewComments || "");
                        }}
                        getCategoryIcon={getCategoryIcon}
                        getStatusColor={getStatusColor}
                        getPriorityColor={getPriorityColor}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="resolved" className="space-y-6">
                {resolvedReports.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No resolved reports</h3>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {resolvedReports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onReview={(report) => {
                          setSelectedReport(report);
                          setReviewStatus(report.status);
                          setReviewComments(report.reviewComments || "");
                        }}
                        getCategoryIcon={getCategoryIcon}
                        getStatusColor={getStatusColor}
                        getPriorityColor={getPriorityColor}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="closed" className="space-y-6">
                {closedReports.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No closed reports</h3>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {closedReports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onReview={(report) => {
                          setSelectedReport(report);
                          setReviewStatus(report.status);
                          setReviewComments(report.reviewComments || "");
                        }}
                        getCategoryIcon={getCategoryIcon}
                        getStatusColor={getStatusColor}
                        getPriorityColor={getPriorityColor}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Review Dialog */}
            <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Review Issue Report</DialogTitle>
                </DialogHeader>
                {selectedReport && (
                  <div className="space-y-6">
                    {/* Report Details */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(selectedReport.category)}
                        <h3 className="text-lg font-semibold">{selectedReport.title}</h3>
                      </div>

                      <div className="flex gap-2">
                        <Badge variant="outline" className={getStatusColor(selectedReport.status)}>
                          {selectedReport.status.charAt(0).toUpperCase() + selectedReport.status.slice(1)}
                        </Badge>
                        <Badge variant="outline" className={getPriorityColor(selectedReport.priority)}>
                          {selectedReport.priority.charAt(0).toUpperCase() + selectedReport.priority.slice(1)}
                        </Badge>
                        <Badge variant="outline">
                          {selectedReport.category.replace("_", " ").charAt(0).toUpperCase() + selectedReport.category.replace("_", " ").slice(1)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Reporter:</span>
                          <p>{selectedReport.reporterName} ({selectedReport.reporterEmail})</p>
                        </div>
                        <div>
                          <span className="font-medium">Submitted:</span>
                          <p>{formatDate(selectedReport.createdAt)}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Description</h4>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="whitespace-pre-wrap">{selectedReport.description}</p>
                        </div>
                      </div>

                      {selectedReport.suggestions && (
                        <div>
                          <Label className="font-medium">Suggestions</Label>
                          <p className="text-sm text-gray-600 mt-1">{selectedReport.suggestions}</p>
                        </div>
                      )}

                      {selectedReport.screenshotUrl && (
                        <div>
                          <Label className="font-medium">Screenshot</Label>
                          <div className="mt-2">
                            <img 
                              src={selectedReport.screenshotUrl} 
                              alt="Issue screenshot" 
                              className="max-w-full h-auto rounded-lg border"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Review Section */}
                    <div className="border-t pt-6">
                      <h3 className="font-medium mb-4">Update Status</h3>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="status">Status</Label>
                          <Select value={reviewStatus} onValueChange={setReviewStatus}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="reviewing">Reviewing</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="comments">Review Comments</Label>
                          <Textarea
                            id="comments"
                            value={reviewComments}
                            onChange={(e) => setReviewComments(e.target.value)}
                            placeholder="Add your review comments..."
                            className="mt-1"
                            rows={4}
                          />
                        </div>
                        <Button 
                          onClick={handleReviewSubmit}
                          disabled={updateReport.isPending}
                          className="w-full"
                        >
                          {updateReport.isPending ? "Updating..." : "Update Report"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportCard({ 
  report, 
  onReview, 
  getCategoryIcon, 
  getStatusColor, 
  getPriorityColor, 
  formatDate 
}: { 
  report: IssueReport; 
  onReview: (report: IssueReport) => void;
  getCategoryIcon: (category: string) => JSX.Element;
  getStatusColor: (status: string) => string;
  getPriorityColor: (priority: string) => string;
  formatDate: (date: string) => string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {getCategoryIcon(report.category)}
              <CardTitle className="text-lg">{report.title}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getStatusColor(report.status)}>
                {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
              </Badge>
              <Badge variant="outline" className={getPriorityColor(report.priority)}>
                {report.priority.charAt(0).toUpperCase() + report.priority.slice(1)}
              </Badge>
            </div>
            <div className="text-sm text-gray-500">
              <span>From: {report.reporterName} ({report.reporterEmail})</span>
              <span className="ml-4">Submitted: {formatDate(report.createdAt)}</span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onReview(report)}>
            <Eye className="w-4 h-4 mr-1" />
            Review
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 line-clamp-2">
            {report.description}
          </p>

          {report.suggestions && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-xs font-medium text-blue-900 mb-1">Suggestions:</p>
              <p className="text-xs text-blue-800 line-clamp-2">{report.suggestions}</p>
            </div>
          )}

          {report.reviewComments && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-1">Review Comments:</p>
              <p className="text-xs text-gray-600">{report.reviewComments}</p>
            </div>
          )}

          {report.screenshotUrl && (
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Screenshot attached
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}