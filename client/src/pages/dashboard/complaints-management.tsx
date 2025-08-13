
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
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                  Complaints Management
                </h1>
                <p className="text-muted-foreground">
                  Review and manage customer complaints
                </p>
              </div>
            </div>

            {complaints && complaints.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg text-gray-600">No complaints submitted yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6">
                {complaints?.map((complaint) => (
                  <Card key={complaint.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{complaint.name}</CardTitle>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>{complaint.email}</span>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(complaint.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getStatusColor(complaint.status)}>
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
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/hooks/use-user";
import { useState, useEffect } from "react";
import { AlertTriangle, Eye, MessageSquare } from "lucide-react";

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
  status: 'pending' | 'reviewed' | 'resolved';
  reviewComments?: string;
  createdAt: string;
  reviewedAt?: string;
}

export default function ComplaintsManagement() {
  const [location] = useLocation();
  const { user } = useUser();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [reviewStatus, setReviewStatus] = useState('');
  const [reviewComments, setReviewComments] = useState('');

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    try {
      const response = await fetch("/api/complaints");
      if (response.ok) {
        const data = await response.json();
        setComplaints(data);
      }
    } catch (error) {
      console.error("Error fetching complaints:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewComplaint = async () => {
    if (!selectedComplaint || !reviewStatus) return;

    try {
      const response = await fetch(`/api/complaints/${selectedComplaint.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: reviewStatus,
          reviewComments,
        }),
      });

      if (response.ok) {
        await fetchComplaints();
        setSelectedComplaint(null);
        setReviewStatus('');
        setReviewComments('');
      }
    } catch (error) {
      console.error("Error updating complaint:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'reviewed': return 'bg-blue-500';
      case 'resolved': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                  Complaints Management
                </h1>
                <p className="text-muted-foreground">
                  Review and manage client complaints and dissatisfaction reports
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {complaints.filter(c => c.status === 'pending').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Reviewed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {complaints.filter(c => c.status === 'reviewed').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {complaints.filter(c => c.status === 'resolved').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Complaints List */}
            <Card>
              <CardHeader>
                <CardTitle>Client Complaints</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : complaints.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No complaints found.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {complaints.map((complaint) => (
                      <div key={complaint.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium">{complaint.name}</h3>
                              <Badge className={`${getStatusColor(complaint.status)} text-white text-xs`}>
                                {complaint.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Email: {complaint.email}
                            </p>
                            <p className="text-sm mb-2 line-clamp-2">
                              {complaint.detailedExplanation}
                            </p>
                            <div className="text-xs text-muted-foreground">
                              Created: {new Date(complaint.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedComplaint(complaint)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Complaint Details</DialogTitle>
                                </DialogHeader>
                                {selectedComplaint && (
                                  <div className="space-y-4">
                                    <div>
                                      <label className="font-medium">Client Name:</label>
                                      <p>{selectedComplaint.name}</p>
                                    </div>
                                    <div>
                                      <label className="font-medium">Email:</label>
                                      <p>{selectedComplaint.email}</p>
                                    </div>
                                    {selectedComplaint.productManagerName && (
                                      <div>
                                        <label className="font-medium">Product Manager:</label>
                                        <p>{selectedComplaint.productManagerName}</p>
                                      </div>
                                    )}
                                    {selectedComplaint.developerName && (
                                      <div>
                                        <label className="font-medium">Developer:</label>
                                        <p>{selectedComplaint.developerName}</p>
                                      </div>
                                    )}
                                    {selectedComplaint.technicalManagerName && (
                                      <div>
                                        <label className="font-medium">Technical Manager:</label>
                                        <p>{selectedComplaint.technicalManagerName}</p>
                                      </div>
                                    )}
                                    {selectedComplaint.valuableThings.length > 0 && (
                                      <div>
                                        <label className="font-medium">Valuable Things:</label>
                                        <ul className="list-disc list-inside">
                                          {selectedComplaint.valuableThings.map((item, index) => (
                                            <li key={index}>{item}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    <div>
                                      <label className="font-medium">Detailed Explanation:</label>
                                      <p className="whitespace-pre-wrap">{selectedComplaint.detailedExplanation}</p>
                                    </div>
                                    {selectedComplaint.screenshotUrl && (
                                      <div>
                                        <label className="font-medium">Screenshot:</label>
                                        <img 
                                          src={selectedComplaint.screenshotUrl} 
                                          alt="Complaint screenshot" 
                                          className="max-w-full h-auto mt-2 rounded"
                                        />
                                      </div>
                                    )}
                                    
                                    {/* Review Section */}
                                    <div className="border-t pt-4">
                                      <h3 className="font-medium mb-2">Review Complaint</h3>
                                      <div className="space-y-4">
                                        <Select value={reviewStatus} onValueChange={setReviewStatus}>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="reviewed">Reviewed</SelectItem>
                                            <SelectItem value="resolved">Resolved</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <Textarea
                                          placeholder="Review comments..."
                                          value={reviewComments}
                                          onChange={(e) => setReviewComments(e.target.value)}
                                        />
                                        <Button onClick={handleReviewComplaint}>
                                          Update Status
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
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
