
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { ThumbsUp, AlertCircle, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClientSentiment {
  id: number;
  clientId: number;
  sentiment: string;
  reason: string;
  createdAt: string;
  weekStart: string;
  weekEnd: string;
}

export default function ClientSentiment() {
  const [location] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [sentiment, setSentiment] = useState("");
  const [reason, setReason] = useState("");

  // Get current week's start date (Monday)
  const getCurrentWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const getCurrentWeekEnd = () => {
    const monday = getCurrentWeekStart();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  };

  // Check if user has already submitted sentiment for this week
  const { data: existingSentiment, isLoading: checkingExisting } = useQuery<ClientSentiment | null>({
    queryKey: ["/api/client-sentiment/current-week"],
    queryFn: async () => {
      const response = await fetch("/api/client-sentiment/current-week");
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to check existing sentiment");
      return response.json();
    },
  });

  const submitSentimentMutation = useMutation({
    mutationFn: async (data: { sentiment: string; reason: string }) => {
      const response = await fetch("/api/client-sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to submit sentiment");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your sentiment has been submitted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/client-sentiment/current-week"] });
      setSentiment("");
      setReason("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to submit sentiment: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sentiment) {
      toast({
        title: "Error",
        description: "Please select how you feel about our service.",
        variant: "destructive",
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for your sentiment.",
        variant: "destructive",
      });
      return;
    }

    submitSentimentMutation.mutate({ sentiment, reason: reason.trim() });
  };

  const weekStart = getCurrentWeekStart();
  const weekEnd = getCurrentWeekEnd();

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "satisfied":
        return "text-green-600 bg-green-50 border-green-200";
      case "dissatisfied":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "flags":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  if (checkingExisting) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-6 w-full">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                <ThumbsUp className="h-6 w-6" />
                Client Sentiment
              </h1>
              <p className="text-gray-600 mt-2">Share your weekly feedback about our service</p>
              
              <div className="flex items-center justify-center gap-2 mt-4">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  Week of {weekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}
                </span>
              </div>
            </div>

            {existingSentiment ? (
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600" />
                    Already Submitted This Week
                  </CardTitle>
                  <CardDescription>
                    You have already submitted your sentiment for this week. You can submit again next Monday.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium">Your Sentiment:</Label>
                      <Badge 
                        className={`ml-2 ${getSentimentColor(existingSentiment.sentiment)}`}
                        variant="outline"
                      >
                        {existingSentiment.sentiment === "satisfied" ? "Satisfied" :
                         existingSentiment.sentiment === "dissatisfied" ? "Dissatisfied" : "Flags (unhappy/frustrated/angry)"}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Reason:</Label>
                      <p className="text-sm text-gray-700 mt-1 p-3 bg-gray-50 rounded-md">
                        {existingSentiment.reason}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      Submitted on {new Date(existingSentiment.createdAt).toLocaleDateString()} at{' '}
                      {new Date(existingSentiment.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Service Feedback</CardTitle>
                  <CardDescription>
                    Please take a moment to share how you feel about our service this week. Your feedback helps us improve.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <Label className="text-base font-medium mb-4 block">
                        How do you feel about our service so far?
                      </Label>
                      <RadioGroup value={sentiment} onValueChange={setSentiment} className="space-y-3">
                        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                          <RadioGroupItem value="satisfied" id="satisfied" />
                          <Label htmlFor="satisfied" className="cursor-pointer flex-1">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                              <span className="font-medium">Satisfied</span>
                            </div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                          <RadioGroupItem value="dissatisfied" id="dissatisfied" />
                          <Label htmlFor="dissatisfied" className="cursor-pointer flex-1">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                              <span className="font-medium">Dissatisfied</span>
                            </div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                          <RadioGroupItem value="flags" id="flags" />
                          <Label htmlFor="flags" className="cursor-pointer flex-1">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                              <span className="font-medium">Flags (unhappy, frustrated, angry)</span>
                            </div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div>
                      <Label htmlFor="reason" className="text-base font-medium">
                        State the reason for this sentiment *
                      </Label>
                      <Textarea
                        id="reason"
                        placeholder="Please explain why you feel this way about our service..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-2"
                        rows={4}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      disabled={submitSentimentMutation.isPending}
                    >
                      {submitSentimentMutation.isPending ? "Submitting..." : "Submit Feedback"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-800 font-medium">Weekly Feedback Schedule</p>
                    <p className="text-sm text-blue-700 mt-1">
                      You can submit your sentiment feedback once per week. The form resets every Monday.
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
