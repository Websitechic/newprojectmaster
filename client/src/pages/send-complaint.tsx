import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, MessageSquare, AlertCircle } from "lucide-react";

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    department: user?.specialization || "",
    detailedExplanation: "",
  });
  const [screenshot, setScreenshot] = useState<File | null>(null);

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

      const response = await fetch('/api/staff-complaints', {
        method: 'POST',
        body: formDataToSend,
      });

      if (response.ok) {
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit complaint');
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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Send Your Complaint
        </h1>
        <p className="text-gray-600">
          Submit your complaint or concern to operations management for review and resolution.
        </p>
      </div>

      <Card>
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

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@company.com"
                  required
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

            <div className="space-y-2">
              <Label htmlFor="screenshot">Screenshot or Evidence (Optional)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="screenshot"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                <Upload className="h-5 w-5 text-gray-400" />
              </div>
              {screenshot && (
                <p className="text-sm text-green-600">
                  File selected: {screenshot.name}
                </p>
              )}
              <p className="text-sm text-gray-500">
                Upload any screenshots or evidence related to your complaint (images only, max 5MB)
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
                {isSubmitting ? "Submitting..." : "Submit Complaint"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}