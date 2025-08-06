
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Send, Upload, X } from "lucide-react";

export default function RegisterDissatisfaction() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    productManagerName: "",
    developerName: "",
    technicalManagerName: "",
    valuableThings: ["", "", ""],
    detailedExplanation: "",
  });
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const submitComplaint = useMutation({
    mutationFn: async (data: FormData) => {
      console.log("Submitting complaint...");
      
      // Log form data for debugging
      console.log("FormData entries:");
      data.forEach((value, key) => {
        console.log(`${key}:`, value);
      });
      
      const response = await fetch("/api/complaints", {
        method: "POST",
        body: data,
        credentials: "include",
      });
      
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        let errorMessage = "Failed to submit complaint";
        try {
          const errorData = await response.json();
          console.error("Server error response:", errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log("Success response:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Complaint submitted successfully:", data);
      toast({
        title: "Complaint Submitted",
        description: "Your feedback has been received. We'll address your concerns promptly.",
      });
      setFormData({
        name: "",
        email: "",
        productManagerName: "",
        developerName: "",
        technicalManagerName: "",
        valuableThings: ["", "", ""],
        detailedExplanation: "",
      });
      setScreenshot(null);
    },
    onError: (error: Error) => {
      console.error("Complaint submission error:", error);
      toast({
        title: "Error Submitting Complaint",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleValuableThingChange = (index: number, value: string) => {
    const newValuableThings = [...formData.valuableThings];
    newValuableThings[index] = value;
    setFormData(prev => ({ ...prev, valuableThings: newValuableThings }));
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("Form submission started with data:", formData);
    
    // Validation
    if (!formData.name?.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your name.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email?.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.detailedExplanation?.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a detailed explanation of your complaint.",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // Filter out empty valuable things
    const filteredValuableThings = formData.valuableThings.filter(thing => thing?.trim());
    
    try {
      const submitData = new FormData();
      submitData.append('name', formData.name.trim());
      submitData.append('email', formData.email.trim());
      submitData.append('productManagerName', formData.productManagerName?.trim() || '');
      submitData.append('developerName', formData.developerName?.trim() || '');
      submitData.append('technicalManagerName', formData.technicalManagerName?.trim() || '');
      submitData.append('valuableThings', JSON.stringify(filteredValuableThings));
      submitData.append('detailedExplanation', formData.detailedExplanation.trim());
      
      if (screenshot) {
        submitData.append('screenshot', screenshot);
      }

      console.log("Submitting form data...");
      submitComplaint.mutate(submitData);
    } catch (error) {
      console.error("Error preparing form data:", error);
      toast({
        title: "Error",
        description: "Failed to prepare form data. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                  Register Your Dissatisfaction
                </h1>
                <p className="text-muted-foreground">
                  We value your feedback. Please let us know about any concerns or issues you've experienced.
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Complaint Form</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
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
                        placeholder="your.email@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="productManagerName">Product Manager Name</Label>
                      <Input
                        id="productManagerName"
                        value={formData.productManagerName}
                        onChange={(e) => handleInputChange('productManagerName', e.target.value)}
                        placeholder="Product manager's name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="developerName">Developer Name</Label>
                      <Input
                        id="developerName"
                        value={formData.developerName}
                        onChange={(e) => handleInputChange('developerName', e.target.value)}
                        placeholder="Developer's name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="technicalManagerName">Technical Manager Name</Label>
                      <Input
                        id="technicalManagerName"
                        value={formData.technicalManagerName}
                        onChange={(e) => handleInputChange('technicalManagerName', e.target.value)}
                        placeholder="Technical manager's name"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label>3 Things You Find Valuable in This Package *</Label>
                    {formData.valuableThings.map((thing, index) => (
                      <div key={index} className="space-y-2">
                        <Label htmlFor={`valuable-${index}`}>Valuable Thing {index + 1}</Label>
                        <Input
                          id={`valuable-${index}`}
                          value={thing}
                          onChange={(e) => handleValuableThingChange(index, e.target.value)}
                          placeholder={`What do you find valuable about this package? (${index + 1})`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="detailedExplanation">Detailed Explanation of Your Complaint *</Label>
                    <Textarea
                      id="detailedExplanation"
                      value={formData.detailedExplanation}
                      onChange={(e) => handleInputChange('detailedExplanation', e.target.value)}
                      placeholder="Please provide a detailed explanation of your complaint. Include specific dates, incidents, or concerns you'd like us to address."
                      className="min-h-32"
                      maxLength={2000}
                      required
                    />
                    <p className="text-xs text-gray-500">
                      {formData.detailedExplanation.length}/2000 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="screenshot">Screenshot (Optional)</Label>
                    <div className="space-y-2">
                      {!screenshot ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                          <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600 mb-2">
                            Click to upload a screenshot or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">
                            PNG, JPG, JPEG up to 5MB
                          </p>
                          <Input
                            id="screenshot"
                            type="file"
                            accept="image/*"
                            onChange={handleScreenshotChange}
                            className="hidden"
                          />
                          <Label
                            htmlFor="screenshot"
                            className="inline-block mt-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-md cursor-pointer hover:bg-blue-100"
                          >
                            Choose File
                          </Label>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Upload className="h-4 w-4 text-green-600" />
                            <span className="text-sm text-gray-700">{screenshot.name}</span>
                            <span className="text-xs text-gray-500">
                              ({(screenshot.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={removeScreenshot}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Your complaint will be reviewed within 24 hours</li>
                      <li>• You'll receive an acknowledgment email</li>
                      <li>• We'll investigate and provide a resolution plan</li>
                      <li>• Follow-up communication will be sent regularly</li>
                    </ul>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={submitComplaint.isPending}
                  >
                    {submitComplaint.isPending ? (
                      "Submitting..."
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Complaint
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-orange-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-orange-900 mb-2">Urgent Issues?</h3>
                    <p className="text-orange-800">
                      For urgent matters that require immediate attention, please use our emergency contact options or call our support hotline directly.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
