
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Eye, MessageSquare, Calendar } from "lucide-react";

interface Complaint {
  id: number;
  name: string;
  email: string;
  productManagerName?: string;
  developerName?: string;
  technicalManagerName?: string;
  valuableThings: string[];
  detailedExplanation: string;
  screenshotUrl?: string;
  status: "pending" | "reviewed" | "resolved";
  reviewComments?: string;
  createdAt: string;
  reviewedAt?: string;
  submitterName?: string;
}

export default function ComplaintsManagement() {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>("");
  const [reviewComments, setReviewComments] = useState("");

  // Fetch complaints
  const { data: complaints, isLoading } = useQuery<Complaint[]>({
    queryKey: ["/api/complaints"],
    queryFn: async () => {
      const response = await fetch("/api/complaints", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch complaints");
      return response.json();
    },
  });

  // Update complaint mutation
  const updateComplaint = useMutation({
    mutationFn: async ({ id, status, reviewComments }: { id: number; status: string; reviewComments: string }) => {
      const response = await fetch(`/api/complaints/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ status, reviewComments }),
      });
      if (!response.ok) throw new Error("Failed to update complaint");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Complaint updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
      setSelectedComplaint(null);
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
    if (!selectedComplaint || !reviewStatus) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive",
      });
      return;
    }

    updateComplaint.mutate({
      id: selectedComplaint.id,
      status: reviewStatus,
      reviewComments,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "reviewed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "resolved":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
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
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <div className="text-center">Loading complaints...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full max-w-none overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden w-full max-w-none min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 w-full max-w-full min-w-0">
          <div className="w-full max-w-full space-y-4 lg:space-y-6 min-w-0">
            <div className="flex flex-col gap-2 w-full max-w-full min-w-0">
              <div className="w-full max-w-full min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 flex-shrink-0" />
                  <span className="break-words">Complaints Management</span>
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1 break-words">
                  Review and manage customer complaints
                </p>
              </div>
            </div>

            {complaints && complaints.length === 0 ? (
              <Card className="w-full max-w-full">
                <CardContent className="p-6 sm:p-8 text-center w-full">
                  <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-base sm:text-lg text-gray-600 break-words">No complaints submitted yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:gap-6 w-full max-w-full">
                {complaints?.map((complaint) => (
                  <Card key={complaint.id} className="hover:shadow-md transition-shadow w-full max-w-full min-w-0">
                    <CardHeader className="p-3 sm:p-4 lg:p-6">
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 w-full max-w-full min-w-0">
                        <div className="flex-1 w-full max-w-full min-w-0">
                          <CardTitle className="text-base sm:text-lg break-words">{complaint.name}</CardTitle>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground mt-1 w-full max-w-full">
                            <span className="truncate">{complaint.email}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="text-xs sm:text-sm">{formatDate(complaint.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                          <Badge variant="outline" className={`${getStatusColor(complaint.status)} text-xs sm:text-sm whitespace-nowrap`}>
                            {complaint.status.charAt(0).toUpperCase() + complaint.status.slice(1)}
                          </Badge>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedComplaint(complaint);
                                  setReviewStatus(complaint.status);
                                  setReviewComments(complaint.reviewComments || "");
                                }}
                                className="flex-1 sm:flex-none whitespace-nowrap"
                              >
                                <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                <span className="text-xs sm:text-sm">View Details</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto w-full">
                              <DialogHeader>
                                <DialogTitle>Complaint Details</DialogTitle>
                              </DialogHeader>
                              {selectedComplaint && (
                                <div className="space-y-6">
                                  {/* Basic Information */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="font-medium">Name</Label>
                                      <p className="mt-1">{selectedComplaint.name}</p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Email</Label>
                                      <p className="mt-1">{selectedComplaint.email}</p>
                                    </div>
                                  </div>

                                  {/* Team Members */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                      <Label className="font-medium">Product Manager</Label>
                                      <p className="mt-1">{selectedComplaint.productManagerName || "Not specified"}</p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Developer</Label>
                                      <p className="mt-1">{selectedComplaint.developerName || "Not specified"}</p>
                                    </div>
                                    <div>
                                      <Label className="font-medium">Technical Manager</Label>
                                      <p className="mt-1">{selectedComplaint.technicalManagerName || "Not specified"}</p>
                                    </div>
                                  </div>

                                  {/* Valuable Things */}
                                  <div>
                                    <Label className="font-medium">Valuable Things</Label>
                                    <div className="mt-2 space-y-1">
                                      {selectedComplaint.valuableThings?.map((thing, index) => (
                                        <p key={index} className="text-sm">• {thing}</p>
                                      )) || <p className="text-sm text-muted-foreground">None specified</p>}
                                    </div>
                                  </div>

                                  {/* Detailed Explanation */}
                                  <div>
                                    <Label className="font-medium">Detailed Explanation</Label>
                                    <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                                      <p className="whitespace-pre-wrap">{selectedComplaint.detailedExplanation}</p>
                                    </div>
                                  </div>

                                  {/* Screenshot */}
                                  {selectedComplaint.screenshotUrl && (
                                    <div>
                                      <Label className="font-medium">Screenshot</Label>
                                      <div className="mt-2">
                                        <img 
                                          src={selectedComplaint.screenshotUrl} 
                                          alt="Complaint screenshot" 
                                          className="max-w-full h-auto rounded-lg border"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Review Section */}
                                  <div className="border-t pt-6">
                                    <h3 className="font-medium mb-4 flex items-center gap-2">
                                      <MessageSquare className="h-4 w-4" />
                                      Review Complaint
                                    </h3>
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="status">Status</Label>
                                        <Select value={reviewStatus} onValueChange={setReviewStatus}>
                                          <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="Select status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="pending">Pending</SelectItem>
                                            <SelectItem value="reviewed">Reviewed</SelectItem>
                                            <SelectItem value="resolved">Resolved</SelectItem>
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
                                        disabled={updateComplaint.isPending}
                                        className="w-full"
                                      >
                                        {updateComplaint.isPending ? "Updating..." : "Update Complaint"}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {complaint.detailedExplanation}
                      </p>
                      {complaint.reviewComments && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium text-blue-900">Review Comments:</p>
                          <p className="text-sm text-blue-800 mt-1">{complaint.reviewComments}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
