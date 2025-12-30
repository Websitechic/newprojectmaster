
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingDown } from "lucide-react";

interface StopGapAllocation {
  id: number;
  userId: number;
  monthYear: string;
  totalHours: number;
  usedHours: number;
  remainingHours: number;
}

export function StopGapCard() {
  const { data: allocation, isLoading } = useQuery<StopGapAllocation>({
    queryKey: ["/api/stop-gap/current"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const formatTime = (minutes: number) => {
    if (!minutes || isNaN(minutes)) return "0m";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStatusColor = (remaining: number, total: number) => {
    const percentage = (remaining / total) * 100;
    if (percentage > 60) return "text-green-600";
    if (percentage > 30) return "text-yellow-600";
    return "text-red-600";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Stop Gap Time
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!allocation) {
    return null;
  }

  // All values are already in minutes from the database
  const remainingMinutes = allocation.remainingHours || 0;
  const usedMinutes = allocation.usedHours || 0;
  const totalMinutes = (allocation.totalHours || 5) * 60; // totalHours is the only one stored as hours
  const percentage = Math.round((remainingMinutes / totalMinutes) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Stop Gap Time
        </CardTitle>
        <CardDescription>Monthly allocation for task extensions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-3xl font-bold ${getStatusColor(remainingMinutes, totalMinutes)}`}>
              {formatTime(remainingMinutes)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Remaining</p>
          </div>
          <Badge variant={percentage > 60 ? "default" : percentage > 30 ? "secondary" : "destructive"}>
            {percentage}%
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Used this month</span>
            <span className="font-medium">{formatTime(usedMinutes)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total allocation</span>
            <span className="font-medium">{formatTime(totalMinutes)}</span>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              percentage > 60 ? 'bg-green-500' : percentage > 30 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {remainingMinutes === 0 && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <TrendingDown className="h-4 w-4" />
            <span>Stop gap exhausted for this month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
