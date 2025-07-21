
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Send } from "lucide-react";

export default function RegisterDissatisfaction() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const submitComplaint = useMutation({
    mutationFn: async (data: { category: string; description: string }) => {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to submit complaint");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Complaint Submitted",
        description: "Your feedback has been received. We'll address your concerns promptly.",
      });
      setCategory("");
      setDescription("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !description.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a category and provide a detailed description.",
        variant: "destructive",
      });
      return;
    }
    submitComplaint.mutate({ category, description: description.trim() });
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
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select complaint category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="service_quality">Service Quality</SelectItem>
                        <SelectItem value="communication">Communication Issues</SelectItem>
                        <SelectItem value="timeline_delays">Timeline & Delays</SelectItem>
                        <SelectItem value="technical_issues">Technical Issues</SelectItem>
                        <SelectItem value="billing_concerns">Billing Concerns</SelectItem>
                        <SelectItem value="staff_behavior">Staff Behavior</SelectItem>
                        <SelectItem value="project_management">Project Management</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Detailed Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Please provide a detailed description of your concern or issue. Include specific dates, names, or incidents if relevant."
                      className="min-h-32"
                      maxLength={1000}
                    />
                    <p className="text-xs text-gray-500">
                      {description.length}/1000 characters
                    </p>
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
