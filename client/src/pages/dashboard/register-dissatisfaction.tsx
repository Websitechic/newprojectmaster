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
      const response = await fetch("/api/complaints", {
        method: "POST",
        body: data,
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit complaint");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Complaint Submitted",
        description: "Your feedback has been received. We'll address your concerns promptly.",
      });
      // Reset form
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
      toast({
        title: "Error",
        description: error.message,
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
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Screenshot must be less than 5MB",
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
    
    // Validate required fields
    if (!formData.name.trim() || !formData.email.trim() || !formData.detailedExplanation.trim()) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in your name, email, and detailed explanation.",
        variant: "destructive",
      });
      return;
    }

    // Create FormData object
    const data = new FormData();
    data.append("name", formData.name.trim());
    data.append("email", formData.email.trim());
    data.append("productManagerName", formData.productManagerName.trim());
    data.append("developerName", formData.developerName.trim());
    data.append("technicalManagerName", formData.technicalManagerName.trim());
    data.append("detailedExplanation", formData.detailedExplanation.trim());
    
    // Add valuable things as JSON string
    const nonEmptyValuableThings = formData.valuableThings.filter(thing => thing.trim());
    data.append("valuableThings", JSON.stringify(nonEmptyValuableThings));
    
    // Add screenshot if present
    if (screenshot) {
      data.append("screenshot", screenshot);
    }

    submitComplaint.mutate(data);
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                  Register Your Dissatisfaction
                </h1>
                <p className="text-muted-foreground">
                  Share your feedback and concerns with our team
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Complaint Form</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Personal Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        placeholder="Your full name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        placeholder="your.email@example.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Team Members */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="productManager">Product Manager Name</Label>
                      <Input
                        id="productManager"
                        value={formData.productManagerName}
                        onChange={(e) => handleInputChange("productManagerName", e.target.value)}
                        placeholder="Product manager's name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="developer">Developer Name</Label>
                      <Input
                        id="developer"
                        value={formData.developerName}
                        onChange={(e) => handleInputChange("developerName", e.target.value)}
                        placeholder="Developer's name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="technicalManager">Technical Manager Name</Label>
                      <Input
                        id="technicalManager"
                        value={formData.technicalManagerName}
                        onChange={(e) => handleInputChange("technicalManagerName", e.target.value)}
                        placeholder="Technical manager's name"
                      />
                    </div>
                  </div>

                  {/* Valuable Things */}
                  <div>
                    <Label>3 Things You Find Valuable in This Package</Label>
                    <div className="space-y-2 mt-2">
                      {formData.valuableThings.map((thing, index) => (
                        <Input
                          key={index}
                          value={thing}
                          onChange={(e) => handleValuableThingChange(index, e.target.value)}
                          placeholder={`Valuable thing ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Detailed Explanation */}
                  <div>
                    <Label htmlFor="explanation">Detailed Explanation of Your Complaint *</Label>
                    <Textarea
                      id="explanation"
                      value={formData.detailedExplanation}
                      onChange={(e) => handleInputChange("detailedExplanation", e.target.value)}
                      placeholder="Please provide a detailed explanation of your complaint, including any relevant context, specific issues, and how they have affected you or your project..."
                      rows={6}
                      required
                    />
                  </div>

                  {/* Screenshot Upload */}
                  <div>
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

                  {/* Submit Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={submitComplaint.isPending}
                      className="min-w-32"
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
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}