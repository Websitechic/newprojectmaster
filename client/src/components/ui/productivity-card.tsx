import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Target } from "lucide-react";

interface ProductivityCardProps {
  assignedTime: number; // in seconds
  actualTime: number; // in seconds
  taskCount?: number;
  period?: string;
}

export function ProductivityCard({ 
  assignedTime, 
  actualTime, 
  taskCount = 0,
  period = "Today" 
}: ProductivityCardProps) {
  // Ensure we have valid numbers
  const safeAssignedTime = Math.max(0, assignedTime || 0);
  const safeActualTime = Math.max(0, actualTime || 0);
  const safeTaskCount = Math.max(0, taskCount || 0);
  
  // Calculate productivity percentage (time efficiency)
  // Higher productivity = more work done in less time
  const productivity = safeAssignedTime > 0 && safeActualTime > 0 ? 
    Math.min(100, Math.max(0, Math.round((safeAssignedTime / safeActualTime) * 100))) : 
    (safeActualTime > 0 && safeAssignedTime === 0 ? 50 : 0); // Default to 50% if no assigned time but work was done

  // Determine status based on productivity (efficiency)
  const getStatusInfo = (productivity: number, actualTime: number, assignedTime: number) => {
    if (actualTime === 0 && assignedTime === 0) {
      return {
        status: "No Activity",
        color: "text-gray-600",
        bgColor: "bg-gray-50"
      };
    }
    
    if (actualTime === 0) {
      return {
        status: "No Work Logged",
        color: "text-gray-600",
        bgColor: "bg-gray-50"
      };
    }

    if (assignedTime === 0) {
      return {
        status: "Unplanned Work",
        color: "text-blue-600",
        bgColor: "bg-blue-50"
      };
    }

    // Base status on productivity percentage
    if (productivity >= 90) {
      return {
        status: "Excellent",
        color: "text-green-600",
        bgColor: "bg-green-50"
      };
    } else if (productivity >= 75) {
      return {
        status: "Good",
        color: "text-blue-600", 
        bgColor: "bg-blue-50"
      };
    } else if (productivity >= 60) {
      return {
        status: "Average",
        color: "text-yellow-600",
        bgColor: "bg-yellow-50"
      };
    } else if (productivity >= 40) {
      return {
        status: "Below Average",
        color: "text-orange-600",
        bgColor: "bg-orange-50"
      };
    } else {
      return {
        status: "Needs Improvement",
        color: "text-red-600",
        bgColor: "bg-red-50"
      };
    }
  };

  const statusInfo = getStatusInfo(productivity, safeActualTime, safeAssignedTime);
  const isEfficient = productivity >= 75;

  // Format time for display
  const formatTime = (seconds: number) => {
    const safeSeconds = Math.max(0, seconds || 0);
    if (safeSeconds <= 0) return "0h 0m";
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Productivity Score</CardTitle>
          <div className="flex items-center gap-1">
            {isEfficient ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
        <CardDescription>{period} performance overview</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main Productivity Score */}
        <div className="text-center">
          <div className={`text-4xl font-bold mb-2 ${statusInfo.color}`}>
            {productivity}%
          </div>
          <Badge 
            variant="secondary" 
            className={`${statusInfo.color} ${statusInfo.bgColor} border-0`}
          >
            {statusInfo.status}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Efficiency</span>
            <span>{productivity}%</span>
          </div>
          <Progress 
            value={Math.min(productivity, 100)} 
            className="h-2"
          />
        </div>

        {/* Time Breakdown */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="text-center">
            <div className="text-gray-600">Assigned</div>
            <div className="font-semibold">{formatTime(safeAssignedTime)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-600">Actual</div>
            <div className="font-semibold">{formatTime(safeActualTime)}</div>
          </div>
        </div>

        {/* Task Count */}
        <div className="text-center">
          <div className="text-gray-600 text-sm">Tasks Worked On</div>
          <div className="text-lg font-semibold">{safeTaskCount}</div>
        </div>

        {/* Additional Metrics */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Target className="h-4 w-4" />
            <span>{safeTaskCount} tasks</span>
          </div>
          <div className="text-sm text-gray-600">
            {safeActualTime > safeAssignedTime ? (
              <span className="text-red-600">
                +{formatTime(safeActualTime - safeAssignedTime)} over
              </span>
            ) : safeAssignedTime > safeActualTime ? (
              <span className="text-green-600">
                -{formatTime(safeAssignedTime - safeActualTime)} under
              </span>
            ) : (
              <span className="text-gray-600">On target</span>
            )}
          </div>
        </div>

        {/* Performance Indicator */}
        {safeActualTime > 0 && (
          <div className="text-xs text-gray-500 text-center pt-2">
            {(() => {
              if (productivity >= 90) {
                return "🎉 Excellent efficiency! You're completing tasks quickly and effectively.";
              } else if (productivity >= 75) {
                return "👍 Good productivity! Keep up the great work.";
              } else if (productivity >= 60) {
                return "⚠️ Average performance. Consider optimizing your workflow.";
              } else if (productivity >= 40) {
                return "📊 Below average efficiency. Focus on time management.";
              } else if (safeAssignedTime > 0) {
                return "📈 Improvement needed. Tasks are taking longer than estimated.";
              } else {
                return "📝 Working on unplanned tasks. Consider better planning.";
              }
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}