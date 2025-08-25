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
  
  // Calculate productivity percentage based on actual work done vs expected work
  // If no assigned time, use task count * 2 hours as a rough estimate
  const estimatedAssignedTime = safeAssignedTime > 0 ? safeAssignedTime : (safeTaskCount * 2 * 3600);
  
  let productivity = 0;
  
  if (safeActualTime > 0) {
    if (estimatedAssignedTime > 0) {
      // Standard efficiency calculation (assigned/actual * 100)
      productivity = Math.min(100, Math.round((estimatedAssignedTime / safeActualTime) * 100));
    } else {
      // If actively working but no assigned time, show based on hours worked
      const hoursWorked = safeActualTime / 3600;
      if (hoursWorked >= 4) productivity = 85;
      else if (hoursWorked >= 2) productivity = 70;
      else if (hoursWorked >= 1) productivity = 50;
      else productivity = 30;
    }
  } else if (safeTaskCount > 0) {
    // Has tasks but no time logged - show low productivity
    productivity = 20;
  } else {
    // No activity
    productivity = 0;
  }

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
        <div className="text-xs text-gray-500 text-center pt-2">
          {(() => {
            if (safeActualTime === 0 && safeTaskCount === 0) {
              return "⏰ No activity recorded yet today. Start a task timer to track your productivity!";
            } else if (safeActualTime === 0 && safeTaskCount > 0) {
              return "🚀 Tasks assigned but no time tracked. Start your timers to measure productivity!";
            } else if (productivity >= 90) {
              return "🎉 Excellent efficiency! You're completing tasks quickly and effectively.";
            } else if (productivity >= 75) {
              return "👍 Good productivity! Keep up the great work.";
            } else if (productivity >= 60) {
              return "⚠️ Average performance. Consider optimizing your workflow.";
            } else if (productivity >= 40) {
              return "📊 Below average efficiency. Focus on time management.";
            } else if (estimatedAssignedTime > 0) {
              return "📈 Tasks taking longer than expected. Review your approach or break them down.";
            } else {
              return "📝 Working on tasks. Track your time more consistently for better insights.";
            }
          })()}
        </div>
      </CardContent>
    </Card>
  );
}