
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
  // Calculate productivity percentage using the formula:
  // Productivity = (Assigned Task Time / Actual Task Time) * 100
  const calculateProductivity = () => {
    if (actualTime === 0) return 0;
    return Math.round((assignedTime / actualTime) * 100);
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const productivity = calculateProductivity();
  
  // Determine productivity status
  const getProductivityStatus = () => {
    if (productivity >= 100) return { status: "excellent", color: "text-green-600", bgColor: "bg-green-100" };
    if (productivity >= 80) return { status: "good", color: "text-blue-600", bgColor: "bg-blue-100" };
    if (productivity >= 60) return { status: "average", color: "text-yellow-600", bgColor: "bg-yellow-100" };
    return { status: "needs improvement", color: "text-red-600", bgColor: "bg-red-100" };
  };

  const statusInfo = getProductivityStatus();
  
  // Determine if productivity is trending up or down (simplified comparison)
  const isEfficient = productivity >= 80;

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
          <div className="text-4xl font-bold mb-2" style={{ color: statusInfo.color.replace('text-', '') }}>
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
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Assigned Time</div>
            <div className="font-semibold text-blue-600">
              {formatTime(assignedTime)}
            </div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Actual Time</div>
            <div className="font-semibold text-orange-600">
              {formatTime(actualTime)}
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Target className="h-4 w-4" />
            <span>{taskCount} tasks</span>
          </div>
          <div className="text-sm text-gray-600">
            {actualTime > assignedTime ? (
              <span className="text-red-600">
                +{formatTime(actualTime - assignedTime)} over
              </span>
            ) : assignedTime > actualTime ? (
              <span className="text-green-600">
                -{formatTime(assignedTime - actualTime)} under
              </span>
            ) : (
              <span className="text-gray-600">On target</span>
            )}
          </div>
        </div>

        {/* Performance Indicator */}
        {productivity > 0 && (
          <div className="text-xs text-gray-500 text-center pt-2">
            {productivity >= 100 
              ? "🎉 Excellent! You're completing tasks within estimated time."
              : productivity >= 80 
              ? "👍 Good productivity! Minor time overruns."
              : productivity >= 60 
              ? "⚠️ Average performance. Consider optimizing workflow."
              : "📈 Focus needed. Significant time overruns detected."
            }
          </div>
        )}
      </CardContent>
    </Card>
  );
}
