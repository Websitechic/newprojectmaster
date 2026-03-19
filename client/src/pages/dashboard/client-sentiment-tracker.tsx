
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/hooks/use-user";
import { TrendingUp, Calendar, Users, AlertTriangle, ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";

interface ClientSentimentData {
  id: number;
  clientId: number;
  clientName: string;
  clientEmail: string;
  sentiment: string;
  reason: string;
  createdAt: string;
  weekStart: string;
  weekEnd: string;
}

interface SentimentStats {
  total: number;
  satisfied: number;
  dissatisfied: number;
  flags: number;
}

export default function ClientSentimentTracker() {
  const [location] = useLocation();
  const { user } = useUser();
  const [selectedWeek, setSelectedWeek] = useState("current");

  // Check if user is operations manager
  if (!user || (user.role !== "operations_manager" && user.specialization !== "operations_manager")) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-600">Only operations managers can access this page</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { data: sentiments = [], isLoading } = useQuery<ClientSentimentData[]>({
    queryKey: ["/api/client-sentiment/all", selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/client-sentiment/all?week=${selectedWeek}`);
      if (!response.ok) throw new Error("Failed to fetch client sentiments");
      return response.json();
    },
  });

  const stats: SentimentStats = {
    total: sentiments.length,
    satisfied: sentiments.filter(s => s.sentiment === "satisfied").length,
    dissatisfied: sentiments.filter(s => s.sentiment === "dissatisfied").length,
    flags: sentiments.filter(s => s.sentiment === "flags").length,
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "satisfied":
        return <ThumbsUp className="h-4 w-4" />;
      case "dissatisfied":
        return <ThumbsDown className="h-4 w-4" />;
      case "flags":
        return <Flag className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "satisfied":
        return "text-green-700 bg-green-50 border-green-200";
      case "dissatisfied":
        return "text-yellow-700 bg-yellow-50 border-yellow-200";
      case "flags":
        return "text-red-700 bg-red-50 border-red-200";
      default:
        return "text-gray-700 bg-gray-50 border-gray-200";
    }
  };

  const getSentimentLabel = (sentiment: string) => {
    switch (sentiment) {
      case "satisfied":
        return "Satisfied";
      case "dissatisfied":
        return "Dissatisfied";
      case "flags":
        return "Flags";
      default:
        return sentiment;
    }
  };

  const getWeekOptions = () => {
    const options = [
      { value: "current", label: "Current Week" },
      { value: "last", label: "Last Week" },
    ];
    
    for (let i = 2; i <= 8; i++) {
      const date = subWeeks(new Date(), i);
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = endOfWeek(date, { weekStartsOn: 1 });
      options.push({
        value: i.toString(),
        label: `${format(start, "MMM d")} - ${format(end, "MMM d")}`
      });
    }
    
    return options;
  };

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <TrendingUp className="h-8 w-8 text-gray-400 mx-auto mb-2 animate-pulse" />
              <p className="text-gray-600">Loading sentiment data...</p>
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
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-6 w-6" />
                  Client Sentiment Tracker
                </h1>
                <p className="text-gray-600 mt-1">Monitor client satisfaction and feedback</p>
              </div>
              
              <div className="w-48">
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {getWeekOptions().map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Responses</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                    </div>
                    <Users className="h-8 w-8 text-gray-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-600">Satisfied</p>
                      <p className="text-2xl font-bold text-green-700">{stats.satisfied}</p>
                      <p className="text-xs text-green-600">
                        {stats.total > 0 ? Math.round((stats.satisfied / stats.total) * 100) : 0}% of total
                      </p>
                    </div>
                    <ThumbsUp className="h-8 w-8 text-green-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-yellow-600">Dissatisfied</p>
                      <p className="text-2xl font-bold text-yellow-700">{stats.dissatisfied}</p>
                      <p className="text-xs text-yellow-600">
                        {stats.total > 0 ? Math.round((stats.dissatisfied / stats.total) * 100) : 0}% of total
                      </p>
                    </div>
                    <ThumbsDown className="h-8 w-8 text-yellow-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-600">Flags</p>
                      <p className="text-2xl font-bold text-red-700">{stats.flags}</p>
                      <p className="text-xs text-red-600">
                        {stats.total > 0 ? Math.round((stats.flags / stats.total) * 100) : 0}% of total
                      </p>
                    </div>
                    <Flag className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Client Feedback List */}
            <Card>
              <CardHeader>
                <CardTitle>Client Feedback Details</CardTitle>
                <CardDescription>
                  Individual client sentiment submissions for the selected week
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sentiments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No feedback yet</h3>
                    <p className="text-gray-600">No client sentiment data available for the selected week.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sentiments.map((sentiment) => (
                      <div key={sentiment.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900">{sentiment.clientName}</h4>
                            <p className="text-sm text-gray-600">{sentiment.clientEmail}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className={`${getSentimentColor(sentiment.sentiment)}`}
                              variant="outline"
                            >
                              <div className="flex items-center gap-1">
                                {getSentimentIcon(sentiment.sentiment)}
                                {getSentimentLabel(sentiment.sentiment)}
                              </div>
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {format(new Date(sentiment.createdAt), "MMM d, h:mm a")}
                            </span>
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 rounded-md p-3">
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {sentiment.reason}
                          </p>
                        </div>
                        
                        <div className="mt-3 text-xs text-gray-500">
                          Week: {format(new Date(sentiment.weekStart), "MMM d")} - {format(new Date(sentiment.weekEnd), "MMM d, yyyy")}
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
