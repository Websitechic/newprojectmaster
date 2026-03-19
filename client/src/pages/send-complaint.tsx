import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, MessageSquare, AlertCircle, Eye } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";

const DEPARTMENTS = [
  { value: "automation", label: "Automation Team" },
  { value: "copywriting", label: "Copywriting Team" },
  { value: "design", label: "Design Team" },
  { value: "media_buying", label: "Media Buying Team" },
  { value: "development", label: "Development Team" },
  { value: "community_manager", label: "Community Management Team" },
  { value: "technical_support", label: "Technical Support Team" },
  { value: "project_management", label: "Project Management Team" },
  { value: "product_ownership", label: "Product Ownership Team" },
  { value: "other", label: "Other" },
];

export default function SendComplaint() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    department: user?.specialization || "",
    detailedExplanation: "",
  });
  const [screenshot, setScreenshot] = useState<File | null>(null);

  // Mark as viewed when page loads
  useEffect(() => {
    const markViewed = async () => {
      try {
        await fetch("/api/staff-complaints/mark-viewed", {
          method: "POST",
          credentials: "include",
        });
        // Invalidate the indicator query to update the sidebar
        queryClient.invalidateQueries({ queryKey: ["/api/staff-complaints/my-complaints/has-updates"] });
      } catch (error) {
        console.error("Error marking staff complaints as viewed:", error);
      }
    };

    if (user) {
      markViewed();
    }
  }, [user, queryClient]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type (images only)
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image file only",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }

      setScreenshot(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.detailedExplanation.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name.trim());
      formDataToSend.append('email', formData.email.trim());
      formDataToSend.append('department', formData.department);
      formDataToSend.append('detailedExplanation', formData.detailedExplanation.trim());

      if (screenshot) {
        formDataToSend.append('screenshot', screenshot);
      }

      console.log('Submitting complaint form data...');

      const response = await fetch('/api/staff-complaints', {
        method: 'POST',
        credentials: 'include',
        body: formDataToSend,
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('Complaint submitted successfully:', result);

        toast({
          title: "Complaint submitted successfully",
          description: "Your complaint has been submitted and will be reviewed by operations management.",
        });

        // Reset form
        setFormData({
          name: user?.name || "",
          email: user?.email || "",
          department: user?.specialization || "",
          detailedExplanation: "",
        });
        setScreenshot(null);

        // Reset file input
        const fileInput = document.getElementById('screenshot') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error response:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to submit complaint`);
      }
    } catch (error) {
      console.error('Error submitting complaint:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit complaint. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden w-full max-w-none min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 w-full max-w-full min-w-0">
          <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-6 min-w-0">
      <div className="mb-4 sm:mb-6 lg:mb-8 w-full max-w-full">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2 break-words">
          Send Your Complaint
        </h1>
        <p className="text-sm sm:text-base text-gray-600 break-words">
          Submit your complaint or concern to operations management for review and resolution.
        </p>
      </div>

      <Card className="w-full max-w-full min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Staff Complaint Form
          </CardTitle>
          <CardDescription>
            Please provide detailed information about your complaint. All submissions are confidential and will be reviewed by operations management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> This form is for legitimate workplace complaints and concerns.
              Please provide accurate and detailed information to help us address your issue effectively.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 w-full max-w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full">
              <div className="space-y-2 w-full max-w-full">
                <Label htmlFor="name" className="text-sm sm:text-base">Full Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Your full name"
                  required
                  className="w-full"
                />
              </div>

              <div className="space-y-2 w-full max-w-full">
                <Label htmlFor="email" className="text-sm sm:text-base">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@company.com"
                  required
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Your Department</Label>
              <Select
                value={formData.department}
                onValueChange={(value) => handleInputChange('department', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept.value} value={dept.value}>
                      {dept.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="detailedExplanation">Detailed Explanation of Your Complaint *</Label>
              <Textarea
                id="detailedExplanation"
                value={formData.detailedExplanation}
                onChange={(e) => handleInputChange('detailedExplanation', e.target.value)}
                placeholder="Please provide a detailed explanation of your complaint, including any relevant dates, people involved, and specific incidents..."
                className="min-h-[120px]"
                required
              />
              <p className="text-sm text-gray-500">
                Be as specific as possible. Include dates, times, and any relevant details.
              </p>
            </div>

            <div className="space-y-2 w-full max-w-full">
              <Label htmlFor="screenshot" className="text-sm sm:text-base">Screenshot or Evidence (Optional)</Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full">
                <Input
                  id="screenshot"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="flex-1 w-full"
                />
                <Upload className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0" />
              </div>
              {screenshot && (
                <p className="text-xs sm:text-sm text-green-600 break-words">
                  File selected: {screenshot.name}
                </p>
              )}
              <p className="text-xs sm:text-sm text-gray-500 break-words">
                Upload any screenshots or evidence related to your complaint (images only, max 5MB)
              </p>
            </div>

            <div className="flex justify-end w-full">
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto sm:min-w-[150px]">
                {isSubmitting ? "Submitting..." : "Submit Complaint"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Complaint History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Your Complaint History
          </CardTitle>
          <CardDescription>
            Track the status of your submitted complaints and view review comments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComplaintHistoryTable />
        </CardContent>
      </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComplaintHistoryTable() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchComplaints = async () => {
      try {
        const response = await fetch('/api/staff-complaints/my-complaints', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setComplaints(data);
        } else {
          console.error('Failed to fetch staff complaints:', response.status);
        }
      } catch (error) {
        console.error('Error fetching staff complaints:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchComplaints();
    }
  }, [user]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "destructive" as const, label: "Pending", color: "bg-yellow-100 text-yellow-800" },
      reviewed: { variant: "default" as const, label: "Reviewed", color: "bg-blue-100 text-blue-800" },
      resolved: { variant: "secondary" as const, label: "Resolved", color: "bg-green-100 text-green-800" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
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
      <div className="text-center py-8">
        <p className="text-gray-500">Loading your complaint history...</p>
      </div>
    );
  }

  if (complaints.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">No complaints submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full max-w-full">
      <table className="w-full border-collapse border border-gray-200 min-w-[800px] table-auto">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-200 px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
              Submitted Date
            </th>
            <th className="border border-gray-200 px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
              Status
            </th>
            <th className="border border-gray-200 px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
              Complaint Summary
            </th>
            <th className="border border-gray-200 px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
              Review Comments
            </th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((complaint, index) => (
            <tr key={complaint.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-200 px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                {formatDate(complaint.createdAt)}
              </td>
              <td className="border border-gray-200 px-2 sm:px-4 py-2 whitespace-nowrap">
                {getStatusBadge(complaint.status)}
              </td>
              <td className="border border-gray-200 px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 max-w-[200px] sm:max-w-xs">
                <p className="truncate" title={complaint.detailedExplanation}>
                  {complaint.detailedExplanation.length > 100
                    ? `${complaint.detailedExplanation.substring(0, 100)}...`
                    : complaint.detailedExplanation}
                </p>
              </td>
              <td className="border border-gray-200 px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-600 max-w-[200px] sm:max-w-xs">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    {complaint.reviewComments ? (
                      <p className="truncate" title={complaint.reviewComments}>
                        {complaint.reviewComments.length > 100
                          ? `${complaint.reviewComments.substring(0, 100)}...`
                          : complaint.reviewComments}
                      </p>
                    ) : (
                      <span className="text-gray-400 italic text-xs sm:text-sm">No review yet</span>
                    )}
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-shrink-0">
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-2xl w-full">
                      <DialogHeader>
                        <DialogTitle>Complaint Details</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label className="font-medium">Submitted Date</Label>
                          <p className="mt-1">{formatDate(complaint.createdAt)}</p>
                        </div>
                        <div>
                          <Label className="font-medium">Status</Label>
                          <div className="mt-1">{getStatusBadge(complaint.status)}</div>
                        </div>
                        <div>
                          <Label className="font-medium">Complaint Details</Label>
                          <p className="mt-1 text-sm">{complaint.detailedExplanation}</p>
                        </div>
                        {complaint.reviewComments && (
                          <div>
                            <Label className="font-medium">Review Comments</Label>
                            <p className="mt-1 text-sm">{complaint.reviewComments}</p>
                          </div>
                        )}
                        {complaint.screenshotUrl && (
                          <div>
                            <Label className="font-medium">Screenshot</Label>
                            <img
                              src={complaint.screenshotUrl}
                              alt="Complaint screenshot"
                              className="mt-2 max-w-full h-auto max-h-64 object-contain rounded border"
                            />
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}