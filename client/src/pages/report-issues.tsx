
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bug, Lightbulb, AlertCircle, CheckCircle, Clock, Eye, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface IssueReport {
  id: number;
  title: string;
  description: string;
  suggestions?: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: "bug" | "feature_request" | "improvement" | "other";
  status: "pending" | "reviewing" | "resolved" | "closed";
  reviewComments?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ReportIssues() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    suggestions: "",
    priority: "medium",
    category: "other",
  });

  // Clear the indicator when page is opened
  useState(() => {
    queryClient.setQueryData(["/api/issue-reports/has-updates"], false);
  });

  // Fetch user's issue reports
  const { data: userReports = [] } = useQuery<IssueReport[]>({
    queryKey: ["/api/issue-reports"],
    queryFn: async () => {
      const response = await fetch("/api/issue-reports", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reports");
      return response.json();
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Screenshot must be less than 5MB",
          variant: "destructive",
        });
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image file only",
          variant: "destructive",
        });
        return;
      }
      setScreenshot(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to submit an issue report",
        variant: "destructive",
      });
      return;
    }

    if (!formData.title.trim() || !formData.description.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in the title and description",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const data = new FormData();
      data.append("title", formData.title.trim());
      data.append("description", formData.description.trim());
      data.append("suggestions", formData.suggestions.trim());
      data.append("priority", formData.priority);
      data.append("category", formData.category);
      
      if (screenshot) {
        data.append("screenshot", screenshot);
      }

      const response = await fetch("/api/issue-reports", {
        method: "POST",
        credentials: "include",
        headers: {
          'Accept': 'application/json',
        },
        body: data,
      });

      if (response.ok) {
        toast({
          title: "Issue reported successfully",
          description: "Your issue has been submitted and will be reviewed by our team.",
        });

        // Reset form
        setFormData({
          title: "",
          description: "",
          suggestions: "",
          priority: "medium",
          category: "other",
        });
        setScreenshot(null);

        // Refresh the reports list
        window.location.reload();
      } else {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to submit report");
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { 
        variant: "destructive" as const, 
        label: "Pending", 
        icon: <Clock className="h-3 w-3" />,
        color: "bg-yellow-100 text-yellow-800"
      },
      reviewing: { 
        variant: "default" as const, 
        label: "Reviewing", 
        icon: <Eye className="h-3 w-3" />,
        color: "bg-blue-100 text-blue-800"
      },
      resolved: { 
        variant: "secondary" as const, 
        label: "Resolved", 
        icon: <CheckCircle className="h-3 w-3" />,
        color: "bg-green-100 text-green-800"
      },
      closed: { 
        variant: "outline" as const, 
        label: "Closed", 
        icon: <CheckCircle className="h-3 w-3" />,
        color: "bg-gray-100 text-gray-800"
      },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
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

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full">
          <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Report app issue/Error
        </h1>
        <p className="text-gray-600">
          Help us improve the app by reporting bugs, requesting features, or suggesting improvements.
        </p>
        {!user && (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You must be logged in to submit an issue report. Please log in and try again.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Report Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Submit Issue Report
            </CardTitle>
            <CardDescription>
              Describe the issue you're experiencing or suggest improvements for the application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please provide as much detail as possible to help us understand and resolve the issue quickly.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Issue Title *</Label>
                <Input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Brief description of the issue"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => handleInputChange("category", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => handleInputChange("priority", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Issue Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Detailed description of the issue, including steps to reproduce, expected behavior, and actual behavior..."
                  className="min-h-[100px]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="suggestions">Suggestions (Optional)</Label>
                <Textarea
                  id="suggestions"
                  value={formData.suggestions}
                  onChange={(e) => handleInputChange("suggestions", e.target.value)}
                  placeholder="Any suggestions on how to fix the issue or improve the feature..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="screenshot">Screenshot (Optional)</Label>
                <div className="mt-2">
                  {screenshot ? (
                    <div className="flex items-center gap-4 p-4 border border-dashed rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{screenshot.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(screenshot.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeScreenshot}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full">
                      <label
                        htmlFor="screenshot"
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-4 text-gray-500" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">PNG, JPG, JPEG (MAX. 5MB)</p>
                        </div>
                        <input
                          id="screenshot"
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleScreenshotChange}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting || !user} className="w-full">
                {isSubmitting ? "Submitting..." : !user ? "Login Required" : "Submit Issue Report"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* User's Reports History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Your Reports
            </CardTitle>
            <CardDescription>
              Track the status of your submitted issue reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {userReports.length === 0 ? (
              <div className="text-center py-8">
                <Bug className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No reports submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {userReports.map((report) => (
                  <div key={report.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {getCategoryIcon(report.category)}
                        <div>
                          <h4 className="font-medium text-sm">{report.title}</h4>
                          <p className="text-xs text-gray-500 mt-1">
                            Submitted: {formatDate(report.createdAt)}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(report.status)}
                    </div>

                    <p className="text-sm text-gray-700 line-clamp-2">
                      {report.description}
                    </p>

                    {report.reviewComments && (
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-xs font-medium text-blue-900 mb-1">Review Comments:</p>
                        <p className="text-xs text-blue-800">{report.reviewComments}</p>
                      </div>
                    )}
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
    </div>
  );
}
